/**
 * Evaluaciones del trimestre (migración 050): pruebas, trabajos prácticos,
 * orales... casi todo en papel. El docente carga la nota de cada alumno y
 * la libreta las muestra al lado de la nota del trimestre, junto con las
 * actividades de la app ya corregidas. El alumno y su familia las ven en
 * "Mis notas".
 */

import { supabase } from './_helpers';
import type { NotaItem } from '../types';

export type { NotaItem };

export type TipoEvaluacion = 'prueba' | 'tp' | 'oral' | 'trabajo' | 'concepto' | 'otra';

export const TIPOS_EVALUACION: Record<TipoEvaluacion, { label: string; emoji: string }> = {
  prueba: { label: 'Prueba escrita', emoji: '📝' },
  tp: { label: 'Trabajo práctico', emoji: '📂' },
  oral: { label: 'Oral', emoji: '🗣️' },
  trabajo: { label: 'Trabajo en clase', emoji: '✏️' },
  concepto: { label: 'Concepto', emoji: '⭐' },
  otra: { label: 'Otra', emoji: '📌' },
};

export interface Evaluacion {
  id: string;
  subjectId: string;
  courseId: string;
  termId: string;
  titulo: string;
  tipo: TipoEvaluacion;
  /** YYYY-MM-DD */
  fecha: string;
  /** studentId → nota o ausente */
  notas: Record<string, NotaItem>;
  /** Guardada en este equipo, todavía sin enviar */
  pendiente?: boolean;
}

/** Lo que se manda a guardar (la cola sin conexión guarda esto mismo). */
export interface EvaluacionAGuardar {
  id: string;
  subjectId: string;
  courseId: string;
  termId: string;
  titulo: string;
  tipo: TipoEvaluacion;
  fecha: string;
  notas: { studentId: string; nota: number | null; ausente: boolean }[];
}

const faltaLa050 = (code?: string) => code === '42P01' || code === 'PGRST205';

/** Las evaluaciones de una materia y curso en un trimestre, con sus notas. */
export async function getEvaluacionesDelTrimestre(subjectId: string, courseId: string, termId: string): Promise<Evaluacion[]> {
  const { data, error } = await supabase
    .from('assessments')
    .select('id, subject_id, course_id, term_id, title, kind, held_on, assessment_grades(student_id, grade, absent)')
    .eq('subject_id', subjectId)
    .eq('course_id', courseId)
    .eq('term_id', termId)
    .order('held_on')
    .order('created_at');
  if (error) {
    // Sin la 050 la libreta anda como antes, sin evaluaciones
    if (faltaLa050(error.code)) return [];
    throw error;
  }
  return (data ?? []).map(r => ({
    id: r.id,
    subjectId: r.subject_id,
    courseId: r.course_id,
    termId: r.term_id,
    titulo: r.title,
    tipo: r.kind as TipoEvaluacion,
    fecha: r.held_on,
    notas: Object.fromEntries((r.assessment_grades ?? []).map(g => [
      g.student_id,
      { nota: g.grade !== null ? Number(g.grade) : null, ausente: g.absent },
    ])),
  }));
}

/** La evaluación y todas sus notas, de una vez (todo o nada). Se puede reintentar. */
export async function guardarEvaluacion(e: EvaluacionAGuardar): Promise<void> {
  const { error } = await supabase.rpc('guardar_evaluacion', {
    p_id: e.id,
    p_subject: e.subjectId,
    p_course: e.courseId,
    p_term: e.termId,
    p_titulo: e.titulo.trim(),
    p_tipo: e.tipo,
    p_fecha: e.fecha,
    p_notas: e.notas.map(n => ({ student_id: n.studentId, nota: n.ausente ? null : n.nota, ausente: n.ausente })),
  });
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Falta correr la migración 050_evaluaciones_del_trimestre.sql en Supabase.');
    throw error;
  }
}

export async function borrarEvaluacion(id: string): Promise<void> {
  const { error } = await supabase.from('assessments').delete().eq('id', id);
  if (error) throw error;
}

