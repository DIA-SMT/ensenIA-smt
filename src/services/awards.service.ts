/**
 * ENSEÑIA SMT — Medallas otorgadas por personas
 *
 * Docente → estudiante (¡Crack!, Aura +1, ...) con dedicatoria: suman
 * XP (trigger en Postgres) y quedan en el perfil del estudiante.
 * Directivo → docente (Presente total, Fábrica de actividades, ...).
 */

import { supabase, unwrap } from './_helpers';
import type { StudentAward, TeacherAward } from '../types';

// ── Mappers ──

function mapStudentAward(row: any): StudentAward {
  return {
    id: row.id,
    studentId: row.student_id,
    teacherId: row.teacher_id,
    subjectId: row.subject_id ?? null,
    badgeCode: row.badge_code,
    message: row.message ?? null,
    createdAt: row.created_at,
    teacherName: row.profiles ? `${row.profiles.first_name} ${row.profiles.last_name}` : undefined,
    subjectName: row.subjects?.name,
  };
}

function mapTeacherAward(row: any): TeacherAward {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    directorId: row.director_id,
    badgeCode: row.badge_code,
    message: row.message ?? null,
    createdAt: row.created_at,
    directorName: row.director ? `${row.director.first_name} ${row.director.last_name}` : undefined,
    teacherName: row.teacher ? `${row.teacher.first_name} ${row.teacher.last_name}` : undefined,
  };
}

// ── Docente → estudiante ──

export async function giveStudentAward(input: {
  studentId: string;
  teacherId: string;
  subjectId?: string | null;
  badgeCode: string;
  message?: string;
}): Promise<StudentAward> {
  const row = unwrap(
    await supabase
      .from('student_awards')
      .insert({
        student_id: input.studentId,
        teacher_id: input.teacherId,
        subject_id: input.subjectId ?? null,
        badge_code: input.badgeCode,
        message: input.message?.trim() || null,
      })
      .select('*, profiles(first_name, last_name), subjects(name)')
      .single()
  );
  return mapStudentAward(row);
}

export async function getStudentAwards(studentId: string): Promise<StudentAward[]> {
  const data = unwrap(
    await supabase
      .from('student_awards')
      .select('*, profiles(first_name, last_name), subjects(name)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
  );
  return data.map(mapStudentAward);
}

export async function removeStudentAward(awardId: string): Promise<void> {
  const { error } = await supabase.from('student_awards').delete().eq('id', awardId);
  if (error) throw error;
}

// ── Directivo → docente ──

export async function giveTeacherAward(input: {
  teacherId: string;
  directorId: string;
  badgeCode: string;
  message?: string;
}): Promise<TeacherAward> {
  const row = unwrap(
    await supabase
      .from('teacher_awards')
      .insert({
        teacher_id: input.teacherId,
        director_id: input.directorId,
        badge_code: input.badgeCode,
        message: input.message?.trim() || null,
      })
      .select('*, director:profiles!teacher_awards_director_id_fkey(first_name, last_name)')
      .single()
  );
  return mapTeacherAward(row);
}

export async function getTeacherAwards(teacherId: string): Promise<TeacherAward[]> {
  const data = unwrap(
    await supabase
      .from('teacher_awards')
      .select('*, director:profiles!teacher_awards_director_id_fkey(first_name, last_name)')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
  );
  return data.map(mapTeacherAward);
}
