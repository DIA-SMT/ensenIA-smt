/**
 * Resumen de las notas PUBLICADAS de un estudiante.
 *
 * Reemplaza a las columnas attendance / average / progress / status de la
 * tabla students: esas las llenaba solo el seed de demo y ninguna función
 * de la app las calcula. Un estudiante real recién cargado le habría
 * mostrado a su familia "Asistencia 0 %, Promedio 0". Esto sale de la
 * libreta: lo que el docente publicó, nada más.
 *
 * La asistencia no se resume porque la plataforma no la registra.
 */

import type { AlertThresholds, TermGrade } from '../types';

export interface ResumenNotas {
  /** El trimestre más reciente con notas publicadas. */
  trimestre: string;
  termId: string;
  promedio: number;
  materias: number;
  /** Nota en la franja de aviso (≤ umbral de riesgo y > umbral de desaprobación). */
  conAviso: number;
  aDiciembre: number;
}

export function resumirNotas(
  notas: TermGrade[],
  umbrales: Pick<AlertThresholds, 'gradeRiskMax' | 'gradeFailMax'>,
): ResumenNotas | null {
  const conNota = notas.filter((n): n is TermGrade & { grade: number } => n.grade !== null);
  if (conNota.length === 0) return null;

  // Trimestre más reciente: el de número más alto (y, si empatan años, el último que aparece).
  const ultimo = conNota.reduce((a, b) => ((b.termNumber ?? 0) >= (a.termNumber ?? 0) ? b : a));
  const delTrimestre = conNota.filter(n => n.termId === ultimo.termId);
  const suma = delTrimestre.reduce((s, n) => s + n.grade, 0);

  return {
    trimestre: ultimo.termName ?? 'Trimestre',
    termId: ultimo.termId,
    promedio: Math.round((suma / delTrimestre.length) * 10) / 10,
    materias: delTrimestre.length,
    conAviso: delTrimestre.filter(n => n.grade <= umbrales.gradeRiskMax && n.grade > umbrales.gradeFailMax).length,
    aDiciembre: delTrimestre.filter(n => n.carriesToDecember).length,
  };
}

/** Promedio simple de notas publicadas, o null si no hay ninguna. */
export function promedioDe(notas: { grade: number | null }[]): number | null {
  const v = notas.map(n => n.grade).filter((g): g is number => g !== null);
  if (v.length === 0) return null;
  return Math.round((v.reduce((s, g) => s + g, 0) / v.length) * 10) / 10;
}

export function formatoNota(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
