import { supabase } from './_helpers';
import type { TeacherStats, DirectorStats } from '../types';

export async function getTeacherStats(userId: string, todayDayIndex: number): Promise<TeacherStats> {
  const [assignmentsRes, todayRes] = await Promise.all([
    supabase.from('teacher_assignments').select('course_id').eq('teacher_id', userId),
    supabase.from('schedule_blocks').select('id').eq('teacher_id', userId).eq('day_index', todayDayIndex),
  ]);

  const courseIds = [...new Set((assignmentsRes.data ?? []).map((a: any) => a.course_id))];

  let studentList: any[] = [];
  if (courseIds.length > 0) {
    const studentsRes = await supabase
      .from('students')
      .select('attendance')
      .in('course_id', courseIds);
    studentList = studentsRes.data ?? [];
  }

  return {
    totalStudents: studentList.length,
    classesToday: (todayRes.data ?? []).length,
    pendingEvaluations: 0,
    avgAttendance: studentList.length > 0
      ? parseFloat(
          (studentList.reduce((sum: number, s: any) => sum + Number(s.attendance), 0) / studentList.length).toFixed(1)
        )
      : 0,
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
