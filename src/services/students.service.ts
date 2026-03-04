import { supabase, unwrap } from './_helpers';
import type { Student } from '../types';

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
