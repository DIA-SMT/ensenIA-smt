/**
 * ENSEÑIA SMT — Bienestar y observaciones
 *
 * Check-ins emocionales de estudiantes y observaciones del docente:
 * la información "que no se ve" y que mejora la experiencia educativa.
 */

import { supabase, unwrap } from './_helpers';
import type {
  StudentCheckin, CheckinMoment, CheckinFeeling,
  StudentObservation, ObservationCategory,
  WellbeingSignal, WellbeingStatus,
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

// ── Señales de bienestar de Migue (017) ──
// Lo que Migue deriva cuando un estudiante escribe algo que preocupa.
// No es la conversación: es el motivo y, si lo hubo, la frase que la
// disparó. La RLS decide quién las ve; acá no se filtra por rol.

function mapSignal(row: any): WellbeingSignal {
  return {
    id: row.id,
    studentId: row.student_id,
    schoolId: row.school_id,
    level: row.level,
    reason: row.reason,
    excerpt: row.excerpt ?? null,
    status: row.status,
    handledBy: row.handled_by ?? null,
    handledAt: row.handled_at ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}

export interface WellbeingSignalWithStudent extends WellbeingSignal {
  studentName: string;
  courseName: string | null;
}

export async function getWellbeingSignals(): Promise<WellbeingSignalWithStudent[]> {
  const { data, error } = await supabase
    .from('wellbeing_signals')
    .select('*, students(first_name, last_name, courses(name))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...mapSignal(row),
    studentName: row.students
      ? `${row.students.first_name} ${row.students.last_name}`
      : 'Estudiante',
    courseName: row.students?.courses?.name ?? null,
  }));
}

/** El servidor sella quién la tomó y cuándo (trigger de la 017). */
export async function updateSignal(
  id: string, status: WellbeingStatus, note: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('wellbeing_signals')
    .update({ status, note: note.trim() || null })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se pudo actualizar: puede que ya no tengas permiso sobre esta señal.');
  }
}
