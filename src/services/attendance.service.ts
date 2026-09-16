/**
 * SMT EstudIA — Asistencia
 *
 * Tomar asistencia tiene que costar un toque. Si el curso tuvo una clase
 * en vivo hoy, quienes participaron desde el celular vienen marcados
 * como presentes: el docente solo corrige las excepciones.
 */

import { supabase, unwrap } from './_helpers';

export type AttendanceStatus = 'presente' | 'ausente' | 'tarde' | 'justificado';

export const ATTENDANCE_META: Record<AttendanceStatus, { emoji: string; label: string; short: string }> = {
  presente: { emoji: '✅', label: 'Presente', short: 'P' },
  ausente: { emoji: '❌', label: 'Ausente', short: 'A' },
  tarde: { emoji: '🕐', label: 'Llegó tarde', short: 'T' },
  justificado: { emoji: '📄', label: 'Justificado', short: 'J' },
};

export interface AttendanceSession {
  id: string;
  teacherId: string;
  subjectId: string;
  courseId: string;
  takenOn: string;
  note?: string | null;
  updatedAt: string;
}

export interface AttendanceEntry {
  studentId: string;
  status: AttendanceStatus;
}

function mapSession(row: any): AttendanceSession {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    subjectId: row.subject_id,
    courseId: row.course_id,
    takenOn: row.taken_on,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

/** Fecha local en formato YYYY-MM-DD (no UTC: importa el día del aula). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** La toma de asistencia de ese día/curso/materia, si ya existe. */
export async function getAttendanceSession(
  teacherId: string,
  courseId: string,
  subjectId: string,
  takenOn: string,
): Promise<{ session: AttendanceSession; entries: AttendanceEntry[] } | null> {
  const { data: ses } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('course_id', courseId)
    .eq('subject_id', subjectId)
    .eq('taken_on', takenOn)
    .maybeSingle();

  if (!ses) return null;

  const records = unwrap(
    await supabase
      .from('attendance_records')
      .select('student_id, status')
      .eq('session_id', ses.id)
  );

  return {
    session: mapSession(ses),
    entries: records.map((r: any) => ({ studentId: r.student_id, status: r.status })),
  };
}

/** Estudiantes que hoy participaron desde el celular en la clase en vivo del curso. */
export async function getLiveParticipants(courseId: string, date: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_live_participants', {
    p_course: courseId,
    p_date: date,
  });
  if (error) {
    console.error('get_live_participants:', error);
    return [];
  }
  return ((data as { student_id: string }[]) ?? []).map(r => r.student_id);
}

/** Crea o actualiza la toma completa (upsert de la sesión + todos los registros). */
export async function saveAttendance(input: {
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  takenOn: string;
  note?: string;
  entries: AttendanceEntry[];
}): Promise<AttendanceSession> {
  const { data: ses, error } = await supabase
    .from('attendance_sessions')
    .upsert(
      {
        teacher_id: input.teacherId,
        school_id: input.schoolId,
        subject_id: input.subjectId,
        course_id: input.courseId,
        taken_on: input.takenOn,
        note: input.note?.trim() || null,
      },
      { onConflict: 'teacher_id,course_id,subject_id,taken_on' },
    )
    .select('*')
    .single();
  if (error || !ses) throw error ?? new Error('No se pudo guardar la asistencia.');

  if (input.entries.length > 0) {
    const { error: recErr } = await supabase
      .from('attendance_records')
      .upsert(
        input.entries.map(e => ({
          session_id: ses.id,
          student_id: e.studentId,
          status: e.status,
        })),
        { onConflict: 'session_id,student_id' },
      );
    if (recErr) throw recErr;
  }

  return mapSession(ses);
}

/** Historial reciente de tomas del docente (para saber si ya pasó lista hoy). */
export async function getRecentAttendance(teacherId: string, limit = 30): Promise<AttendanceSession[]> {
  const data = unwrap(
    await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('taken_on', { ascending: false })
      .limit(limit)
  );
  return data.map(mapSession);
}

/** Últimas inasistencias de un estudiante (para su ficha). */
export async function getAbsencesByStudent(studentId: string, limit = 10): Promise<{ date: string; status: AttendanceStatus }[]> {
  const data = unwrap(
    await supabase
      .from('attendance_records')
      .select('status, attendance_sessions(taken_on)')
      .eq('student_id', studentId)
      .neq('status', 'presente')
      .order('created_at', { ascending: false })
      .limit(limit)
  );
  return data.map((r: any) => ({
    date: r.attendance_sessions?.taken_on ?? '',
    status: r.status,
  }));
}
