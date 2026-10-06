/**
 * Materia × curso del docente: el orden con el que se agrupan sus materiales,
 * sus actividades y sus estudiantes. Un docente puede dar varias materias y
 * la misma materia en varios cursos.
 */

import type { SubjectAssignment } from '../types';

export interface Asignacion {
  /** "materia|curso" */
  clave: string;
  subjectId: string;
  subjectName: string;
  courseId: string;
  courseName: string;
  /** "Lengua · 2° A" */
  etiqueta: string;
}

const porNombre = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export const claveAsignacion = (subjectId: string, courseId: string | null | undefined) =>
  `${subjectId}|${courseId ?? '*'}`;

/** Las asignaciones sin repetir, ordenadas por materia y curso. */
export function asignacionesDe(
  subjects: SubjectAssignment[] | undefined,
  nombreMateria: (subjectId: string) => string,
): Asignacion[] {
  const vistas = new Map<string, Asignacion>();
  for (const s of subjects ?? []) {
    const clave = claveAsignacion(s.subjectId, s.courseId);
    if (vistas.has(clave)) continue;
    const subjectName = nombreMateria(s.subjectId) || 'Materia';
    vistas.set(clave, {
      clave,
      subjectId: s.subjectId,
      subjectName,
      courseId: s.courseId,
      courseName: s.courseName,
      etiqueta: `${subjectName} · ${s.courseName}`,
    });
  }
  return [...vistas.values()].sort((a, b) =>
    porNombre.compare(a.subjectName, b.subjectName) || porNombre.compare(a.courseName, b.courseName));
}

/** Cursos donde el docente da esa materia. */
export const cursosDeMateria = (asignaciones: Asignacion[], subjectId: string) =>
  asignaciones.filter(a => a.subjectId === subjectId);

/**
 * Dónde va un material: un curso, o (si la materia se da en más de un curso)
 * "todos mis cursos de esta materia" = courseId null.
 */
export interface DestinoMaterial {
  clave: string;
  subjectId: string;
  subjectName: string;
  courseId: string | null;
  etiqueta: string;
}

export function destinosDeMaterial(asignaciones: Asignacion[]): DestinoMaterial[] {
  const destinos: DestinoMaterial[] = [];
  const materias = [...new Set(asignaciones.map(a => a.subjectId))];
  for (const subjectId of materias) {
    const cursos = cursosDeMateria(asignaciones, subjectId);
    for (const a of cursos) {
      destinos.push({ clave: a.clave, subjectId, subjectName: a.subjectName, courseId: a.courseId, etiqueta: a.etiqueta });
    }
    if (cursos.length > 1) {
      destinos.push({
        clave: claveAsignacion(subjectId, null),
        subjectId,
        subjectName: cursos[0].subjectName,
        courseId: null,
        etiqueta: `${cursos[0].subjectName} · todos mis cursos`,
      });
    }
  }
  return destinos;
}

/** Cómo se nombra el destino de un material ya guardado. */
export function etiquetaDestino(
  asignaciones: Asignacion[],
  subjectId: string,
  subjectName: string,
  courseId: string | null | undefined,
): string {
  const cursos = cursosDeMateria(asignaciones, subjectId);
  if (courseId) {
    const a = cursos.find(c => c.courseId === courseId);
    return a ? a.etiqueta : subjectName;
  }
  // Sin curso y un solo curso de la materia: es ese curso
  if (cursos.length === 1) return cursos[0].etiqueta;
  return cursos.length > 1 ? `${subjectName} · todos tus cursos` : subjectName;
}
