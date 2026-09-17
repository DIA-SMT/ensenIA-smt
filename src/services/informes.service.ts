/**
 * SMT EstudIA — Trazabilidad del estudiante
 *
 * Toda acción del estudiante ya deja huella en su tabla (entregas,
 * eventos de actividad, respuestas en vivo, conexiones, check-ins,
 * logros, reacciones a materiales, asistencia). Este servicio NO crea
 * registros nuevos: unifica lo que existe en una sola línea de tiempo
 * para verla en pantalla o bajarla como informe (por materia o global).
 * RLS hace el recorte solo: el docente ve lo de sus materias/sesiones,
 * dirección lo de su escuela.
 */

import { supabase, unwrap } from './_helpers';

export type TraceKind =
  | 'entrega' | 'evento' | 'vivo' | 'conexion'
  | 'checkin' | 'logro' | 'material' | 'asistencia';

export const TRACE_META: Record<TraceKind, { emoji: string; label: string }> = {
  entrega: { emoji: '📝', label: 'Actividades' },
  evento: { emoji: '👀', label: 'Huella de trabajo' },
  vivo: { emoji: '📡', label: 'Clase en vivo' },
  conexion: { emoji: '🔌', label: 'Conexiones' },
  checkin: { emoji: '💙', label: 'Check-ins' },
  logro: { emoji: '🏅', label: 'Logros' },
  material: { emoji: '📚', label: 'Materiales' },
  asistencia: { emoji: '✋', label: 'Asistencia' },
};

export interface TraceEvent {
  date: string;           // ISO
  kind: TraceKind;
  label: string;          // qué pasó, en una línea
  subjectName: string | null;
  detail?: string;
}

export interface StudentTrace {
  events: TraceEvent[];
  stats: {
    entregas: number;
    calificadas: number;
    respuestasVivo: number;
    conexionesVivo: number;
    checkins: number;
    logros: number;
    inasistencias: number;
  };
}

const FEELING_LABEL: Record<string, string> = {
  genial: 'Genial', bien: 'Bien', neutral: 'Más o menos',
  confundido: 'Confundido/a', frustrado: 'Frustrado/a',
};

/**
 * Línea de tiempo completa de un estudiante. `subjectId` la recorta a
 * una materia (lo que no es de una materia —check-ins, logros,
 * asistencia— entra solo en la vista global).
 */
export async function getStudentTrace(studentId: string, subjectId?: string): Promise<StudentTrace> {
  const events: TraceEvent[] = [];

  // Entregas de actividades (con nota si la hay)
  let subsQuery = supabase
    .from('activity_submissions')
    .select('status, score, auto_score, updated_at, time_spent_seconds, activities!inner(title, subject_id, subjects(name))')
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false })
    .limit(120);
  if (subjectId) subsQuery = subsQuery.eq('activities.subject_id', subjectId);
  const subs = unwrap(await subsQuery);
  for (const r of subs as any[]) {
    const status = r.status === 'graded' ? `calificada${r.score != null ? `: ${r.score}` : ''}`
      : r.status === 'submitted' ? `entregada${r.auto_score != null ? ` · auto ${r.auto_score}` : ''}`
      : 'en curso';
    events.push({
      date: r.updated_at,
      kind: 'entrega',
      label: `${r.activities?.title ?? 'Actividad'} — ${status}`,
      subjectName: r.activities?.subjects?.name ?? null,
      detail: r.time_spent_seconds ? `${Math.round(r.time_spent_seconds / 60)} min de trabajo` : undefined,
    });
  }

  // Respuestas en clase en vivo (qué actividad, de qué sesión)
  let liveQuery = supabase
    .from('live_responses')
    .select('created_at, live_activities!inner(kind, config), live_sessions!inner(title, subject_id, subjects(name))')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(120);
  if (subjectId) liveQuery = liveQuery.eq('live_sessions.subject_id', subjectId);
  const liveResponses = unwrap(await liveQuery);
  for (const r of liveResponses as any[]) {
    const q = r.live_activities?.config?.question;
    events.push({
      date: r.created_at,
      kind: 'vivo',
      label: `Respondió en vivo${q ? `: "${String(q).slice(0, 70)}"` : ''}`,
      subjectName: r.live_sessions?.subjects?.name ?? null,
    });
  }

  // Conexiones a clases en vivo (presencia)
  let presQuery = supabase
    .from('live_presence')
    .select('last_seen_at, live_sessions!inner(title, subject_id, subjects(name))')
    .eq('student_id', studentId)
    .order('last_seen_at', { ascending: false })
    .limit(60);
  if (subjectId) presQuery = presQuery.eq('live_sessions.subject_id', subjectId);
  const presence = unwrap(await presQuery);
  for (const r of presence as any[]) {
    events.push({
      date: r.last_seen_at,
      kind: 'conexion',
      label: `Se conectó a la clase en vivo (${r.live_sessions?.title ?? ''})`,
      subjectName: r.live_sessions?.subjects?.name ?? null,
    });
  }

  // Solo en la vista global: lo que no pertenece a una materia
  let checkins: any[] = [];
  let achievements: any[] = [];
  let absences: any[] = [];
  if (!subjectId) {
    checkins = unwrap(
      await supabase
        .from('student_checkins')
        .select('created_at, feeling, moment')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(60)
    );
    for (const r of checkins) {
      events.push({
        date: r.created_at,
        kind: 'checkin',
        label: `Contó cómo se sentía: ${FEELING_LABEL[r.feeling] ?? r.feeling}`,
        subjectName: null,
      });
    }

    achievements = unwrap(
      await supabase
        .from('student_achievements')
        .select('created_at, title, emoji, points')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(60)
    );
    for (const r of achievements) {
      events.push({
        date: r.created_at,
        kind: 'logro',
        label: `Logro: ${r.emoji ?? '🏅'} ${r.title} (+${r.points ?? 0})`,
        subjectName: null,
      });
    }

    absences = unwrap(
      await supabase
        .from('attendance_records')
        .select('status, attendance_sessions!inner(taken_on)')
        .eq('student_id', studentId)
        .in('status', ['ausente', 'tarde', 'justificado'])
        .limit(120)
    );
    for (const r of absences as any[]) {
      events.push({
        date: `${r.attendance_sessions?.taken_on}T12:00:00Z`,
        kind: 'asistencia',
        label: r.status === 'tarde' ? 'Llegó tarde' : r.status === 'justificado' ? 'Falta justificada' : 'Faltó a clase',
        subjectName: null,
      });
    }
  }

  events.sort((a, b) => b.date.localeCompare(a.date));

  return {
    events,
    stats: {
      entregas: (subs as any[]).length,
      calificadas: (subs as any[]).filter(r => r.status === 'graded').length,
      respuestasVivo: (liveResponses as any[]).length,
      conexionesVivo: (presence as any[]).length,
      checkins: checkins.length,
      logros: achievements.length,
      inasistencias: (absences as any[]).filter((r: any) => r.status !== 'justificado').length,
    },
  };
}
