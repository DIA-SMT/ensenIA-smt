import { supabase, unwrap } from './_helpers';
import type { User, School, SubjectAssignment } from '../types';

export async function getProfile(userId: string): Promise<User> {
  const profile = unwrap(
    await supabase.from('profiles').select('*').eq('id', userId).single()
  );

  // Solo las materias de la escuela activa: un docente de dos escuelas
  // trabaja en una por vez (se cambia con switchSchool).
  const activeSchool = (profile as { school_id: string | null }).school_id;
  const assignments = activeSchool
    ? unwrap(
        await supabase
          .from('teacher_assignments')
          .select('subject_id, course_id, courses!inner(name, school_id)')
          .eq('teacher_id', userId)
          .eq('courses.school_id', activeSchool)
      )
    : [];

  const subjects: SubjectAssignment[] = assignments.map((a: any) => ({
    subjectId: a.subject_id,
    courseId: a.course_id,
    courseName: a.courses?.name ?? '',
  }));

  return mapProfileToUser(profile, subjects);
}

export interface MySchool {
  schoolId: string;
  schoolName: string;
  role: User['role'];
}

/** Escuelas a las que pertenezco (para elegir la activa). */
export async function getMySchools(userId: string): Promise<MySchool[]> {
  const rows = unwrap(
    await supabase
      .from('school_memberships')
      .select('school_id, role, schools(name)')
      .eq('user_id', userId)
  );
  return rows
    .map((r: any) => ({ schoolId: r.school_id, schoolName: r.schools?.name ?? '', role: r.role }))
    .sort((a: MySchool, b: MySchool) => a.schoolName.localeCompare(b.schoolName));
}

export async function switchSchool(schoolId: string): Promise<void> {
  const { error } = await supabase.rpc('switch_school', { p_school: schoolId });
  if (error) throw error;
}

/** Después de cambiar la clave inicial. */
export async function clearMustChangePassword(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', userId);
  if (error) throw error;
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
  ) as { id: string; name: string; short_name: string; address: string | null; district: string | null };
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
    schoolId: row.school_id ?? '',
    avatarInitials: row.avatar_initials,
    dni: row.dni ?? null,
    mustChangePassword: row.must_change_password ?? false,
    subjects: subjects.length > 0 ? subjects : undefined,
    createdAt: row.created_at,
  };
}
