/**
 * SMT EstudIA — Libreta de calificaciones (Fase 3)
 *
 * La plataforma SUGIERE la nota a partir del trabajo real del trimestre;
 * el docente la FIJA. La sugerencia nunca califica sola: es un punto de
 * partida que el docente acepta, corrige o ignora.
 *
 * Al publicar, la regla 5/4 corre en el servidor (trigger de la 011):
 * avisa a la familia y deja la señal en el tablero directivo.
 */

import { supabase, unwrap } from './_helpers';
import { getSubmissionsByActivityIds } from './activities.service';
import type {
  AcademicTerm, TermGrade, TermGradeStatus, GradebookRow, Student,
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
  };
}

/**
 * Nota sugerida 1-10 a partir de las entregas calificadas del trimestre.
 * Promedia el porcentaje logrado en cada actividad con puntaje, y lo lleva
 * a la escala 1-10. Sin entregas devuelve null: mejor no sugerir nada que
 * sugerir sobre aire — un alumno sin entregas NO recibe un 1 automático,
 * porque "no entregó" y "entregó mal" son cosas distintas y esa distinción
 * la hace el docente, no el promedio.
 */
export function suggestGrade(
  activities: { id: string; points: number | null }[],
  submissionsByStudent: Map<string, { activityId: string; score: number | null; autoScore: number | null }[]>,
  studentId: string,
): { suggested: number | null; from: number } {
  const pointsByActivity = new Map(
    activities.filter(a => a.points && a.points > 0).map(a => [a.id, a.points as number])
  );
  const mine = submissionsByStudent.get(studentId) ?? [];

  const pcts: number[] = [];
  for (const s of mine) {
    const points = pointsByActivity.get(s.activityId);
    if (!points) continue;
    const score = s.score ?? s.autoScore;
    if (score === null || score === undefined) continue;
    pcts.push(Math.min(1, score / points));
  }

  if (pcts.length === 0) return { suggested: null, from: 0 };
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  // Escala 1-10: nunca menos de 1, un decimal.
  const nota = Math.max(1, Math.round(avg * 10 * 10) / 10);
  return { suggested: nota, from: pcts.length };
}

/**
 * Libreta de una materia+curso en un trimestre: nómina, nota cargada y
 * sugerencia recalculada con el trabajo que cae dentro del trimestre.
 *
 * La NOTA es una sola por estudiante+materia+trimestre (UNIQUE en la 011):
 * si dos docentes comparten la materia, comparten la libreta — como en la
 * escuela real. La SUGERENCIA, en cambio, sale solo de las actividades
 * propias: la RLS de activity_submissions (003) no deja a un docente leer
 * las entregas de las actividades de su colega. Por eso la UI la rotula
 * como "tus actividades" en vez de aparentar que cubre todo el trimestre.
 */
export async function getGradebook(params: {
  subjectId: string;
  courseId: string;
  term: AcademicTerm;
  students: Student[];
  teacherId: string;
}): Promise<GradebookRow[]> {
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
      .select('id, points, created_at')
      .eq('teacher_id', teacherId)
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
      .gte('created_at', from)
      .lte('created_at', to)
  ) as unknown as { id: string; points: number | null; created_at: string }[];

  const activities = actRows.map(a => ({ id: a.id, points: a.points }));
  const activityIds = activities.map(a => a.id);

  const [subs, gradeRows] = await Promise.all([
    getSubmissionsByActivityIds(activityIds),
    supabase
      .from('term_grades')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
      .eq('term_id', term.id),
  ]);
  if (gradeRows.error) throw gradeRows.error;

  const submissionsByStudent = new Map<string, { activityId: string; score: number | null; autoScore: number | null }[]>();
  for (const s of subs) {
    if (s.status !== 'submitted' && s.status !== 'graded') continue;
    const arr = submissionsByStudent.get(s.studentId) ?? [];
    arr.push({ activityId: s.activityId, score: s.score ?? null, autoScore: s.autoScore ?? null });
    submissionsByStudent.set(s.studentId, arr);
  }

  const existing = new Map((gradeRows.data ?? []).map((r: any) => [r.student_id, mapGrade(r)]));

  return students.map(st => {
    const g = existing.get(st.id);
    const { suggested, from } = suggestGrade(activities, submissionsByStudent, st.id);
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
    };
  });
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
 * Guarda o publica la libreta. Insert-o-update explícito (no upsert):
 * los grants por columna de la 011 no permiten reenviar las claves en el
 * SET de un ON CONFLICT.
 */
export async function saveGrades(params: {
  subjectId: string;
  courseId: string;
  termId: string;
  schoolId: string;
  status: TermGradeStatus;
  rows: GradeSavePayload[];
}): Promise<void> {
  const { subjectId, courseId, termId, schoolId, status, rows } = params;

  const toInsert = rows.filter(r => !r.gradeId);
  const toUpdate = rows.filter(r => r.gradeId);

  /**
   * Reglas de estado por fila:
   *  - sin nota → 'borrador' (una casilla vacía no puede estar publicada);
   *  - ya publicada → sigue publicada aunque se guarde un borrador: "guardar"
   *    no puede retractarle a las familias una nota que ya recibieron;
   *  - el resto → lo que pidió el botón.
   */
  const statusFor = (r: GradeSavePayload): TermGradeStatus => {
    if (r.grade === null) return 'borrador';
    if (r.currentStatus === 'publicada') return 'publicada';
    return status;
  };

  if (toInsert.length > 0) {
    const { error } = await supabase.from('term_grades').insert(
      toInsert.map(r => ({
        student_id: r.studentId,
        subject_id: subjectId,
        course_id: courseId,
        term_id: termId,
        school_id: schoolId,
        grade: r.grade,
        suggested_grade: r.suggestedGrade,
        suggested_from: r.suggestedFrom,
        status: statusFor(r),
        teacher_note: r.teacherNote ?? null,
      }))
    );
    if (error) throw error;
  }

  // Uno por uno: cada fila tiene su propia nota y el volumen es un curso.
  for (const r of toUpdate) {
    const { error } = await supabase
      .from('term_grades')
      .update({
        grade: r.grade,
        suggested_grade: r.suggestedGrade,
        suggested_from: r.suggestedFrom,
        status: statusFor(r),
        teacher_note: r.teacherNote ?? null,
      })
      .eq('id', r.gradeId!);
    if (error) throw error;
  }
}

// ── Lectura para estudiante / familia / dirección ──

/** Notas publicadas de un estudiante (todas las materias del año). */
export async function getPublishedGradesByStudent(studentId: string): Promise<TermGrade[]> {
  const data = unwrap(
    await supabase
      .from('term_grades')
      .select('*, subjects(name), academic_terms(name, number)')
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
      .select('*, subjects(name), academic_terms(name, number)')
      .eq('school_id', schoolId)
      .eq('term_id', termId)
      .eq('status', 'publicada')
  );
  return data.map(mapGrade);
}
