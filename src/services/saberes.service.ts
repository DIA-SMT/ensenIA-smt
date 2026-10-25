/**
 * SMT EstudIA — Qué va logrando cada estudiante, por saber (080)
 *
 * Un saber es un NAP vinculado a un tema o, si el tema no tiene NAP, el tema
 * mismo. La evidencia: las actividades de esos temas entregadas y
 * corregidas (también en papel), como porcentaje del puntaje total.
 */

import { supabase } from '../lib/supabase';

export interface Saber {
  id: string;
  tipo: 'nap' | 'tema';
  titulo: string;
  /** El documento del NAP (para citar); null si es un tema */
  documento: string | null;
  temas: string[];
  actividades: number;
}

export interface ProgresoEstudiante {
  id: string;
  nombre: string;
  apellido: string;
  valores: Record<string, { pct: number; n: number }>;
}

export interface ProgresoSaberes { saberes: Saber[]; estudiantes: ProgresoEstudiante[] }

export type Nivel = 'logrado' | 'proceso' | 'todavia' | 'sin';

/** 60% o más es "Logrado" (el 6 de aprobación); 40 a 59, "En proceso"; menos, "Todavía no" */
export function nivelDe(v: { pct: number } | undefined): Nivel {
  if (!v) return 'sin';
  return v.pct >= 60 ? 'logrado' : v.pct >= 40 ? 'proceso' : 'todavia';
}

export const NIVEL: Record<Nivel, string> = {
  logrado: 'Logrado', proceso: 'En proceso', todavia: 'Todavía no', sin: 'Sin evidencia',
};

export async function getProgresoSaberes(subjectId: string, courseId: string): Promise<ProgresoSaberes> {
  const { data, error } = await supabase.rpc('progreso_saberes' as never, { p_subject: subjectId, p_course: courseId } as never);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Falta correr la migración 080_progreso_por_saberes.sql.');
    throw error;
  }
  const r = (data ?? {}) as Partial<ProgresoSaberes>;
  return { saberes: r.saberes ?? [], estudiantes: r.estudiantes ?? [] };
}
