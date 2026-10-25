/**
 * SMT EstudIA — Activities Service
 *
 * Actividades publicadas por docentes, entregas de estudiantes
 * y huella digital (activity_events).
 */

import { supabase, unwrap, ServiceError } from './_helpers';
import type {
  Activity, ActivityQuestion, ActivitySubmission, ActivityEvent,
  ActivityEventType, ActivityAnswer, Enrollment, IAToolType, Student,
  TipoActividad, RegistroEntrega,
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
    tipo: row.tipo ?? 'actividad',
    publishedAt: row.published_at ?? null,
    iaPermitida: row.ia_permitida === 'sin_ia' || row.ia_permitida === 'libre' ? row.ia_permitida : 'guia',
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
    puntajes: row.puntajes ?? null,
    registro: row.registro ?? null,
    updatedAt: row.updated_at ?? null,
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
  /** Por defecto 'actividad' */
  tipo?: TipoActividad;
  /** 'draft': se guarda sin que la vean los estudiantes. Por defecto se publica. */
  estado?: 'draft' | 'published';
  /** Cuánta ayuda de la IA permite (078). Por defecto, con pistas. */
  iaPermitida?: 'sin_ia' | 'guia' | 'libre';
}): Promise<Activity> {
  const fila: Record<string, unknown> = {
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
    status: a.estado ?? 'published',
    due_date: a.dueDate ?? null,
    points: a.points ?? null,
    ...(a.tipo && a.tipo !== 'actividad' ? { tipo: a.tipo } : {}),
    // Solo si no es el de siempre: así anda igual en una base sin la 078
    ...(a.iaPermitida && a.iaPermitida !== 'guia' ? { ia_permitida: a.iaPermitida } : {}),
  };
  let res = await supabase.from('activities').insert(fila as never).select('*').single();
  // Sin la 078 la columna no existe: se publica igual, sin la regla de IA
  if (res.error && /ia_permitida/.test(res.error.message)) {
    delete fila.ia_permitida;
    res = await supabase.from('activities').insert(fila as never).select('*').single();
  }
  return mapActivity(unwrap(res));
}

/** Actividades, TP y evaluaciones de un tema de la planificación (borradores incluidos). */
export async function getActivitiesByClass(classId: string): Promise<Activity[]> {
  const data = unwrap(
    await supabase
      .from('activities')
      .select('*')
      .eq('class_id', classId)
      .order('created_at')
  );
  return data.map(mapActivity);
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

/**
 * Editar una actividad, también después de publicada (063). Con entregas,
 * la base deja corregir textos, la respuesta correcta y los puntos (y
 * vuelve a corregir lo entregado), pero no agregar ni quitar partes: el
 * error trae el motivo para mostrárselo al docente.
 */
export async function updateActivity(id: string, changes: {
  title?: string;
  description?: string | null;
  contentMd?: string;
  questions?: ActivityQuestion[];
  points?: number | null;
  dueDate?: string | null;
  tipo?: TipoActividad;
  classId?: string | null;
  status?: 'draft' | 'published' | 'closed';
  iaPermitida?: 'sin_ia' | 'guia' | 'libre';
}): Promise<void> {
  const db: Record<string, unknown> = {};
  if (changes.title !== undefined) db.title = changes.title;
  if (changes.description !== undefined) db.description = changes.description;
  if (changes.contentMd !== undefined) db.content_md = changes.contentMd;
  if (changes.questions !== undefined) db.questions = changes.questions;
  if (changes.points !== undefined) db.points = changes.points;
  if (changes.dueDate !== undefined) db.due_date = changes.dueDate;
  if (changes.tipo !== undefined) db.tipo = changes.tipo;
  if (changes.classId !== undefined) db.class_id = changes.classId;
  if (changes.status !== undefined) db.status = changes.status;
  if (changes.iaPermitida !== undefined) db.ia_permitida = changes.iaPermitida;
  let { error } = await supabase.from('activities').update(db as never).eq('id', id);
  // Sin la 078: lo demás se guarda igual
  if (error && 'ia_permitida' in db && /ia_permitida/.test(error.message)) {
    delete db.ia_permitida;
    ({ error } = await supabase.from('activities').update(db as never).eq('id', id));
  }
  // Con el mensaje de la base: dice por qué no se pudo (por ejemplo, que ya hay entregas)
  if (error) throw new ServiceError(error.message, error);
}

export async function updateActivityStatus(id: string, status: 'published' | 'closed'): Promise<void> {
  const { error } = await supabase.from('activities').update({ status }).eq('id', id);
  if (error) throw new ServiceError(error.message, error);
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
  /** Puntaje de cada parte (063). Sin darlo, no se toca lo que había. */
  puntajes?: Record<string, number> | null,
): Promise<void> {
  const { error } = await supabase
    .from('activity_submissions')
    .update({
      score,
      feedback: feedback ?? null,
      status: 'graded',
      graded_at: new Date().toISOString(),
      ...(puntajes !== undefined ? { puntajes: puntajes && Object.keys(puntajes).length ? puntajes : null } : {}),
    } as never)
    .eq('id', submissionId);
  if (error) throw new ServiceError(error.message, error);
}

/**
 * Lo que pasó fuera de la app, en la misma actividad (063): lo entregó en
 * papel (con nota, puntaje por parte y devolución, o todavía sin corregir)
 * o no lo entregó. null borra lo anotado. Lo que entregó en la app no se
 * pisa: se corrige en su entrega.
 */
export async function registrarEntregaDocente(
  activityId: string,
  studentId: string,
  registro: RegistroEntrega | null,
  datos: { score?: number | null; puntajes?: Record<string, number> | null; feedback?: string | null } = {},
): Promise<void> {
  const { error } = await supabase.rpc('registrar_entrega_docente' as never, {
    p_activity: activityId,
    p_student: studentId,
    p_registro: registro,
    p_score: datos.score ?? null,
    p_puntajes: datos.puntajes && Object.keys(datos.puntajes).length ? datos.puntajes : null,
    p_feedback: datos.feedback?.trim() || null,
  } as never);
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Falta correr la migración 063_preparar_la_clase.sql en Supabase.');
    throw new ServiceError(error.message, error);
  }
}

