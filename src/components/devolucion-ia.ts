/**
 * SMT EstudIA — Devolución sugerida por la IA
 *
 * Lo que más tiempo le lleva al docente al corregir es escribir la
 * devolución. Esto arma un borrador corto (y una nota sugerida cuando hay
 * respuestas abiertas) que cae en el mismo campo de siempre: el docente lo
 * lee, lo cambia y guarda como hoy. Nunca se guarda solo.
 *
 * Al pedido va SOLO la actividad y las respuestas: ni el nombre del
 * estudiante ni ningún otro dato personal.
 */

import { pedirIA } from '../services/ia-pedido.service';
import type { ActivityAnswer, ActivityQuestion } from '../types';

/** Cuántos caracteres de cada parte viajan como máximo (consigna, respuestas). */
const MAX_CONSIGNA = 1500;
const MAX_RESPUESTA = 1200;

export interface DatosDevolucion {
  titulo: string;
  descripcion?: string | null;
  consigna?: string | null;
  preguntas: ActivityQuestion[];
  respuestas: Record<string, ActivityAnswer>;
  /** Texto libre de la entrega, cuando la actividad no tenía cuestionario. */
  textoLibre?: string | null;
  /** Puntaje máximo de la actividad (null = sobre 10, como el autocorregido). */
  puntos: number | null;
}

export interface Devolucion {
  /** Nota sugerida; null si no corresponde (solo opción múltiple) o no vino. */
  puntaje: number | null;
  devolucion: string;
}

function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+\n/g, '\n').trim();
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}

/** ¿La entrega tiene algo que la máquina no corrige (respuestas abiertas o texto libre)? */
export function tieneRespuestasAbiertas(d: Pick<DatosDevolucion, 'preguntas' | 'textoLibre'>): boolean {
  if (d.preguntas.length === 0) return !!d.textoLibre?.trim();
  return d.preguntas.some(q => q.type !== 'multiple_choice');
}

export function armarPromptDevolucion(d: DatosDevolucion): string {
  const escala = d.puntos ?? 10;
  const conNota = tieneRespuestasAbiertas(d);
  const partes: string[] = [];

  partes.push(
    'Sos docente de secundaria y vas a escribir la devolución de una entrega de un o una estudiante de 13 a 17 años.',
    '',
    `## Actividad: ${recortar(d.titulo, 200)}`,
  );
  if (d.descripcion?.trim()) partes.push(recortar(d.descripcion, 400));
  if (d.consigna?.trim()) partes.push('', '### Consigna', recortar(d.consigna, MAX_CONSIGNA));

  if (d.preguntas.length > 0) {
    partes.push('', '### Preguntas y respuestas de la entrega');
    d.preguntas.forEach((q, i) => {
      const ans = d.respuestas?.[q.id];
      partes.push('', `${i + 1}. ${recortar(q.prompt, 400)}`);
      if (q.type === 'multiple_choice') {
        const correcta = q.correct_index != null ? q.options?.[q.correct_index] : undefined;
        const idx = ans?.answer != null && ans.answer !== '' ? Number(ans.answer) : NaN;
        const elegida = Number.isInteger(idx) ? q.options?.[idx] : undefined;
        partes.push('   (Opción múltiple, ya corregida automáticamente)');
        if (correcta) partes.push(`   Respuesta esperada: ${recortar(correcta, 200)}`);
        partes.push(elegida
          ? `   Eligió: ${recortar(elegida, 200)} → ${ans?.correct ? 'correcta' : 'incorrecta'}`
          : '   No respondió.');
      } else {
        const texto = ans?.answer != null ? String(ans.answer).trim() : '';
        partes.push('   (Respuesta abierta)');
        partes.push(texto ? `   Respondió: «${recortar(texto, MAX_RESPUESTA)}»` : '   No respondió.');
      }
    });
  } else if (d.textoLibre?.trim()) {
    partes.push('', '### Lo que entregó', `«${recortar(d.textoLibre, MAX_RESPUESTA * 2)}»`);
  }

  partes.push(
    '',
    '## Qué tenés que escribir',
    '- Una devolución de 2 a 4 oraciones, cálida y concreta, hablándole al estudiante de "vos" (voseo rioplatense).',
    '- Señalá UNA fortaleza puntual de esta entrega y UN próximo paso concreto para mejorar.',
    '- No pongas la nota ni números de puntaje dentro del texto.',
    '- No uses nombres (ni inventes uno), no saludes con "Hola" ni firmes.',
    '- Sin markdown, sin listas, sin emojis.',
    conNota
      ? `- Sugerí un puntaje sobre ${escala} para la entrega completa. Las de opción múltiple ya están corregidas: contalas tal cual y evaluá las abiertas con criterio de secundaria.`
      : '- La entrega es solo de opción múltiple y la nota ya la puso el autocorregido: en "puntaje" poné null.',
    '',
    'Respondé ÚNICAMENTE con este bloque JSON, sin nada antes ni después:',
    '```json',
    `{"puntaje": ${conNota ? `<número de 0 a ${escala}>` : 'null'}, "devolucion": "<el texto>"}`,
    '```',
  );

  return partes.join('\n');
}

