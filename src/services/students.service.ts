import { supabase, unwrap } from './_helpers';
import type { Student } from '../types';

/** Entrega de un estudiante con el contexto de la actividad (para su ficha). */
export interface StudentWork {
  id: string;
  activityTitle: string;
  subjectName: string;
  status: 'in_progress' | 'submitted' | 'graded';
  score: number | null;
  autoScore: number | null;
  points: number | null;
  updatedAt: string;
  timeSpentSeconds: number;
}

/**
 * Últimas entregas del estudiante en actividades del docente logueado.
 * RLS ya limita a las actividades propias, no hace falta filtrar acá.
 */
export async function getWorkByStudent(studentId: string, limit = 10): Promise<StudentWork[]> {
  const data = unwrap(
    await supabase
      .from('activity_submissions')
      .select('id, status, score, auto_score, time_spent_seconds, updated_at, activities(title, points, subjects(name))')
      .eq('student_id', studentId)
      .order('updated_at', { ascending: false })
      .limit(limit)
  );

  return data.map((row: any) => ({
    id: row.id,
    activityTitle: row.activities?.title ?? 'Actividad',
    subjectName: row.activities?.subjects?.name ?? '',
    status: row.status,
    score: row.score != null ? Number(row.score) : null,
    autoScore: row.auto_score != null ? Number(row.auto_score) : null,
    points: row.activities?.points != null ? Number(row.activities.points) : null,
    updatedAt: row.updated_at,
    timeSpentSeconds: row.time_spent_seconds ?? 0,
  }));
}

export async function getStudentsByTeacher(courseIds: string[]): Promise<Student[]> {
  if (courseIds.length === 0) return [];

  const data = unwrap(
    await supabase
      .from('students')
      .select('*, courses(name)')
      .in('course_id', courseIds)
      .order('last_name')
  );

  return data.map(mapStudent);
}

export async function getStudentsByCourse(courseId: string): Promise<Student[]> {
  const data = unwrap(
    await supabase
      .from('students')
      .select('*, courses(name)')
      .eq('course_id', courseId)
      .order('last_name')
  );

  return data.map(mapStudent);
}

export async function getStudentById(id: string): Promise<Student | undefined> {
  const { data, error } = await supabase
    .from('students')
    .select('*, courses(name)')
    .eq('id', id)
    .single();

  if (error || !data) return undefined;
  return mapStudent(data);
}

export async function getAllStudents(): Promise<Student[]> {
  const data = unwrap(
    await supabase
      .from('students')
      .select('*, courses(name)')
      .order('last_name')
  );

  return data.map(mapStudent);
}

function mapStudent(row: any): Student {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarInitials: row.avatar_initials,
    courseId: row.course_id,
    courseName: row.courses?.name ?? '',
    status: row.status,
    alerts: row.alerts_count,
    progress: Number(row.progress),
    attendance: Number(row.attendance),
    average: Number(row.average),
    schoolId: row.school_id,
  };
}