/** ¿La actividad se corrige por partes? (alguna parte tiene puntos) */
export const porPartes = (questions: ActivityQuestion[]) =>
  questions.some(q => typeof q.points === 'number');

/** Puntos de cada parte de opción múltiple que ya corrigió la base, por id. */
export function puntajesAutomaticos(questions: ActivityQuestion[], sub: ActivitySubmission): Record<string, number> {
  const out: Record<string, number> = {};
  // Solo lo que corrigió la base al entregar: mientras está en curso, el
  // campo correct lo escribe el celular del alumno
  if (sub.registro === 'papel' || (sub.status !== 'submitted' && sub.status !== 'graded')) return out;
  for (const q of questions) {
    if (q.type !== 'multiple_choice' || typeof q.points !== 'number') continue;
    const a = sub.answers[q.id];
    if (a && typeof a.correct === 'boolean') out[q.id] = a.correct ? q.points : 0;
  }
  return out;
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
// La RLS "Directors see school activities" (003) habilita la lectura.

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

/** Todas las actividades de la escuela (campos completos), para el tablero directivo. */
export async function getSchoolActivities(schoolId: string): Promise<Activity[]> {
  const data = unwrap(
    await supabase
      .from('activities')
      .select('*, subjects(name), courses(name)')
      .eq('school_id', schoolId)
  );
  return data.map(mapActivity);
}

/** Entregas de un lote de actividades (RLS: "Directors view school submissions", 008). */
export async function getSubmissionsByActivityIds(activityIds: string[]): Promise<ActivitySubmission[]> {
  if (activityIds.length === 0) return [];
  const data = unwrap(
    await supabase.from('activity_submissions').select('*').in('activity_id', activityIds)
  );
  return data.map(mapSubmission);
}

/** IDs de estudiantes con al menos un evento de huella digital desde `sinceIso`, sobre un lote de actividades. */
export async function getStudentIdsWithRecentEvents(activityIds: string[], sinceIso: string): Promise<Set<string>> {
  if (activityIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('activity_events')
    .select('student_id')
    .in('activity_id', activityIds)
    .gte('created_at', sinceIso);
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => r.student_id as string));
}

// ── Student: mi vista ──

/**
 * La ficha del estudiante de esta cuenta, o null si no tiene. `tirarSiFalla`:
 * un error (sin señal) se tira en vez de volver null, que se leería como
 * "tu cuenta no está vinculada a un curso" (la clase en vivo lo usa, 071).
 */
