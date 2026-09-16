/**
 * SMT EstudIA — Clase en vivo
 *
 * El docente dicta su clase tradicional y, cuando quiere, lanza una
 * actividad desde cualquier dispositivo (celu, tablet o compu). Los
 * estudiantes responden desde el celular y todos ven los resultados
 * agregados en vivo. Tiempo real por polling liviano (~2s, sin
 * websockets): cada respuesta pesa unos pocos cientos de bytes, así
 * que funciona hasta con datos móviles escasos.
 */

import { supabase, unwrap } from './_helpers';
import type { CheckinFeeling } from '../types';

// ── Tipos ──

export type LiveActivityKind = 'encuesta' | 'quiz' | 'chips' | 'texto' | 'nube' | 'checkin';
export type LiveActivityStatus = 'active' | 'revealed' | 'closed';

export interface LiveOption {
  id: string;
  label: string;
}

export interface LiveActivityConfig {
  question?: string;
  options?: LiveOption[];
  /** quiz: id de la opción correcta */
  correctId?: string;
  placeholder?: string;
}

export interface LiveSession {
  id: string;
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  title: string;
  status: 'live' | 'ended';
  reactionsEnabled: boolean;
  /** Sala abierta a gente sin cuenta (QR de invitados). */
  guestsEnabled: boolean;
  /** Código corto de 6 caracteres que se proyecta junto al QR. */
  joinCode: string | null;
  createdAt: string;
  endedAt?: string | null;
}

export interface LiveActivity {
  id: string;
  sessionId: string;
  kind: LiveActivityKind;
  config: LiveActivityConfig;
  status: LiveActivityStatus;
  createdAt: string;
}

export interface LiveResults {
  activityId: string;
  kind: LiveActivityKind;
  status: LiveActivityStatus;
  courseTotal: number;
  responded: number;
  counts: Record<string, number>;
  texts: { id: string; name: string | null; text: string }[];
  words: { word: string; n: number }[];
}

/** Emojis de la botonera (el docente la prende y apaga). */
export const LIVE_REACTIONS: { emoji: string; label: string; alert?: boolean }[] = [
  { emoji: '👏', label: 'Aplausos' },
  { emoji: '💡', label: 'Lo entendí' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '🔥', label: 'Buenísimo' },
  { emoji: '🐢', label: 'Más despacio', alert: true },
  { emoji: '❓', label: 'No entiendo', alert: true },
];

export const LIVE_KIND_META: Record<LiveActivityKind, { emoji: string; label: string; desc: string }> = {
  checkin: { emoji: '💙', label: 'Check-in emocional', desc: '¿Cómo vienen con la clase? Sin nota, sin nombres entre ellos' },
  quiz: { emoji: '✅', label: 'Pregunta rápida', desc: 'Opciones con una correcta: revelás cuando quieras' },
  encuesta: { emoji: '📊', label: 'Encuesta', desc: 'Opinión del curso, sin respuesta correcta' },
  chips: { emoji: '🧩', label: 'Multi-selección', desc: 'Pueden marcar varias opciones' },
  nube: { emoji: '☁️', label: 'Nube de palabras', desc: 'Una palabra por estudiante, crece en pantalla' },
  texto: { emoji: '💬', label: 'Respuesta libre', desc: 'Texto corto: ideas, dudas, ejemplos' },
};

// ── Mapeos ──

function mapSession(row: any): LiveSession {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    schoolId: row.school_id,
    subjectId: row.subject_id,
    courseId: row.course_id,
    title: row.title,
    status: row.status,
    reactionsEnabled: row.reactions_enabled,
    guestsEnabled: row.guests_enabled,
    joinCode: row.join_code,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

function mapActivity(row: any): LiveActivity {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    config: row.config ?? {},
    status: row.status,
    createdAt: row.created_at,
  };
}

// ── Sesiones (docente) ──

export async function getMyLiveSession(teacherId: string): Promise<LiveSession | null> {
  const { data } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapSession(data) : null;
}

export async function startLiveSession(s: {
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  title: string;
}): Promise<LiveSession> {
  const { data, error } = await supabase
    .from('live_sessions')
    .insert({
      teacher_id: s.teacherId,
      school_id: s.schoolId,
      subject_id: s.subjectId,
      course_id: s.courseId,
      title: s.title,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya hay una clase en vivo activa para ese curso. Terminala antes de abrir otra.');
    }
    throw error;
  }
  return mapSession(data);
}

