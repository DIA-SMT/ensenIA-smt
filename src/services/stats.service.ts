import { supabase } from './_helpers';
import type { TeacherStats, DirectorStats } from '../types';

export async function getTeacherStats(userId: string, todayDayIndex: number): Promise<TeacherStats> {
  const [assignmentsRes, todayRes, pendingRes] = await Promise.all([
    supabase.from('teacher_assignments').select('course_id').eq('teacher_id', userId),
    supabase.from('schedule_blocks').select('id').eq('teacher_id', userId).eq('day_index', todayDayIndex),
    // Entregas esperando nota: antes este número estaba fijo en 0.
    supabase
      .from('activity_submissions')
      .select('id, activities!inner(teacher_id)', { count: 'exact', head: true })
      .eq('activities.teacher_id', userId)
      .eq('status', 'submitted'),
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
    pendingEvaluations: pendingRes.count ?? 0,
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

// ── Visión de dirección ──

export interface TeacherPulse {
  teacherId: string;
  teacherName: string;
  materials: number;
  activities: number;
  liveClasses: number;
  attendanceTaken: number;
  graded: number;
  pendingGrading: number;
  lastActive: string | null;
}

export interface CourseClimateRow {
  courseId: string;
  courseName: string;
  checkins: number;
  mood: number | null;
  studentsAtRisk: number;
}

/** Qué viene haciendo cada docente de la escuela (solo dirección). */
export async function getTeacherPulse(days = 30): Promise<TeacherPulse[]> {
  const { data, error } = await supabase.rpc('get_teacher_pulse', { p_days: days });
  if (error) throw error;
  return ((data as any[]) ?? []).map(r => ({
    teacherId: r.teacher_id,
    teacherName: r.teacher_name,
    materials: r.materials ?? 0,
    activities: r.activities ?? 0,
    liveClasses: r.live_classes ?? 0,
    attendanceTaken: r.attendance_taken ?? 0,
    graded: r.graded ?? 0,
    pendingGrading: r.pending_grading ?? 0,
    lastActive: r.last_active,
  }));
}

/** Clima emocional de cada curso de la escuela (solo dirección). */
export async function getSchoolClimate(days = 30): Promise<CourseClimateRow[]> {
  const { data, error } = await supabase.rpc('get_school_climate', { p_days: days });
  if (error) throw error;
  return ((data as any[]) ?? []).map(r => ({
    courseId: r.course_id,
    courseName: r.course_name,
    checkins: r.checkins ?? 0,
    mood: r.mood != null ? Number(r.mood) : null,
    studentsAtRisk: r.students_at_risk ?? 0,
  }));
}

/** Clases que están ocurriendo ahora mismo en la escuela. */
export async function getLiveNow(): Promise<{ id: string; title: string; teacherId: string; createdAt: string }[]> {
  const { data } = await supabase
    .from('live_sessions')
    .select('id, title, teacher_id, created_at')
    .eq('status', 'live')
    .order('created_at', { ascending: false });
  return ((data as any[]) ?? []).map(r => ({
    id: r.id, title: r.title, teacherId: r.teacher_id, createdAt: r.created_at,
  }));
}

// ── Rastro del docente: qué hizo él, de verdad ──

export type TimelineKind = 'material' | 'modulo' | 'actividad' | 'vivo' | 'asistencia' | 'correccion';

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  at: string;
  /** Adónde ir para ver eso que hizo. */
  link?: string;
}

/**
 * Lo que el docente viene haciendo, sacado de sus propias acciones.
 * Antes el Dashboard mostraba un listado inventado a mano ("Biología
 * Celular", "Química Orgánica") que no era de nadie: parecía actividad
 * de otro docente porque, literalmente, no era real.
 */
export async function getTeacherTimeline(teacherId: string, limit = 12): Promise<TimelineItem[]> {
  const [materials, activities, live, attendance, graded] = await Promise.all([
    supabase.from('library_materials')
      .select('id, title, uploaded_at, tags, podcast_status, study_cards')
      .eq('teacher_id', teacherId).order('uploaded_at', { ascending: false }).limit(limit),
    supabase.from('activities')
      .select('id, title, created_at, subject_name:subjects(name)')
      .eq('teacher_id', teacherId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('live_sessions')
      .select('id, title, created_at, status')
      .eq('teacher_id', teacherId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('attendance_sessions')
      .select('id, taken_on, created_at, courses(name)')
      .eq('teacher_id', teacherId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('activity_submissions')
      .select('id, graded_at, students(first_name, last_name), activities!inner(title, teacher_id)')
      .eq('activities.teacher_id', teacherId).eq('status', 'graded')
      .not('graded_at', 'is', null)
      .order('graded_at', { ascending: false }).limit(limit),
  ]);

  const items: TimelineItem[] = [];

  for (const m of (materials.data ?? []) as any[]) {
    const esModulo = (m.tags ?? []).includes('módulo');
    const extras: string[] = [];
    if (m.study_cards?.length) extras.push(`${m.study_cards.length} placas`);
    if (m.podcast_status === 'ready') extras.push('podcast');
    items.push({
      id: `mat-${m.id}`,
      kind: esModulo ? 'modulo' : 'material',
      title: m.title,
      detail: extras.join(' · ') || undefined,
      at: m.uploaded_at,
      link: '/mis-clases?tab=materiales',
    });
  }

  for (const a of (activities.data ?? []) as any[]) {
    items.push({
      id: `act-${a.id}`,
      kind: 'actividad',
      title: a.title,
      detail: a.subject_name?.name,
      at: a.created_at,
      link: `/actividades/${a.id}`,
    });
  }

  for (const l of (live.data ?? []) as any[]) {
    items.push({
      id: `live-${l.id}`,
      kind: 'vivo',
      title: l.title,
      detail: l.status === 'live' ? 'todavía abierta' : undefined,
      at: l.created_at,
      link: '/clase-en-vivo',
    });
  }

  for (const t of (attendance.data ?? []) as any[]) {
    items.push({
      id: `asis-${t.id}`,
      kind: 'asistencia',
      title: t.courses?.name ? `Lista de ${t.courses.name}` : 'Pasaste lista',
      at: t.created_at,
      link: '/asistencia',
    });
  }

  for (const g of (graded.data ?? []) as any[]) {
    items.push({
      id: `corr-${g.id}`,
      kind: 'correccion',
      title: g.activities?.title ?? 'Actividad',
      detail: g.students ? `${g.students.first_name} ${g.students.last_name}` : undefined,
      at: g.graded_at,
    });
  }

  return items
    .filter(i => i.at)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
