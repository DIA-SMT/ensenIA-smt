import { supabase } from './_helpers';
import type { TeacherStats, DirectorStats } from '../types';

/**
 * Solo conteos: la base cuenta y devuelve el número, sin mandar filas
 * (head: true). Si una consulta falla, se lanza el error: un 0 inventado
 * haría creer que no hay nada para corregir.
 */
export async function getTeacherStats(userId: string): Promise<TeacherStats> {
  const [asignaciones, actividades] = await Promise.all([
    supabase.from('teacher_assignments').select('course_id').eq('teacher_id', userId),
    supabase.from('activities').select('id').eq('teacher_id', userId),
  ]);
  if (asignaciones.error) throw asignaciones.error;
  if (actividades.error) throw actividades.error;

  const courseIds = [...new Set((asignaciones.data ?? []).map((a: { course_id: string }) => a.course_id))];
  const activityIds = (actividades.data ?? []).map((a: { id: string }) => a.id);

  const [estudiantes, entregas] = await Promise.all([
    courseIds.length
      ? supabase.from('students').select('id', { count: 'exact', head: true }).in('course_id', courseIds)
      : Promise.resolve({ count: 0, error: null }),
    activityIds.length
      ? supabase.from('activity_submissions').select('id', { count: 'exact', head: true })
          .in('activity_id', activityIds).eq('status', 'submitted')
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (estudiantes.error) throw estudiantes.error;
  if (entregas.error) throw entregas.error;

  return {
    totalStudents: estudiantes.count ?? 0,
    entregasParaCorregir: entregas.count ?? 0,
  };
}

export async function getDirectorStats(schoolId: string): Promise<DirectorStats> {
  const [teachersRes, studentsRes, alertsRes] = await Promise.all([
    supabase.from('profiles').select('id').eq('role', 'docente').eq('school_id', schoolId),
    supabase.from('students').select('attendance').eq('school_id', schoolId),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_read', false),
  ]);

  const teachers = teachersRes.data ?? [];
  const studentList = studentsRes.data ?? [];
  const todayIndex = new Date().getDay() - 1;

  let activeClasses = 0;
  if (teachers.length > 0 && todayIndex >= 0 && todayIndex <= 4) {
    const teacherIds = teachers.map((t: any) => t.id);
    const scheduleRes = await supabase
      .from('schedule_blocks')
      .select('id', { count: 'exact', head: true })
      .in('teacher_id', teacherIds)
      .eq('day_index', todayIndex);
    activeClasses = scheduleRes.count ?? 0;
  }

  return {
    totalTeachers: teachers.length,
    activeClasses,
    totalAlerts: alertsRes.count ?? 0,
    avgAttendance: studentList.length > 0
      ? parseFloat(
          (studentList.reduce((sum: number, s: any) => sum + Number(s.attendance), 0) / studentList.length).toFixed(1)
        )
      : 0,
    totalStudents: studentList.length,
  };
}
