import { supabase, unwrap } from './_helpers';
import type { User, School, SubjectAssignment } from '../types';

export async function getProfile(userId: string): Promise<User> {
  const profile = unwrap(
    await supabase.from('profiles').select('*').eq('id', userId).single()
  );

  const assignments = unwrap(
    await supabase
      .from('teacher_assignments')
      .select('subject_id, course_id, courses(name)')
      .eq('teacher_id', userId)
  );

  const subjects: SubjectAssignment[] = assignments.map((a: any) => ({
    subjectId: a.subject_id,
    courseId: a.course_id,
    courseName: a.courses?.name ?? '',
  }));

  return mapProfileToUser(profile, subjects);
}

export async function getTeacherUsers(): Promise<User[]> {
  const profiles = unwrap(
    await supabase.from('profiles').select('*').eq('role', 'docente')
  );

  const teacherIds = profiles.map((p: any) => p.id);
  if (teacherIds.length === 0) return [];

  const allAssignments = unwrap(
    await supabase
      .from('teacher_assignments')
      .select('teacher_id, subject_id, course_id, courses(name)')
      .in('teacher_id', teacherIds)
  );

  return profiles.map((p: any) => {
    const myAssignments = allAssignments.filter((a: any) => a.teacher_id === p.id);
    const subjects: SubjectAssignment[] = myAssignments.map((a: any) => ({
      subjectId: a.subject_id,
      courseId: a.course_id,
      courseName: a.courses?.name ?? '',
    }));
    return mapProfileToUser(p, subjects);
  });
}

export async function getUserById(userId: string): Promise<User | undefined> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return undefined;

  const assignments = (
    await supabase
      .from('teacher_assignments')
      .select('subject_id, course_id, courses(name)')
      .eq('teacher_id', userId)
  ).data ?? [];

  const subjects: SubjectAssignment[] = assignments.map((a: any) => ({
    subjectId: a.subject_id,
    courseId: a.course_id,
    courseName: a.courses?.name ?? '',
  }));

  return mapProfileToUser(data, subjects);
}

export async function getSchool(schoolId: string): Promise<School> {
  const row = unwrap(
    await supabase.from('schools').select('*').eq('id', schoolId).single()
  );
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    address: row.address ?? '',
    district: row.district ?? '',
  };
}

function mapProfileToUser(row: any, subjects: SubjectAssignment[]): User {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    schoolId: row.school_id,
    avatarInitials: row.avatar_initials,
    subjects: subjects.length > 0 ? subjects : undefined,
    createdAt: row.created_at,
  };
}