// ── Lo que ve el alumno (y su familia) ──

/** Una nota del alumno: de una evaluación o de una actividad de la app. */
export interface NotaDelAlumno {
  id: string;
  subjectId: string;
  subjectName: string;
  /** 1, 2 o 3; null si no cae en ningún trimestre */
  trimestre: number | null;
  titulo: string;
  tipo: TipoEvaluacion | 'actividad';
  fecha: string;
  nota: number | null;
  ausente: boolean;
  sinCorregir: boolean;
}

/** Fecha local YYYY-MM-DD de un timestamp (el día del aula, no el de UTC). */
const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** De puntaje a la escala 1-10 de la libreta, con un decimal. */
export const notaDeActividad = (score: number, points: number) =>
  Math.max(1, Math.round(Math.min(1, score / points) * 100) / 10);

/**
 * Todas las notas del año de un alumno: las evaluaciones cargadas por sus
 * docentes y las actividades de la app ya corregidas (estas solo las ve el
 * propio alumno: la familia no lee las entregas).
 */
export async function getNotasDelAlumno(studentId: string, anio: number): Promise<NotaDelAlumno[]> {
  const [evals, entregas, trimestres] = await Promise.all([
    supabase
      .from('assessment_grades')
      .select('grade, absent, assessments(id, title, kind, held_on, subject_id, subjects(name), academic_terms(number, year))')
      .eq('student_id', studentId),
    supabase
      .from('activity_submissions')
      .select('id, score, auto_score, status, activities(id, title, points, subject_id, created_at, subjects(name))')
      .eq('student_id', studentId)
      .in('status', ['submitted', 'graded']),
    supabase.from('academic_terms').select('number, starts_on, ends_on').eq('year', anio),
  ]);

  const notas: NotaDelAlumno[] = [];
  if (evals.error && !faltaLa050(evals.error.code)) throw evals.error;
  type FilaEval = {
    grade: number | null; absent: boolean;
    assessments: { id: string; title: string; kind: string; held_on: string; subject_id: string; subjects: { name: string } | null; academic_terms: { number: number; year: number } | null } | null;
  };
  for (const g of (evals.data ?? []) as unknown as FilaEval[]) {
    const a = g.assessments;
    if (!a || a.academic_terms?.year !== anio) continue;
    notas.push({
      id: a.id, subjectId: a.subject_id, subjectName: a.subjects?.name ?? 'Materia',
      trimestre: a.academic_terms?.number ?? null, titulo: a.title, tipo: a.kind as TipoEvaluacion,
      fecha: a.held_on, nota: g.grade !== null ? Number(g.grade) : null, ausente: g.absent, sinCorregir: false,
    });
  }

  // Las actividades caen en el trimestre en que se crearon (como en la libreta del docente)
  const rangos = (trimestres.data ?? []) as { number: number; starts_on: string; ends_on: string }[];
  const trimestreDe = (dia: string) => rangos.find(t => t.starts_on <= dia && dia <= t.ends_on)?.number ?? null;
  type FilaEntrega = {
    id: string; score: number | null; auto_score: number | null; status: string;
    activities: { id: string; title: string; points: number | null; subject_id: string; created_at: string; subjects: { name: string } | null } | null;
  };
  for (const s of (entregas.error ? [] : entregas.data ?? []) as unknown as FilaEntrega[]) {
    const act = s.activities;
    if (!act?.points || act.points <= 0) continue;
    const dia = diaLocal(act.created_at);
    if (!dia.startsWith(String(anio))) continue;
    const puntaje = s.score ?? s.auto_score;
    notas.push({
      id: s.id, subjectId: act.subject_id, subjectName: act.subjects?.name ?? 'Materia',
      trimestre: trimestreDe(dia), titulo: act.title, tipo: 'actividad', fecha: dia,
      nota: puntaje !== null && puntaje !== undefined ? notaDeActividad(Number(puntaje), act.points) : null,
      ausente: false, sinCorregir: puntaje === null || puntaje === undefined,
    });
  }

  return notas.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
