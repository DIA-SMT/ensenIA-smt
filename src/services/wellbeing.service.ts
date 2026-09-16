/**
 * EstudIA — Bienestar y observaciones
 *
 * Check-ins emocionales de estudiantes y observaciones del docente:
 * la información "que no se ve" y que mejora la experiencia educativa.
 */

import { supabase, unwrap } from './_helpers';
import type {
  StudentCheckin, CheckinMoment, CheckinFeeling,
  StudentObservation, ObservationCategory,
} from '../types';

// ── Check-ins ──

function mapCheckin(row: any): StudentCheckin {
  return {
    id: row.id,
    studentId: row.student_id,
    activityId: row.activity_id,
    moment: row.moment,
    feeling: row.feeling,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

export async function saveCheckin(c: {
  studentId: string;
  activityId?: string | null;
  moment: CheckinMoment;
  feeling: CheckinFeeling;
  comment?: string;
}): Promise<void> {
  const { error } = await supabase.from('student_checkins').insert({
    student_id: c.studentId,
    activity_id: c.activityId ?? null,
    moment: c.moment,
    feeling: c.feeling,
    comment: c.comment?.trim() || null,
  });
  if (error) throw error;
}

export async function getCheckinsByActivity(activityId: string): Promise<StudentCheckin[]> {
  const data = unwrap(
    await supabase
      .from('student_checkins')
      .select('*')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true })
  );
  return data.map(mapCheckin);
}

export async function getCheckinsByStudent(studentId: string, limit = 20): Promise<StudentCheckin[]> {
  const data = unwrap(
    await supabase
      .from('student_checkins')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(limit)
  );
  return data.map(mapCheckin);
}

// ── Observaciones ──

function mapObservation(row: any): StudentObservation {
  return {
    id: row.id,
    studentId: row.student_id,
    teacherId: row.teacher_id,
    subjectId: row.subject_id,
    category: row.category,
    note: row.note,
    createdAt: row.created_at,
    teacherName: row.profiles ? `${row.profiles.first_name} ${row.profiles.last_name}` : undefined,
  };
}

export async function addObservation(o: {
  studentId: string;
  teacherId: string;
  subjectId?: string | null;
  category: ObservationCategory;
  note: string;
}): Promise<void> {
  const { error } = await supabase.from('student_observations').insert({
    student_id: o.studentId,
    teacher_id: o.teacherId,
    subject_id: o.subjectId ?? null,
    category: o.category,
    note: o.note.trim(),
  });
  if (error) throw error;
}

export async function getObservationsByStudent(studentId: string): Promise<StudentObservation[]> {
  const data = unwrap(
    await supabase
      .from('student_observations')
      .select('*, profiles(first_name, last_name)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(30)
  );
  return data.map(mapObservation);
}

export async function deleteObservation(id: string): Promise<void> {
  const { error } = await supabase.from('student_observations').delete().eq('id', id);
  if (error) throw error;
}

// ── Clima del aula ──
// Los estudiantes vienen diciendo cómo se sienten, pero hasta ahora eso
// solo se veía de a un estudiante por vez. Esto lo mira como curso.

export interface ClimateDay {
  date: string;
  avg: number;
  count: number;
}

export interface ClimateComment {
  studentId: string;
  studentName: string;
  feeling: CheckinFeeling;
  comment: string;
  createdAt: string;
}

export interface ClimateStudent {
  studentId: string;
  studentName: string;
  negatives: number;
  total: number;
  lastFeeling: CheckinFeeling;
}

export interface CourseClimate {
  total: number;
  avg: number | null;
  /** Diferencia entre la última mitad del período y la primera (positivo = mejorando). */
  trend: number | null;
  distribution: Record<CheckinFeeling, number>;
  byDay: ClimateDay[];
  comments: ClimateComment[];
  needsAttention: ClimateStudent[];
}

const FEELING_VALUE: Record<CheckinFeeling, number> = {
  genial: 5, bien: 4, neutral: 3, confundido: 2, frustrado: 1,
};

const NEGATIVE: CheckinFeeling[] = ['confundido', 'frustrado'];

export async function getCourseClimate(courseId: string, days = 30): Promise<CourseClimate> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const data = unwrap(
    await supabase
      .from('student_checkins')
      .select('feeling, comment, created_at, student_id, students!inner(course_id, first_name, last_name)')
      .eq('students.course_id', courseId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
  );

  const rows = data as any[];
  const distribution = { genial: 0, bien: 0, neutral: 0, confundido: 0, frustrado: 0 } as Record<CheckinFeeling, number>;
  const dayMap = new Map<string, { sum: number; n: number }>();
  const byStudent = new Map<string, ClimateStudent>();
  const comments: ClimateComment[] = [];

  for (const r of rows) {
    const feeling = r.feeling as CheckinFeeling;
    const name = r.students ? `${r.students.first_name} ${r.students.last_name}` : 'Estudiante';
    distribution[feeling] += 1;

    const day = String(r.created_at).slice(0, 10);
    const d = dayMap.get(day) ?? { sum: 0, n: 0 };
    d.sum += FEELING_VALUE[feeling];
    d.n += 1;
    dayMap.set(day, d);

    const st = byStudent.get(r.student_id) ?? { studentId: r.student_id, studentName: name, negatives: 0, total: 0, lastFeeling: feeling };
    st.total += 1;
    if (NEGATIVE.includes(feeling)) st.negatives += 1;
    st.lastFeeling = feeling;
    byStudent.set(r.student_id, st);

    if (r.comment?.trim()) {
      comments.push({
        studentId: r.student_id,
        studentName: name,
        feeling,
        comment: r.comment.trim(),
        createdAt: r.created_at,
      });
    }
  }

  const byDay: ClimateDay[] = [...dayMap.entries()]
    .map(([date, v]) => ({ date, avg: v.sum / v.n, count: v.n }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const total = rows.length;
  const avg = total > 0
    ? rows.reduce((acc, r) => acc + FEELING_VALUE[r.feeling as CheckinFeeling], 0) / total
    : null;

  // Tendencia: segunda mitad del período contra la primera
  let trend: number | null = null;
  if (byDay.length >= 4) {
    const mid = Math.floor(byDay.length / 2);
    const first = byDay.slice(0, mid);
    const last = byDay.slice(mid);
    const m = (arr: ClimateDay[]) => arr.reduce((a, d) => a + d.avg, 0) / arr.length;
    trend = m(last) - m(first);
  }

  return {
    total,
    avg,
    trend,
    distribution,
    byDay,
    comments: comments.slice(-12).reverse(),
    needsAttention: [...byStudent.values()]
      .filter(s => s.negatives >= 2)
      .sort((a, b) => b.negatives - a.negatives),
  };
}
