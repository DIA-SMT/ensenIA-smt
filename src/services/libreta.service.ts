/**
 * SMT EstudIA — Libreta digital (migración 015)
 *
 * Régimen de Tucumán para secundaria: 3 trimestres con nota numérica
 * 1-10, se aprueba con 6, el promedio anual sale de los tres trimestres
 * y quien no llega tiene instancias de diciembre (term 4) y febrero
 * (term 5). El boletín registra además las inasistencias por trimestre
 * y la valoración de la convivencia.
 */

import { supabase, unwrap } from './_helpers';

export type Conduct = 'muy_buena' | 'buena' | 'regular' | 'mala';

export const CONDUCT_META: Record<Conduct, { short: string; label: string }> = {
  muy_buena: { short: 'MB', label: 'Muy buena' },
  buena: { short: 'B', label: 'Buena' },
  regular: { short: 'R', label: 'Regular' },
  mala: { short: 'M', label: 'Mala' },
};

export const TERM_LABELS: Record<number, string> = {
  1: '1er trimestre',
  2: '2do trimestre',
  3: '3er trimestre',
  4: 'Diciembre',
  5: 'Febrero',
};

/** Nota mínima de aprobación en Tucumán. */
export const PASSING_GRADE = 6;

/**
 * Rangos de fecha de cada trimestre (ciclo lectivo de Tucumán, aprox.).
 * Se usan para contar inasistencias por trimestre; si el calendario
 * cambia, se ajusta acá.
 */
export const TERM_RANGES: Record<1 | 2 | 3, { from: string; to: string }> = {
  1: { from: '-03-01', to: '-05-31' },
  2: { from: '-06-01', to: '-08-31' },
  3: { from: '-09-01', to: '-11-30' },
};

export interface ReportGrade {
  id: string;
  studentId: string;
  subjectId: string;
  courseId: string;
  schoolYear: number;
  term: number;
  grade: number | null;
  conduct: Conduct | null;
  comment: string | null;
}

function mapGrade(row: any): ReportGrade {
  return {
    id: row.id,
    studentId: row.student_id,
    subjectId: row.subject_id,
    courseId: row.course_id,
    schoolYear: row.school_year,
    term: row.term,
    grade: row.grade != null ? Number(row.grade) : null,
    conduct: row.conduct ?? null,
    comment: row.comment ?? null,
  };
}

export async function getGradesForCourse(
  subjectId: string,
  courseId: string,
  schoolYear: number,
): Promise<ReportGrade[]> {
  const data = unwrap(
    await supabase
      .from('report_grades')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
      .eq('school_year', schoolYear)
  );
  return data.map(mapGrade);
}

/** La libreta completa de un estudiante (todas sus materias del año). */
export async function getGradesByStudent(studentId: string, schoolYear: number): Promise<ReportGrade[]> {
  const data = unwrap(
    await supabase
      .from('report_grades')
      .select('*')
      .eq('student_id', studentId)
      .eq('school_year', schoolYear)
  );
  return data.map(mapGrade);
}

export async function upsertGrade(g: {
  studentId: string;
  subjectId: string;
  courseId: string;
  teacherId: string;
  schoolYear: number;
  term: number;
  grade: number | null;
  conduct: Conduct | null;
  comment: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('report_grades')
    .upsert(
      {
        student_id: g.studentId,
        subject_id: g.subjectId,
        course_id: g.courseId,
        teacher_id: g.teacherId,
        school_year: g.schoolYear,
        term: g.term,
        grade: g.grade,
        conduct: g.conduct,
        comment: g.comment,
      },
      { onConflict: 'student_id,subject_id,school_year,term' },
    );
  if (error) throw error;
}

/**
 * Estado anual de un estudiante en una materia según el régimen:
 * promedio de los 3 trimestres; si no llega a 6, vale diciembre y
 * después febrero.
 */
export function yearSummary(grades: ReportGrade[]): {
  average: number | null;
  final: number | null;
  status: 'aprobado' | 'diciembre' | 'febrero' | 'pendiente' | 'incompleto';
} {
  const byTerm = new Map(grades.map(g => [g.term, g.grade]));
  const t = [byTerm.get(1), byTerm.get(2), byTerm.get(3)];
  if (t.some(x => x == null)) return { average: null, final: null, status: 'incompleto' };

  const average = Math.round(((t[0]! + t[1]! + t[2]!) / 3) * 100) / 100;
  if (average >= PASSING_GRADE) return { average, final: average, status: 'aprobado' };

  const dic = byTerm.get(4);
  if (dic == null) return { average, final: null, status: 'diciembre' };
  if (dic >= PASSING_GRADE) return { average, final: dic, status: 'aprobado' };

  const feb = byTerm.get(5);
  if (feb == null) return { average, final: null, status: 'febrero' };
  if (feb >= PASSING_GRADE) return { average, final: feb, status: 'aprobado' };
  return { average, final: feb, status: 'pendiente' };
}

/** Inasistencias por trimestre de todo un curso, en una sola consulta. */
export async function getAbsencesByTermForCourse(
  courseId: string,
  schoolYear: number,
): Promise<Record<string, [number, number, number]>> {
  const data = unwrap(
    await supabase
      .from('attendance_records')
      .select('student_id, status, session:attendance_sessions!inner(course_id, taken_on)')
      .eq('attendance_sessions.course_id', courseId)
      .in('status', ['ausente', 'tarde'])
  );
  const out: Record<string, [number, number, number]> = {};
  for (const r of data as any[]) {
    const date: string = r.session?.taken_on ?? '';
    if (!date.startsWith(String(schoolYear))) continue;
    let term: 0 | 1 | 2 | null = null;
    for (const t of [1, 2, 3] as const) {
      if (date >= `${schoolYear}${TERM_RANGES[t].from}` && date <= `${schoolYear}${TERM_RANGES[t].to}`) {
        term = (t - 1) as 0 | 1 | 2;
        break;
      }
    }
    if (term === null) continue;
    if (!out[r.student_id]) out[r.student_id] = [0, 0, 0];
    // La llegada tarde cuenta media falta, como en el papel
    out[r.student_id][term] += r.status === 'tarde' ? 0.5 : 1;
  }
  return out;
}
