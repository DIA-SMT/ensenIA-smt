/**
 * SMT EstudIA — Gestión de escuelas
 *
 * Lo usan el superadmin (todas las escuelas) y el director (la suya).
 * Quién puede qué lo deciden las policies de la migración 039; acá no se
 * repite ninguna regla. Crear cuentas y resetear claves pasa por la
 * función admin-usuarios, que es la única que tiene la service role.
 */

import { supabase, unwrap } from './_helpers';
import type { UserRole } from '../types';

// ── Tipos ──

export interface AdminSchool {
  id: string;
  name: string;
  shortName: string;
  address: string;
  district: string;
  courseCount: number;
  memberCount: number;
}

export interface AdminCourse { id: string; name: string; year: number; division: string; studentCount: number }
export interface AdminSubject { id: string; name: string; color: string }

export interface AdminMember {
  membershipId: string;
  userId: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  dni: string | null;
  mustChangePassword: boolean;
}

export interface AdminAssignment {
  id: string;
  teacherId: string;
  subjectId: string;
  subjectName: string;
  courseId: string;
  courseName: string;
}

export interface AdminStudent {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  courseId: string;
  courseName: string;
  dni: string | null;
  mustChangePassword: boolean;
}

export interface AdminGuardianLink {
  id: string;
  studentId: string;
  guardianUserId: string;
  relationship: string;
}

export interface NewAccount {
  schoolId: string;
  role: Exclude<UserRole, 'superadmin'>;
  firstName: string;
  lastName: string;
  dni?: string;
  email?: string;
  /** obligatorio para estudiantes */
  courseId?: string;
}

/** Lo que hay que entregarle a la persona. `password` solo si la cuenta es nueva. */
export interface AccountCredentials {
  userId: string;
  login: string;
  password?: string;
  existing: boolean;
}

// ── Escuelas ──

export async function listSchools(): Promise<AdminSchool[]> {
  const rows = unwrap(
    await supabase
      .from('schools')
      .select('*, courses(count), school_memberships(count)')
      .order('name')
  );
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    address: r.address ?? '',
    district: r.district ?? '',
    courseCount: r.courses?.[0]?.count ?? 0,
    memberCount: r.school_memberships?.[0]?.count ?? 0,
  }));
}

export async function getAdminSchool(id: string): Promise<AdminSchool | null> {
  const { data, error } = await supabase.from('schools').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id, name: data.name, shortName: data.short_name,
    address: data.address ?? '', district: data.district ?? '',
    courseCount: 0, memberCount: 0,
  };
}

export async function createSchool(s: { name: string; shortName: string; address?: string; district?: string }): Promise<string> {
  const row = unwrap(
    await supabase
      .from('schools')
      .insert({ name: s.name, short_name: s.shortName, address: s.address || null, district: s.district || null })
      .select('id')
      .single()
  ) as { id: string };
  return row.id;
}

export async function updateSchool(id: string, s: { name: string; shortName: string; address?: string; district?: string }): Promise<void> {
  const { error } = await supabase
    .from('schools')
    .update({ name: s.name, short_name: s.shortName, address: s.address || null, district: s.district || null })
    .eq('id', id);
  if (error) throw error;
}

// ── Cursos y materias ──

/** 23503: otra tabla lo referencia (actividades, notas...). */
function inUse(error: { code?: string }, message: string): Error | typeof error {
  return error.code === '23503' ? new Error(message) : error;
}

export async function listCourses(schoolId: string): Promise<AdminCourse[]> {
  const rows = unwrap(
    await supabase.from('courses').select('*').eq('school_id', schoolId).order('year').order('division')
  );
  return rows.map((r: any) => ({ id: r.id, name: r.name, year: r.year, division: r.division, studentCount: r.student_count ?? 0 }));
}

export async function createCourse(schoolId: string, year: number, division: string): Promise<void> {
  const div = division.trim().toUpperCase();
  const { error } = await supabase
    .from('courses')
    .insert({ school_id: schoolId, year, division: div, name: `${year}° ${div}` });
  if (error) throw error;
}

export async function deleteCourse(id: string): Promise<void> {
  const { error } = await supabase.from('courses').delete().eq('id', id);
  if (error) throw inUse(error, 'El curso ya tiene actividades, clases o planificación cargadas: no se puede eliminar.');
}

export async function listSubjects(schoolId: string): Promise<AdminSubject[]> {
  const rows = unwrap(
    await supabase.from('subjects').select('*').eq('school_id', schoolId).order('name')
  );
  return rows.map((r: any) => ({ id: r.id, name: r.name, color: r.color }));
}

export async function createSubject(schoolId: string, name: string, color = 'blue'): Promise<void> {
  const { error } = await supabase.from('subjects').insert({ school_id: schoolId, name: name.trim(), color });
  if (error) throw error;
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) throw inUse(error, 'La materia ya tiene actividades, materiales o notas cargadas: no se puede eliminar.');
}

// ── Personas de la escuela ──

