/**
 * El CV docente en PDF, armado en el equipo con lo que el docente cargó en
 * su perfil (070). Sirve para presentar en concursos o en otra escuela: no
 * reemplaza las constancias certificadas, las ordena.
 *
 * Con las fuentes de base de jsPDF (Helvetica): los acentos, la ñ y el "°"
 * salen bien; los emojis no, por eso acá no hay ninguno.
 */

import type { AntecedenteDocente, PerfilDocente, TipoAntecedente } from '../types';

export const SECCIONES_CV: { tipo: TipoAntecedente; titulo: string }[] = [
  { tipo: 'titulo', titulo: 'Títulos' },
  { tipo: 'capacitacion', titulo: 'Capacitaciones y cursos' },
  { tipo: 'logro', titulo: 'Logros y reconocimientos' },
  { tipo: 'proyecto', titulo: 'Proyectos' },
  { tipo: 'publicacion', titulo: 'Publicaciones' },
];

export interface DatosCV {
  nombre: string;
  email: string;
  escuela?: string;
  /** "Lengua · 3° A", uno por asignación */
  materias: string[];
  perfil: PerfilDocente | null;
  antecedentes: AntecedenteDocente[];
}

/** Una línea de un antecedente: "Título · Institución · 2019 · 40 h" */
export function lineaAntecedente(a: AntecedenteDocente): string {
  return [a.titulo, a.institucion, a.anio ? String(a.anio) : '', a.horas ? `${a.horas} h` : '']
    .filter(Boolean).join(' · ');
}

export async function descargarCV(d: DatosCV): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margen = 18;
  const ancho = doc.internal.pageSize.getWidth() - margen * 2;
  const alto = doc.internal.pageSize.getHeight();
  let y = margen;

  const espacio = (mm: number) => {
    if (y + mm > alto - margen) { doc.addPage(); y = margen; }
  };
  const texto = (t: string, tam: number, estilo: 'normal' | 'bold' = 'normal', color = 30) => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(tam);
    doc.setTextColor(color);
    const lineas = doc.splitTextToSize(t, ancho) as string[];
    const alturaLinea = tam * 0.45;
    for (const l of lineas) {
      espacio(alturaLinea);
      doc.text(l, margen, y);
      y += alturaLinea;
    }
  };

  texto(d.nombre, 20, 'bold', 20);
  y += 1;
  texto([d.escuela, d.email].filter(Boolean).join(' · '), 10, 'normal', 90);
  const anioActual = new Date().getFullYear();
  if (d.perfil?.docenteDesde && d.perfil.docenteDesde <= anioActual) {
    const anios = anioActual - d.perfil.docenteDesde;
    texto(`Docente desde ${d.perfil.docenteDesde}${anios > 0 ? ` (${anios} ${anios === 1 ? 'año' : 'años'})` : ''}`, 10, 'normal', 90);
  }
  if (d.materias.length) texto(`Materias: ${d.materias.join(', ')}`, 10, 'normal', 90);
  y += 4;

  if (d.perfil?.sobreMi) {
    texto(d.perfil.sobreMi, 11);
    y += 3;
  }
  if (d.perfil?.intereses.length) {
    texto(`Intereses: ${d.perfil.intereses.join(', ')}`, 10, 'normal', 60);
    y += 3;
  }

  for (const s of SECCIONES_CV) {
    const items = d.antecedentes.filter(a => a.tipo === s.tipo);
    if (!items.length) continue;
    y += 3;
    espacio(14);
    texto(s.titulo, 13, 'bold', 20);
    doc.setDrawColor(200);
    doc.line(margen, y - 1, margen + ancho, y - 1);
    y += 3;
    for (const a of items) {
      texto(lineaAntecedente(a), 11);
      if (a.detalle) texto(a.detalle, 9.5, 'normal', 90);
      y += 2;
    }
    if (s.tipo === 'capacitacion') {
      const total = items.reduce((n, a) => n + (a.horas ?? 0), 0);
      if (total > 0) texto(`Total: ${total} horas`, 10, 'bold', 60);
    }
  }

  y += 4;
  texto(`Generado con SMT EstudIA el ${new Date().toLocaleDateString('es-AR')}. Los datos los cargó el o la docente.`, 8, 'normal', 140);

  const archivo = `CV ${d.nombre}`.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'CV docente';
  doc.save(`${archivo}.pdf`);
}