export async function getStudentByUserId(userId: string, { tirarSiFalla = false } = {}): Promise<Student | null> {
  const { data, error } = await supabase
    .from('students')
    .select('*, courses(name)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && tirarSiFalla) throw error;
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

// El alumno lee student_activities y no activities: es la misma fila con
// las preguntas sin correct_index, filtrada a lo publicado de sus materias
// (migración 019). La corrección vuelve en su entrega.

/** Actividades publicadas visibles para el alumno. */
export async function getActivitiesForStudent(): Promise<Activity[]> {
  const data = unwrap(
    await supabase
      .from('student_activities')
      .select('*, subjects(name), courses(name)')
      .order('created_at', { ascending: false })
  );
  return data.map(mapActivity);
}

export async function getActivityForStudent(id: string): Promise<Activity | null> {
  const { data, error } = await supabase
    .from('student_activities')
    .select('*, subjects(name), courses(name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapActivity(data) : null;
}

export async function getSubmissionById(id: string): Promise<ActivitySubmission | null> {
  const { data, error } = await supabase
    .from('activity_submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSubmission(data) : null;
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
  // El docente anotó "no lo entregó" (063): la fila existe pero no empezó.
  // Empieza ahora; si la entrega, deja de figurar como no entregada.
  if (existing && existing.status === 'pending') {
    const { data: enCurso, error } = await supabase
      .from('activity_submissions')
      .update({ status: 'in_progress' })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new ServiceError(error.message, error);
    return mapSubmission(enCurso);
  }
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
    timeSpentSeconds: number;
  },
): Promise<void> {
  // auto_score, `correct` de cada respuesta y submitted_at los pone la
  // base al pasar a 'submitted' (migración 018).
  const { error } = await supabase
    .from('activity_submissions')
    .update({
      answers: payload.answers as any,
      response_text: payload.responseText ?? null,
      time_spent_seconds: payload.timeSpentSeconds,
      status: 'submitted',
    })
    .eq('id', submissionId);
  if (error) throw error;
}

// ── La entrega por actividad y alumno (fase 3: empezar sin señal) ──
//
// Una entrega que se empezó sin señal todavía no tiene id del servidor: se
// identifica por (actividad, alumno), que es único en la base. Así la cola
// manda "empezar", el avance y la entrega en orden, sin ids prestados.

/**
 * El error, con la marca de si conviene reintentar: el servidor con
 * problemas (5xx), demasiados pedidos (429) o sin sesión (401) no dicen que
 * lo que se quería guardar esté mal. La cola los reintenta más tarde.
 */
function falloDe(error: { message: string }, status: number): ServiceError {
  const e = new ServiceError(error.message, error as never);
  if (status === 0 || status === 401 || status === 429 || status >= 500) Object.assign(e, { reintentable: true });
  return e;
}

/** La entrega de este alumno en esta actividad, si existe. */
export async function getMySubmission(activityId: string, studentId: string): Promise<ActivitySubmission | null> {
  const { data, error, status } = await supabase
    .from('activity_submissions')
    .select('*')
    .eq('activity_id', activityId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw falloDe(error, status);
  return data ? mapSubmission(data) : null;
}

/**
 * Empezar: crea la entrega si no existe. Si ya hay una (empezada en otro
 * equipo, o "no entregó" anotado por el docente), la deja como está y la
 * pone en curso si estaba pendiente.
 */
export async function iniciarEntrega(activityId: string, studentId: string, startedAt: string): Promise<void> {
  const { error, status } = await supabase
    .from('activity_submissions')
    .upsert(
      { activity_id: activityId, student_id: studentId, status: 'in_progress', started_at: startedAt },
      { onConflict: 'activity_id,student_id', ignoreDuplicates: true },
    );
  if (error) throw falloDe(error, status);
  const { error: e2, status: s2 } = await supabase
    .from('activity_submissions')
    .update({ status: 'in_progress' })
    .eq('activity_id', activityId)
    .eq('student_id', studentId)
    .eq('status', 'pending');
  if (e2) throw falloDe(e2, s2);
}

/**
 * Una escritura que no tocó ninguna fila: si la entrega existe y ya se
 * entregó (desde otro equipo, o la corrigió el docente), está bien: la base
 * ignora lo tardío a propósito. Si no existe, es un error que tiene que
 * verse (si no, el trabajo se perdería en silencio).
 */
async function sinFilaEsError(activityId: string, studentId: string): Promise<void> {
  const sub = await getMySubmission(activityId, studentId);
  if (!sub) {
    throw new ServiceError('No se encontró la entrega en el servidor: puede que la actividad ya no esté publicada.');
  }
}

export async function guardarAvance(
  activityId: string,
  studentId: string,
  updates: { answers?: Record<string, ActivityAnswer>; responseText?: string; timeSpentSeconds?: number },
): Promise<void> {
  const db: Record<string, unknown> = {};
  if (updates.answers !== undefined) db.answers = updates.answers;
  if (updates.responseText !== undefined) db.response_text = updates.responseText;
  if (updates.timeSpentSeconds !== undefined) db.time_spent_seconds = updates.timeSpentSeconds;
  const { data, error, status } = await supabase
    .from('activity_submissions')
    .update(db as never)
    .eq('activity_id', activityId)
    .eq('student_id', studentId)
    .select('id');
  if (error) throw falloDe(error, status);
  if (!data?.length) await sinFilaEsError(activityId, studentId);
}

export async function entregar(
  activityId: string,
  studentId: string,
  payload: { answers: Record<string, ActivityAnswer>; responseText?: string; timeSpentSeconds: number },
): Promise<void> {
  // auto_score, `correct` de cada respuesta y submitted_at los pone la base
  const { data, error, status } = await supabase
    .from('activity_submissions')
    .update({
      answers: payload.answers as never,
      response_text: payload.responseText ?? null,
      time_spent_seconds: payload.timeSpentSeconds,
      status: 'submitted',
    })
    .eq('activity_id', activityId)
    .eq('student_id', studentId)
    .select('id');
  if (error) throw falloDe(error, status);
  if (!data?.length) await sinFilaEsError(activityId, studentId);
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

/** Una entrega esperando nota, con todo lo necesario para corregirla sin abrir otra pantalla. */
export interface PendingGrading {
  submissionId: string;
  studentName: string;
  avatarInitials: string;
  activityId: string;
  activityTitle: string;
  subjectName: string;
  courseName: string;
  points: number | null;
  autoScore: number | null;
  submittedAt: string | null;
  answers: Record<string, ActivityAnswer>;
  responseText?: string | null;
  questions: ActivityQuestion[];
  /** La entregó en papel (063): no hay respuestas en la app */
  enPapel?: boolean;
  /** Consigna de la actividad (para sugerir la devolución con IA). */
  activityContent?: string;
  activityDescription?: string | null;
}

/**
 * Todo lo que el docente tiene pendiente de corregir, de todas sus
 * actividades juntas. Antes había que entrar actividad por actividad.
 */
export async function getPendingGrading(teacherId: string): Promise<PendingGrading[]> {
  const data = unwrap(
    await supabase
      .from('activity_submissions')
      .select(
        'id, auto_score, submitted_at, answers, response_text, registro,' +
        ' students(first_name, last_name, avatar_initials),' +
        ' activities!inner(id, title, description, content_md, points, questions, teacher_id, subjects(name), courses(name))'
      )
      .eq('activities.teacher_id', teacherId)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true })
  );

  return data.map((r: any) => ({
    submissionId: r.id,
    studentName: r.students ? `${r.students.first_name} ${r.students.last_name}` : 'Estudiante',
    avatarInitials: r.students?.avatar_initials ?? '??',
    activityId: r.activities?.id ?? '',
    activityTitle: r.activities?.title ?? 'Actividad',
    subjectName: r.activities?.subjects?.name ?? '',
    courseName: r.activities?.courses?.name ?? '',
    points: r.activities?.points != null ? Number(r.activities.points) : null,
    autoScore: r.registro === 'papel' || r.auto_score == null ? null : Number(r.auto_score),
    enPapel: r.registro === 'papel',
    submittedAt: r.submitted_at,
    answers: r.answers ?? {},
    responseText: r.response_text,
    questions: r.activities?.questions ?? [],
    activityContent: r.activities?.content_md ?? '',
    activityDescription: r.activities?.description ?? null,
  }));
}

/** Cuántas entregas esperan nota (para el contador de "por corregir"). */
export async function getPendingGradingCount(teacherId: string): Promise<number> {
  const { count } = await supabase
    .from('activity_submissions')
    .select('id, activities!inner(teacher_id)', { count: 'exact', head: true })
    .eq('activities.teacher_id', teacherId)
    .eq('status', 'submitted');
  return count ?? 0;
}
