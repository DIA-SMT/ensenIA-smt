/**
 * ENSEÑIA SMT — Activities Service
 *
 * Actividades publicadas por docentes, entregas de estudiantes
 * y huella digital (activity_events).
 */

import { supabase, unwrap } from './_helpers';
import type {
  Activity, ActivityQuestion, ActivitySubmission, ActivityEvent,
  ActivityEventType, ActivityAnswer, Enrollment, IAToolType, Student,
} from '../types';

// ── Mappers ──

function mapActivity(row: any): Activity {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    contentMd: row.content_md ?? '',
    questions: (row.questions ?? []) as ActivityQuestion[],
    subjectId: row.subject_id,
    courseId: row.course_id,
    teacherId: row.teacher_id,
    schoolId: row.school_id,
    unitId: row.unit_id,
    classId: row.class_id,
    sourceTool: row.source_tool,
    status: row.status,
    dueDate: row.due_date,
    points: row.points,
    createdAt: row.created_at,
    subjectName: row.subjects?.name,
    courseName: row.courses?.name,
  };
}

function mapSubmission(row: any): ActivitySubmission {
  return {
    id: row.id,
    activityId: row.activity_id,
    studentId: row.student_id,
    status: row.status,
    answers: (row.answers ?? {}) as Record<string, ActivityAnswer>,
    responseText: row.response_text,
    autoScore: row.auto_score !== null ? Number(row.auto_score) : null,
    score: row.score !== null ? Number(row.score) : null,
    feedback: row.feedback,
    feedbackReaction: row.feedback_reaction,
    timeSpentSeconds: row.time_spent_seconds ?? 0,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
  };
}

function mapEvent(row: any): ActivityEvent {
  return {
    id: row.id,
    activityId: row.activity_id,
    studentId: row.student_id,
    eventType: row.event_type,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

// ── Teacher: CRUD ──

export async function createActivity(a: {
  title: string;
  description?: string;
  contentMd: string;
  questions: ActivityQuestion[];
  subjectId: string;
  courseId: string;
  teacherId: string;
  schoolId: string;
  unitId?: string | null;
  classId?: string | null;
  sourceTool?: IAToolType | null;
  dueDate?: string | null;
  points?: number | null;
}): Promise<Activity> {
  const row = unwrap(
    await supabase
      .from('activities')
      .insert({
        title: a.title,
        description: a.description ?? null,
        content_md: a.contentMd,
        questions: a.questions as any,
        subject_id: a.subjectId,
        course_id: a.courseId,
        teacher_id: a.teacherId,
        school_id: a.schoolId,
        unit_id: a.unitId ?? null,
        class_id: a.classId ?? null,
        source_tool: (a.sourceTool as any) ?? null,
        status: 'published',
        due_date: a.dueDate ?? null,
        points: a.points ?? null,
      })
      .select('*')
      .single()
  );
  return mapActivity(row);
}

export async function getActivitiesByTeacher(teacherId: string): Promise<Activity[]> {
  const data = unwrap(
    await supabase
      .from('activities')
      .select('*, subjects(name), courses(name)')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
  );
  return data.map(mapActivity);
}

export async function getActivityById(id: string): Promise<Activity | null> {
  const { data } = await supabase
    .from('activities')
    .select('*, subjects(name), courses(name)')
    .eq('id', id)
    .maybeSingle();
  return data ? mapActivity(data) : null;
}

export async function updateActivityStatus(id: string, status: 'published' | 'closed'): Promise<void> {
  const { error } = await supabase.from('activities').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', id);
  if (error) throw error;
}

// ── Teacher: resultados ──

export async function getSubmissionsByActivity(activityId: string): Promise<ActivitySubmission[]> {
  const data = unwrap(
    await supabase
      .from('activity_submissions')
      .select('*')
      .eq('activity_id', activityId)
  );
  return data.map(mapSubmission);
}

export async function getEventsByActivity(activityId: string): Promise<ActivityEvent[]> {
  const data = unwrap(
    await supabase
      .from('activity_events')
      .select('*')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true })
  );
  return data.map(mapEvent);
}

/** Devolución rápida de un toque (independiente de la nota). */
export async function setSubmissionReaction(submissionId: string, reaction: string | null): Promise<void> {
  const { error } = await supabase
    .from('activity_submissions')
    .update({ feedback_reaction: reaction })
    .eq('id', submissionId);
  if (error) throw error;
}

