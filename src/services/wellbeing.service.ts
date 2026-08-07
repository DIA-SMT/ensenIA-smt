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