export async function listMembers(schoolId: string): Promise<AdminMember[]> {
  const rows = unwrap(
    await supabase
      .from('school_memberships')
      .select('id, role, user_id, profiles(first_name, last_name, email, dni, must_change_password)')
      .eq('school_id', schoolId)
  );
  return rows
    .map((r: any) => ({
      membershipId: r.id,
      userId: r.user_id,
      role: r.role,
      firstName: r.profiles?.first_name ?? '',
      lastName: r.profiles?.last_name ?? '',
      email: r.profiles?.email ?? '',
      dni: r.profiles?.dni ?? null,
      mustChangePassword: r.profiles?.must_change_password ?? false,
    }))
    .sort((a: AdminMember, b: AdminMember) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
}

/** Saca a la persona de esta escuela (su cuenta sigue, y sus otras escuelas también). */
export async function removeMember(membershipId: string): Promise<void> {
  const { error } = await supabase.from('school_memberships').delete().eq('id', membershipId);
  if (error) throw error;
}

// ── Asignaciones docentes ──

export async function listAssignments(schoolId: string): Promise<AdminAssignment[]> {
  const rows = unwrap(
    await supabase
      .from('teacher_assignments')
      .select('id, teacher_id, subject_id, course_id, subjects(name), courses!inner(name, school_id)')
      .eq('courses.school_id', schoolId)
  );
  return rows.map((r: any) => ({
    id: r.id,
    teacherId: r.teacher_id,
    subjectId: r.subject_id,
    subjectName: r.subjects?.name ?? '',
    courseId: r.course_id,
    courseName: r.courses?.name ?? '',
  }));
}

export async function addAssignment(teacherId: string, subjectId: string, courseId: string): Promise<void> {
  const { error } = await supabase
    .from('teacher_assignments')
    .insert({ teacher_id: teacherId, subject_id: subjectId, course_id: courseId });
  if (error) {
    if (error.code === '23505') throw new Error('Ese docente ya tiene esa materia en ese curso.');
    throw error;
  }
}

export async function removeAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('teacher_assignments').delete().eq('id', id);
  if (error) throw error;
}

// ── Estudiantes ──

export async function listStudents(schoolId: string): Promise<AdminStudent[]> {
  const rows = unwrap(
    await supabase
      .from('students')
      .select('id, user_id, first_name, last_name, course_id, courses(name), profiles(dni, must_change_password)')
      .eq('school_id', schoolId)
      .order('last_name')
  );
  return rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    firstName: r.first_name,
    lastName: r.last_name,
    courseId: r.course_id,
    courseName: r.courses?.name ?? '',
    dni: r.profiles?.dni ?? null,
    mustChangePassword: r.profiles?.must_change_password ?? false,
  }));
}

/** Cambiar de curso: la base lo reinscribe en las materias del curso nuevo. */
/** La ficha de estudiante de una cuenta (para vincularle la familia recién creada). */
export async function getStudentIdByUser(userId: string): Promise<string | null> {
  const { data } = await supabase.from('students').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
}

export async function moveStudent(studentId: string, courseId: string): Promise<void> {
  const { error } = await supabase.from('students').update({ course_id: courseId }).eq('id', studentId);
  if (error) throw error;
}

// ── Familias ──

export async function listGuardianLinks(schoolId: string): Promise<AdminGuardianLink[]> {
  const rows = unwrap(
    await supabase
      .from('student_guardians')
      .select('id, student_id, guardian_user_id, relationship, students!inner(school_id)')
      .eq('students.school_id', schoolId)
  );
  return rows.map((r: any) => ({
    id: r.id,
    studentId: r.student_id,
    guardianUserId: r.guardian_user_id,
    relationship: r.relationship,
  }));
}

export async function addGuardianLink(studentId: string, guardianUserId: string, relationship: string): Promise<void> {
  const { error } = await supabase
    .from('student_guardians')
    .insert({ student_id: studentId, guardian_user_id: guardianUserId, relationship });
  if (error) {
    if (error.code === '23505') throw new Error('Ya están vinculados.');
    throw error;
  }
}

export async function removeGuardianLink(id: string): Promise<void> {
  const { error } = await supabase.from('student_guardians').delete().eq('id', id);
  if (error) throw error;
}

// ── Cuentas (función admin-usuarios) ──

async function callAdminUsuarios<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa.');
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-usuarios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || `No se pudo completar (${resp.status}).`);
  return json as T;
}

/** Crea la cuenta, o suma a la escuela a alguien que ya tiene una. */
export function createAccount(a: NewAccount): Promise<AccountCredentials> {
  return callAdminUsuarios<AccountCredentials>({ action: 'create', ...a });
}

/** Clave inicial nueva (la persona la cambia al entrar). */
export function resetPassword(userId: string): Promise<{ login: string; password: string }> {
  return callAdminUsuarios({ action: 'reset_password', userId });
}

// ── Alumnos de muestra (solo superadmin, migración 048) ──

/** Cuántos alumnos de muestra hay en cada curso: { courseId: cantidad } */
export async function getDemoStudents(schoolId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('demo_alumnos_estado', { p_school: schoolId });
  if (error) throw error;
  return (data ?? {}) as Record<string, number>;
}

/** Carga 20 alumnos inventados con su historia (si ya había, empieza de cero). */
export async function loadDemoStudents(courseId: string): Promise<number> {
  const { data, error } = await supabase.rpc('demo_alumnos_cargar', { p_course: courseId });
  if (error) throw error;
  return data ?? 0;
}

/** Los borra con todo lo suyo. Los alumnos reales no se tocan. */
export async function removeDemoStudents(courseId: string): Promise<number> {
  const { data, error } = await supabase.rpc('demo_alumnos_quitar', { p_course: courseId });
  if (error) throw error;
  return data ?? 0;
}
