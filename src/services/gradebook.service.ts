/**
 * SMT EstudIA — Libreta de calificaciones (Fase 3)
 *
 * La plataforma SUGIERE la nota a partir del trabajo real del trimestre
 * (evaluaciones cargadas y actividades de la app); el docente la FIJA. La sugerencia nunca califica sola: es un punto de
 * partida que el docente acepta, corrige o ignora.
 *
 * Al publicar, el servidor aplica la regla de diciembre de la escuela
 * (triggers de la 011, regla por escuela desde la 046): avisa a la
 * familia y deja la señal en el tablero directivo.
 */

import { supabase, unwrap } from './_helpers';
import { getSubmissionsByActivityIds } from './activities.service';
import {
  getEvaluacionesDelTrimestre, notaDeActividad, type Evaluacion, type TipoEvaluacion,
} from './evaluaciones.service';
import type {
  AcademicTerm, TermGrade, TermGradeStatus, GradebookRow, Student, NotaItem,
} from '../types';

// ── Trimestres ──

function mapTerm(row: any): AcademicTerm {
  return {
    id: row.id,
    schoolId: row.school_id,
    year: row.year,
    number: row.number,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

export async function getTerms(schoolId: string, year?: number): Promise<AcademicTerm[]> {
  let q = supabase.from('academic_terms').select('*').eq('school_id', schoolId);
  if (year !== undefined) q = q.eq('year', year);
  const data = unwrap(await q.order('year').order('number'));
  return data.map(mapTerm);
}

/**
 * Crea los trimestres estándar del año si faltan y los devuelve.
 * Los aplica el servidor (011): una escuela nueva, o el 1° de enero,
 * no pueden dejar la libreta sin calendario.
 */
export async function ensureTerms(schoolId: string, year: number): Promise<AcademicTerm[]> {
  const { data, error } = await supabase.rpc('ensure_academic_terms', {
    p_school_id: schoolId,
    p_year: year,
  });
  if (error) {
    console.error('ensureTerms:', error.message);
    return [];
  }
  return (data ?? []).map(mapTerm);
}

/** El trimestre que contiene la fecha de hoy; si el año ya terminó, el último. */
export function pickCurrentTerm(terms: AcademicTerm[]): AcademicTerm | null {
  if (terms.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  return terms.find(t => t.startsOn <= today && today <= t.endsOn)
    ?? [...terms].reverse().find(t => t.endsOn < today)
    ?? terms[0];
}

// ── Notas ──

function mapGrade(row: any): TermGrade {
  return {
    id: row.id,
    studentId: row.student_id,
    subjectId: row.subject_id,
    courseId: row.course_id,
    termId: row.term_id,
    schoolId: row.school_id,
    grade: row.grade !== null ? Number(row.grade) : null,
    suggestedGrade: row.suggested_grade !== null ? Number(row.suggested_grade) : null,
    suggestedFrom: row.suggested_from ?? 0,
    status: row.status,
    carriesToDecember: row.carries_to_december,
    teacherNote: row.teacher_note,
    gradedAt: row.graded_at,
    subjectName: row.subjects?.name,
    termName: row.academic_terms?.name,
    termNumber: row.academic_terms?.number,
    termYear: row.academic_terms?.year,
  };
}

/**
 * Nota sugerida 1-10: el promedio de las notas del trimestre de ese alumno
 * (evaluaciones cargadas y actividades de la app corregidas). Los ausentes y
 * lo que falta corregir no cuentan. Sin ninguna nota devuelve null: mejor no
 * sugerir nada que sugerir sobre aire — un alumno sin notas NO recibe un 1
 * automático, porque "no hizo" y "le fue mal" son cosas distintas y esa
 * distinción la hace el docente, no el promedio.
 */
export function promedioDeNotas(notas: Record<string, NotaItem>): { suggested: number | null; from: number } {
  const v = Object.values(notas).map(n => n.nota).filter((n): n is number => n !== null);
  if (v.length === 0) return { suggested: null, from: 0 };
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  // Escala 1-10: nunca menos de 1, un decimal.
  return { suggested: Math.max(1, Math.round(avg * 10) / 10), from: v.length };
}

/** Una columna de la libreta: una evaluación cargada o una actividad de la app con puntaje. */
export interface ColumnaLibreta {
  id: string;
  origen: 'evaluacion' | 'actividad';
  tipo: TipoEvaluacion | 'actividad';
  titulo: string;
  /** YYYY-MM-DD */
  fecha: string;
  /** La evaluación completa, para editarla (solo las cargadas) */
  evaluacion?: Evaluacion;
}

export interface LibretaTrimestre {
  filas: GradebookRow[];
  columnas: ColumnaLibreta[];
}

/** Fecha local YYYY-MM-DD de un timestamp. */
const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Libreta de una materia+curso en un trimestre: nómina, nota cargada, las
 * notas que la explican (evaluaciones y actividades, una columna cada una)
 * y el promedio como sugerencia.
 *
 * La NOTA es una sola por estudiante+materia+trimestre (UNIQUE en la 011):
 * si dos docentes comparten la materia, comparten la libreta — como en la
 * escuela real. Las evaluaciones también se comparten (050). Las
 * ACTIVIDADES de la app, en cambio, son solo las propias: la RLS de
 * activity_submissions (003) no deja a un docente leer las entregas de las
 * actividades de su colega.
 */
export async function getGradebook(params: {
  subjectId: string;
  courseId: string;
  term: AcademicTerm;
  students: Student[];
  teacherId: string;
}): Promise<LibretaTrimestre> {
  const { subjectId, courseId, term, students, teacherId } = params;

  // Actividades del docente en esa materia+curso dentro del trimestre.
  // La ventana se arma con el día LOCAL (Argentina, UTC-3): con cortes en
  // UTC, una actividad creada la tarde del último día del trimestre caía
  // fuera de todos los trimestres.
  const from = new Date(`${term.startsOn}T00:00:00-03:00`).toISOString();
  const to = new Date(`${term.endsOn}T23:59:59.999-03:00`).toISOString();
  const actRows = unwrap(
    await supabase
      .from('activities')
      .select('id, title, points, created_at')
      .eq('teacher_id', teacherId)
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at')
  ) as unknown as { id: string; title: string; points: number | null; created_at: string }[];

  // Solo las que tienen puntaje se pueden pasar a la escala de la libreta
  const actividades = actRows.filter(a => a.points && a.points > 0);
  const pointsByActivity = new Map(actividades.map(a => [a.id, a.points as number]));

  const [subs, gradeRows, evaluaciones] = await Promise.all([
    getSubmissionsByActivityIds(actividades.map(a => a.id)),
    supabase
      .from('term_grades')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
      .eq('term_id', term.id),
    getEvaluacionesDelTrimestre(subjectId, courseId, term.id),
  ]);
  if (gradeRows.error) throw gradeRows.error;

  const columnas: ColumnaLibreta[] = [
    ...actividades.map(a => ({
      id: a.id, origen: 'actividad' as const, tipo: 'actividad' as const, titulo: a.title, fecha: diaLocal(a.created_at),
    })),
    ...evaluaciones.map(e => ({
      id: e.id, origen: 'evaluacion' as const, tipo: e.tipo, titulo: e.titulo, fecha: e.fecha, evaluacion: e,
    })),
  ].sort((x, y) => x.fecha.localeCompare(y.fecha));

  // Notas de cada alumno, por columna
  const notasPorAlumno = new Map<string, Record<string, NotaItem>>();
  const de = (studentId: string) => {
    let n = notasPorAlumno.get(studentId);
    if (!n) { n = {}; notasPorAlumno.set(studentId, n); }
    return n;
  };
  for (const s of subs) {
    if (s.status !== 'submitted' && s.status !== 'graded') continue;
    const points = pointsByActivity.get(s.activityId);
    if (!points) continue;
    const score = s.score ?? s.autoScore;
    de(s.studentId)[s.activityId] = score === null || score === undefined
      ? { nota: null, sinCorregir: true }
      : { nota: notaDeActividad(score, points) };
  }
  for (const e of evaluaciones) {
    for (const [studentId, n] of Object.entries(e.notas)) de(studentId)[e.id] = n;
  }

  const existing = new Map((gradeRows.data ?? []).map((r: any) => [r.student_id, mapGrade(r)]));

  const filas = students.map(st => {
    const g = existing.get(st.id);
    const notas = notasPorAlumno.get(st.id) ?? {};
    const { suggested, from } = promedioDeNotas(notas);
    return {
      studentId: st.id,
      firstName: st.firstName,
      lastName: st.lastName,
      avatarInitials: st.avatarInitials,
      gradeId: g?.id ?? null,
      grade: g?.grade ?? null,
      status: g?.status ?? 'borrador',
      carriesToDecember: g?.carriesToDecember ?? false,
      teacherNote: g?.teacherNote,
      suggestedGrade: suggested,
      suggestedFrom: from,
      notas,
    };
  });
  return { filas, columnas };
}

export interface GradeSavePayload {
  gradeId: string | null;
  studentId: string;
  grade: number | null;
  suggestedGrade: number | null;
  suggestedFrom: number;
  teacherNote?: string | null;
  /** Estado actual en la base: una nota ya publicada no se retracta sola. */
  currentStatus: TermGradeStatus;
}

/**
 * Guarda o publica la libreta: todas las filas de una vez, o ninguna
 * (guardar_notas_trimestre, migración 047). Antes iba alumno por alumno y
 * un corte de señal en el medio dejaba la mitad publicada. Se puede
 * reintentar: lo que ya había llegado se actualiza, no choca.
 *
 * Las reglas de estado por fila las aplica la base:
 *  - sin nota → 'borrador' (una casilla vacía no puede estar publicada);
 *  - ya publicada → sigue publicada aunque se guarde un borrador: "guardar"
 *    no puede retractarle a las familias una nota que ya recibieron;
 *  - el resto → lo que pidió el botón.
 */
export async function saveGrades(params: {
  subjectId: string;
  courseId: string;
  termId: string;
  status: TermGradeStatus;
  rows: Omit<GradeSavePayload, 'gradeId' | 'currentStatus'>[];
}): Promise<void> {
  const { subjectId, courseId, termId, status, rows } = params;
  const { error } = await supabase.rpc('guardar_notas_trimestre', {
    p_subject: subjectId,
    p_course: courseId,
    p_term: termId,
    p_status: status,
    p_filas: rows.map(r => ({
      student_id: r.studentId,
      grade: r.grade,
      suggested_grade: r.suggestedGrade,
      suggested_from: r.suggestedFrom,
      teacher_note: r.teacherNote ?? null,
    })),
  });
  if (error) throw error;
}

// ── Lectura para estudiante / familia / dirección ──

/** Notas publicadas de un estudiante (todas las materias del año). */
export async function getPublishedGradesByStudent(studentId: string): Promise<TermGrade[]> {
  const data = unwrap(
    await supabase
      .from('term_grades')
      .select('*, subjects(name), academic_terms(name, number, year)')
      .eq('student_id', studentId)
      .eq('status', 'publicada')
  );
  return data
    .map(mapGrade)
    .sort((a, b) => (a.termNumber ?? 0) - (b.termNumber ?? 0) || (a.subjectName ?? '').localeCompare(b.subjectName ?? ''));
}

/** Notas publicadas de toda la escuela en un trimestre (vista directiva). */
export async function getPublishedGradesBySchool(schoolId: string, termId: string): Promise<TermGrade[]> {
  const data = unwrap(
    await supabase
      .from('term_grades')
      .select('*, subjects(name), academic_terms(name, number, year)')
      .eq('school_id', schoolId)
      .eq('term_id', termId)
      .eq('status', 'publicada')
  );
  return data.map(mapGrade);
}
