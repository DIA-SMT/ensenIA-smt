/**
 * La escuela en números (migración 057): asistencia, notas del trimestre,
 * ánimo y evolución semanal, ya agregados en la base. Solo dirección.
 */

import { supabase } from './_helpers';

export interface CursoEnNumeros {
  courseId: string;
  nombre: string;
  estudiantes: number;
  /** Presentes (con tarde) sobre registros, últimos 30 días. null = sin listas tomadas */
  asistenciaPct: number | null;
  registrosAsistencia: number;
  /** Estudiantes con 3 o más ausencias en 30 días */
  conFaltasReiteradas: number;
  /** Promedio de las notas publicadas del trimestre en curso */
  promedio: number | null;
  notas: number;
  desaprobadas: number;
  /** Ánimo promedio de 1 a 5 (check-ins, 30 días) */
  animo: number | null;
  checkins: number;
}

export interface SemanaEnNumeros {
  /** Lunes de la semana, YYYY-MM-DD */
  semana: string;
  asistenciaPct: number | null;
  animo: number | null;
  checkins: number;
  entregas: number;
  actividades: number;
}

export interface ResumenEscuela {
  escuela: { asistenciaPct: number | null; registrosAsistencia: number; estudiantes: number };
  cursos: CursoEnNumeros[];
  notas: {
    trimestre: string | null;
    total: number;
    promedio: number | null;
    rangos: { rango: string; n: number }[];
    aDiciembre: number;
  };
  semanas: SemanaEnNumeros[];
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function getResumenEscuela(semanas = 12): Promise<ResumenEscuela | null> {
  const { data, error } = await supabase.rpc('resumen_escuela' as never, { p_semanas: semanas } as never);
  if (error) throw error;
  if (!data) return null;
  const d = data as unknown as ResumenEscuela;
  // Los numeric de Postgres llegan como texto o número según el caso
  return {
    escuela: { ...d.escuela, asistenciaPct: num(d.escuela?.asistenciaPct) },
    cursos: (d.cursos ?? []).map(c => ({
      ...c,
      asistenciaPct: num(c.asistenciaPct),
      promedio: num(c.promedio),
      animo: num(c.animo),
    })),
    notas: { ...d.notas, promedio: num(d.notas?.promedio), rangos: d.notas?.rangos ?? [] },
    semanas: (d.semanas ?? []).map(s => ({ ...s, asistenciaPct: num(s.asistenciaPct), animo: num(s.animo) })),
  };
}