export async function gradeSubmission(
  submissionId: string,
  score: number,
  feedback?: string,
): Promise<void> {
  const { error } = await supabase
    .from('activity_submissions')
    .update({
      score,
      feedback: feedback ?? null,
      status: 'graded',
      graded_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (error) throw error;
}

/** Alumnos inscriptos a la materia+curso de una actividad. */
export async function getEnrolledStudents(subjectId: string, courseId: string): Promise<(Student & { enrollmentCode: string })[]> {
  const data = unwrap(
    await supabase
      .from('enrollments')
      .select('enrollment_code, students(*, courses(name))')
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
  );
  return data
    .filter((r: any) => r.students)
    .map((r: any) => ({
      id: r.students.id,
      firstName: r.students.first_name,
      lastName: r.students.last_name,
      avatarInitials: r.students.avatar_initials,
      courseId: r.students.course_id,
      courseName: r.students.courses?.name ?? '',
      status: r.students.status,
      alerts: r.students.alerts_count,
      progress: Number(r.students.progress),
      attendance: Number(r.students.attendance),
      average: Number(r.students.average),
      schoolId: r.students.school_id,
      userId: r.students.user_id,
      email: r.students.email,
      enrollmentCode: r.enrollment_code,
    }))
    .sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
}

// ── Director: actividad publicada por los docentes de la escuela ──
// Solo campos livianos; la RLS "Directors see school activities" (003) habilita la lectura.

export interface SchoolActivityLight {
  teacherId: string;
  title: string;
  createdAt: string;
}

export async function getSchoolActivitiesLight(schoolId: string): Promise<SchoolActivityLight[]> {
  const data = unwrap(
    await supabase
      .from('activities')
      .select('teacher_id, title, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
  );
  return data.map((r: any) => ({
    teacherId: r.teacher_id,
    title: r.title,
    createdAt: r.created_at,
  }));
}

// ── Student: mi vista ──

export async function getStudentByUserId(userId: string): Promise<Student | null> {
  const { data } = await supabase
    .from('students')
    .select('*, courses(name)')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    avatarInitials: data.avatar_initials,
    courseId: data.course_id,
    courseName: (data as any).courses?.name ?? '',
    status: data.status,
    alerts: data.alerts_count,
    progress: Number(data.progress),
    attendance: Number(data.attendance),
    average: Number(data.average),
    schoolId: data.school_id,
    userId: data.user_id,
    email: data.email,
  };
}

export async function getEnrollmentsByStudent(studentId: string): Promise<Enrollment[]> {
  const data = unwrap(
    await supabase
      .from('enrollments')
      .select('*, subjects(name), courses(name)')
      .eq('student_id', studentId)
  );
  return data.map((r: any) => ({
    id: r.id,
    studentId: r.student_id,
    subjectId: r.subject_id,
    courseId: r.course_id,
    enrollmentCode: r.enrollment_code,
    schoolId: r.school_id,
    subjectName: r.subjects?.name,
    courseName: r.courses?.name,
  }));
}

/** Actividades publicadas visibles para el alumno (RLS filtra por enrollment). */
export async function getActivitiesForStudent(): Promise<Activity[]> {
  const data = unwrap(
    await supabase
      .from('activities')
      .select('*, subjects(name), courses(name)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
  );
  return data.map(mapActivity);
}

export async function getMySubmissions(studentId: string): Promise<ActivitySubmission[]> {
  const data = unwrap(
    await supabase
      .from('activity_submissions')
      .select('*')
      .eq('student_id', studentId)
  );
  return data.map(mapSubmission);
}

export async function getOrCreateSubmission(activityId: string, studentId: string): Promise<ActivitySubmission> {
  const { data: existing } = await supabase
    .from('activity_submissions')
    .select('*')
    .eq('activity_id', activityId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (existing) return mapSubmission(existing);

  const { data: created, error } = await supabase
    .from('activity_submissions')
    .insert({
      activity_id: activityId,
      student_id: studentId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    // carrera: otro tab la creó
    const { data: retry } = await supabase
      .from('activity_submissions')
      .select('*')
      .eq('activity_id', activityId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (retry) return mapSubmission(retry);
    throw error;
  }
  return mapSubmission(created);
}

export async function saveSubmissionProgress(
  submissionId: string,
  updates: {
    answers?: Record<string, ActivityAnswer>;
    responseText?: string;
    timeSpentSeconds?: number;
  },
): Promise<void> {
  const dbUpdates: Record<string, any> = {};
  if (updates.answers !== undefined) dbUpdates.answers = updates.answers;
  if (updates.responseText !== undefined) dbUpdates.response_text = updates.responseText;
  if (updates.timeSpentSeconds !== undefined) dbUpdates.time_spent_seconds = updates.timeSpentSeconds;
  const { error } = await supabase.from('activity_submissions').update(dbUpdates).eq('id', submissionId);
  if (error) throw error;
}

export async function submitActivity(
  submissionId: string,
  payload: {
    answers: Record<string, ActivityAnswer>;
    responseText?: string;
    autoScore?: number | null;
    timeSpentSeconds: number;
  },
): Promise<void> {
  const { error } = await supabase
    .from('activity_submissions')
    .update({
      answers: payload.answers as any,
      response_text: payload.responseText ?? null,
      auto_score: payload.autoScore ?? null,
      time_spent_seconds: payload.timeSpentSeconds,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (error) throw error;
}

// ── Huella digital ──

export async function logActivityEvent(
  activityId: string,
  studentId: string,
  eventType: ActivityEventType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  // fire-and-forget: la huella nunca debe romper la UX
  const { error } = await supabase.from('activity_events').insert({
    activity_id: activityId,
    student_id: studentId,
    event_type: eventType,
    metadata: metadata as any,
  });
  if (error) console.error('logActivityEvent:', error.message);
}