export async function endLiveSession(id: string): Promise<void> {
  const { error } = await supabase
    .from('live_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function setReactionsEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('live_sessions')
    .update({ reactions_enabled: enabled })
    .eq('id', id);
  if (error) throw error;
}

// ── Sesión + actividad actual (lo pollean docente y estudiante) ──

export async function getSessionState(sessionId: string): Promise<{ session: LiveSession; activity: LiveActivity | null } | null> {
  const { data: ses } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (!ses) return null;

  const { data: act } = await supabase
    .from('live_activities')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { session: mapSession(ses), activity: act ? mapActivity(act) : null };
}

/** Sesión en vivo del curso del estudiante (para el banner y su pantalla). */
export async function getLiveSessionForCourse(courseId: string): Promise<LiveSession | null> {
  const { data } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('course_id', courseId)
    .eq('status', 'live')
    .maybeSingle();
  return data ? mapSession(data) : null;
}

// ── Actividades ──

export async function launchActivity(
  sessionId: string,
  kind: LiveActivityKind,
  config: LiveActivityConfig,
): Promise<LiveActivity> {
  // Cierra la anterior: en el celular del estudiante desaparece sola (poll).
  await supabase
    .from('live_activities')
    .update({ status: 'closed' })
    .eq('session_id', sessionId)
    .in('status', ['active', 'revealed']);

  const data = unwrap(
    await supabase
      .from('live_activities')
      .insert({ session_id: sessionId, kind, config: config as never })
      .select('*')
  );
  return mapActivity((data as any[])[0]);
}

export async function setActivityStatus(id: string, status: LiveActivityStatus): Promise<void> {
  const { error } = await supabase.from('live_activities').update({ status }).eq('id', id);
  if (error) throw error;
}

// ── Resultados agregados (RPC, una llamada por poll) ──

export async function getLiveResults(activityId: string): Promise<LiveResults | null> {
  const { data, error } = await supabase.rpc('get_live_results', { p_activity: activityId });
  if (error) throw error;
  return (data as LiveResults | null) ?? null;
}

// ── Respuestas del estudiante ──

export async function upsertLiveResponse(
  activityId: string,
  sessionId: string,
  studentId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('live_responses')
    .upsert(
      { activity_id: activityId, session_id: sessionId, student_id: studentId, payload: payload as never },
      { onConflict: 'activity_id,student_id' },
    );
  if (error) throw error;
}

export async function getMyLiveResponse(
  activityId: string,
  studentId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('live_responses')
    .select('payload')
    .eq('activity_id', activityId)
    .eq('student_id', studentId)
    .maybeSingle();
  return (data?.payload as Record<string, unknown>) ?? null;
}

// ── Reacciones ──

export async function sendLiveReaction(sessionId: string, studentId: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('live_reactions')
    .insert({ session_id: sessionId, student_id: studentId, emoji });
  if (error) throw error;
}

/** Reacciones recientes (docente): últimas N desde un instante dado. */
export async function getRecentReactions(sessionId: string, sinceIso: string): Promise<{ emoji: string; createdAt: string }[]> {
  const data = unwrap(
    await supabase
      .from('live_reactions')
      .select('emoji, created_at')
      .eq('session_id', sessionId)
      .gt('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(60)
  );
  return data.map((r: any) => ({ emoji: r.emoji, createdAt: r.created_at }));
}

// ── Check-in vivo → también alimenta el bienestar del estudiante ──

export async function saveLiveCheckin(studentId: string, feeling: CheckinFeeling): Promise<void> {
  // La ficha de bienestar (señales, alertas, resumen IA) se alimenta de student_checkins.
  const { error } = await supabase.from('student_checkins').insert({
    student_id: studentId,
    activity_id: null,
    moment: 'libre',
    feeling,
    comment: null,
  });
  if (error) throw error;
}

// ── Sala abierta a invitados (migración 012) ──

/**
 * Abre o cierra la sala a gente sin cuenta. Apagado por default: en una
 * clase normal los que participan son los estudiantes del curso y nadie
 * más. Se prende para una presentación, una jornada o una visita.
 */
export async function setGuestsEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('live_sessions')
    .update({ guests_enabled: enabled })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Borra una respuesta suelta. Con invitados anónimos, lo que alguien
 * escribe en "respuesta libre" o en la nube de palabras queda proyectado
 * en una pared: el docente tiene que poder sacarlo sin frenar la clase.
 */
export async function deleteLiveResponse(id: string): Promise<void> {
  const { error } = await supabase.from('live_responses').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Cuántos invitados están realmente en la sala ahora.
 *
 * Cuenta los vistos en los últimos 2 minutos, no los que alguna vez
 * entraron: en la pantalla proyectada el número tiene que ser el de la
 * gente que está, no un acumulado que solo sube.
 */
export async function getConnectedGuests(sessionId: string): Promise<number> {
  const since = new Date(Date.now() - 120_000).toISOString();
  const { count, error } = await supabase
    .from('live_guests')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .gt('last_seen_at', since);
  if (error) throw error;
  return count ?? 0;
}
