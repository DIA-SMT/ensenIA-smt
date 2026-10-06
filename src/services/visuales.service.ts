/**
 * SMT EstudIA — Diagramas y juegos de palabras a partir del material.
 *
 * La IA devuelve datos (process-document, modos 'diagram' y 'word_game'); el
 * armado y la validación son de lib/diagramas y lib/juegos. Se guardan como
 * material de la biblioteca con library_materials.visual (migración 054).
 */

import { supabase } from './_helpers';
import { callProcessDocument, uploadFile, updateMaterial } from './documents.service';
import { createMaterial } from './library.service';
import { normalizarDiagrama, diagramaATexto, type Diagrama, type VarianteDiagrama } from '../lib/diagramas';
import { juegoATexto, type JuegoPalabras, type PalabraPista } from '../lib/juegos';
import type { LibraryMaterial } from '../types';

interface Contexto { subjectName?: string; courseName?: string }

/** Pide el diagrama a la IA. Tira Error con un mensaje para mostrar. */
export async function generarDiagrama(
  texto: string, titulo: string, variante: VarianteDiagrama, contexto?: Contexto,
): Promise<Diagrama> {
  const { diagram, truncated } = await callProcessDocument<{ diagram: unknown; truncated?: boolean }>({
    mode: 'diagram', text: texto, title: titulo, variante, context: contexto,
  });
  // Si el modelo eligió otra variante, manda la que pidió el docente
  const d = normalizarDiagrama(diagram && typeof diagram === 'object' ? { ...diagram, variante } : diagram);
  if (!d) {
    throw new Error(truncated
      ? 'El diagrama salió cortado. Probá de nuevo o acotá el tema.'
      : 'La IA no pudo armar ese diagrama con este material. Probá con otro tipo de diagrama.');
  }
  return d;
}

export interface DatosJuego { titulo: string; palabras: PalabraPista[]; frase: string; pista: string }

/** Pide palabras con pistas y una frase clave. Sirven para el crucigrama y el criptograma. */
export async function generarDatosJuego(texto: string, titulo: string, contexto?: Contexto): Promise<DatosJuego> {
  const { game } = await callProcessDocument<{ game: { titulo?: string; palabras?: PalabraPista[]; frase?: string; pista_frase?: string } }>({
    mode: 'word_game', text: texto, title: titulo, context: contexto,
  });
  const palabras = (game?.palabras ?? []).filter(p => p?.respuesta && p?.pista);
  if (palabras.length < 4 || !game?.frase) {
    throw new Error('La IA no encontró suficientes conceptos en este material para armar el juego.');
  }
  return { titulo: game.titulo || titulo, palabras, frase: game.frase, pista: game.pista_frase ?? '' };
}

interface Destino {
  teacherId: string;
  schoolId: string;
  subjectId: string;
  subjectName: string;
  courseId?: string | null;
  unitName?: string;
}

/** PNG del diagrama → material de imagen, con el diagrama en visual y su texto para buscar. */
export async function guardarDiagrama(d: Diagrama, png: Blob, destino: Destino): Promise<LibraryMaterial> {
  const nombre = `${d.titulo.normalize('NFKD').replace(/[^\w\- ]/g, '').trim().slice(0, 50) || 'diagrama'}.png`;
  const archivo = new File([png], nombre, { type: 'image/png' });
  const { storagePath, fileSizeBytes } = await uploadFile(destino.teacherId, archivo);
  const mat = await createMaterial({
    title: `Diagrama: ${d.titulo}`.slice(0, 120),
    description: d.descripcion,
    fileType: 'image',
    fileName: nombre,
    fileSize: fileSizeBytes < 1024 * 1024 ? `${Math.round(fileSizeBytes / 1024)} KB` : `${(fileSizeBytes / 1048576).toFixed(1)} MB`,
    subjectId: destino.subjectId,
    subjectName: destino.subjectName,
    courseId: destino.courseId ?? null,
    unitName: destino.unitName,
    teacherId: destino.teacherId,
    schoolId: destino.schoolId,
    tags: ['diagrama', 'IA'],
    extractedText: diagramaATexto(d),
  });
  await updateMaterial(mat.id, { storagePath, fileSizeBytes });
  await guardarVisual(mat.id, d);
  return { ...mat, storagePath, fileSizeBytes, visual: d };
}

/** El juego armado → material de texto (las pistas; nunca las respuestas). */
export async function guardarJuego(j: JuegoPalabras, destino: Destino): Promise<LibraryMaterial> {
  const nombre = j.tipo === 'crucigrama' ? 'Crucigrama' : 'Criptograma';
  const mat = await createMaterial({
    title: `${nombre}: ${j.titulo}`.slice(0, 120),
    description: j.tipo === 'crucigrama'
      ? `${j.palabras.length} palabras para repasar el tema.`
      : 'Descubrí la frase: cada número es una letra.',
    fileType: 'doc',
    fileName: '',
    fileSize: '—',
    subjectId: destino.subjectId,
    subjectName: destino.subjectName,
    courseId: destino.courseId ?? null,
    unitName: destino.unitName,
    teacherId: destino.teacherId,
    schoolId: destino.schoolId,
    tags: ['juego', j.tipo],
    extractedText: juegoATexto(j),
  });
  await guardarVisual(mat.id, j);
  return { ...mat, visual: j };
}

async function guardarVisual(materialId: string, visual: Diagrama | JuegoPalabras): Promise<void> {
  const { error } = await supabase.from('library_materials').update({ visual: visual as never }).eq('id', materialId);
  if (error) throw error;
}