function limpiarTexto(t: string): string {
  return t
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*["«]|["»]\s*$/g, '')
    .trim();
}

function normalizarPuntaje(valor: unknown, escala: number): number | null {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(Math.max(n, 0), escala) * 10) / 10;
}

/**
 * Lee la respuesta de la IA: primero el JSON pedido; si no vino bien, lo
 * que se pueda rescatar; y si no, el texto entero como devolución.
 */
export function interpretarDevolucion(texto: string, puntos: number | null, conNota: boolean): Devolucion {
  const escala = puntos ?? 10;
  const bloque = texto.match(/\{[\s\S]*\}/);
  if (bloque) {
    try {
      const obj = JSON.parse(bloque[0]) as Record<string, unknown>;
      const dev = typeof obj.devolucion === 'string' ? obj.devolucion
        : typeof obj['devolución'] === 'string' ? obj['devolución'] as string : '';
      if (dev.trim()) {
        return {
          puntaje: conNota ? normalizarPuntaje(obj.puntaje, escala) : null,
          devolucion: limpiarTexto(dev),
        };
      }
    } catch { /* sigue abajo */ }
    // JSON roto (comillas sin escapar, por ejemplo): rescatar a mano
    const dev = bloque[0].match(/"devoluci[oó]n"\s*:\s*"([\s\S]*?)"\s*[,}]/);
    const pts = bloque[0].match(/"puntaje"\s*:\s*"?(-?[\d.,]+)/);
    if (dev?.[1]?.trim()) {
      return {
        puntaje: conNota && pts ? normalizarPuntaje(pts[1], escala) : null,
        devolucion: limpiarTexto(dev[1].replace(/\\n/g, ' ').replace(/\\"/g, '"')),
      };
    }
  }
  // Respuesta cortada a mitad del JSON (sin la llave de cierre): se rescata
  // lo que haya del texto, en vez de mostrarle al docente el JSON crudo.
  if (/"devoluci[oó]n"\s*:/.test(texto)) {
    const resto = texto.split(/"devoluci[oó]n"\s*:\s*"/)[1] ?? '';
    const dev = resto.replace(/"\s*[,}][\s\S]*$/, '').replace(/\\n/g, ' ').replace(/\\"/g, '"');
    const pts = texto.match(/"puntaje"\s*:\s*"?(-?[\d.,]+)/);
    if (dev.trim()) {
      return {
        puntaje: conNota && pts ? normalizarPuntaje(pts[1], escala) : null,
        devolucion: limpiarTexto(dev),
      };
    }
    return { puntaje: null, devolucion: '' };
  }
  return { puntaje: null, devolucion: limpiarTexto(texto) };
}

export interface PedidoDevolucion extends DatosDevolucion {
  teacherId: string;
  materia: string;
  curso: string;
  signal?: AbortSignal;
}

/**
 * Pide el borrador. Devuelve null si se canceló. Tira un Error con un
 * mensaje para mostrar (cuota, red, respuesta vacía).
 */
export async function sugerirDevolucion({ teacherId, materia, curso, signal, ...datos }: PedidoDevolucion): Promise<Devolucion | null> {
  const texto = await pedirIA({
    teacherId,
    sesion: 'Devoluciones',
    prompt: armarPromptDevolucion(datos),
    contexto: { subjectName: materia, courseName: curso },
    // 'eval' arma una evaluación entera con tablas y rúbrica: acá sobra.
    tool: 'free',
    signal,
  }).catch(err => {
    if (signal?.aborted) return null;
    throw err;
  });
  if (texto === null || signal?.aborted) return null;
  const resultado = interpretarDevolucion(texto, datos.puntos, tieneRespuestasAbiertas(datos));
  if (!resultado.devolucion) throw new Error('La IA no devolvió una devolución. Probá de nuevo.');
  return resultado;
}
