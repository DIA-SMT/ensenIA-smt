import { supabase, unwrap } from './_helpers';
import type { Alert, AlertOutcome } from '../types';

export async function getAlertsByTeacher(teacherId: string): Promise<Alert[]> {
  const data = unwrap(
    await supabase
      .from('alerts')
      .select('*, alert_students(student_id)')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
  );

  return data.map(mapAlert);
}

export async function getAlertsBySchool(schoolId: string): Promise<Alert[]> {
  const data = unwrap(
    await supabase
      .from('alerts')
      .select('*, alert_students(student_id)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
  );

  return data.map(mapAlert);
}

export async function getUnreadAlertCount(teacherId: string): Promise<number> {
  const { count, error } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('is_read', false);

  if (error) return 0;
  return count ?? 0;
}

export async function markAlertRead(alertId: string): Promise<void> {
  const { error } = await supabase.from('alerts').update({ is_read: true }).eq('id', alertId);
  if (error) throw error;
}

// ── Ciclo de vida (010): abierta → en seguimiento → cerrada ──
// Los UPDATE piden .select('id') para detectar el caso "0 filas" (la RLS
// filtró la alerta, o fue borrada): sin eso Supabase no devuelve error
// y la UI creería que la transición ocurrió.
// intervention_by/intervention_at los sella el trigger del servidor con
// auth.uid()/now(); el GRANT por columna ni siquiera permite mandarlos.

/** Tomar la alerta en seguimiento, registrando la intervención. */
export async function startFollowUp(alertId: string, note: string): Promise<void> {
  const { data, error } = await supabase
    .from('alerts')
    .update({
      status: 'en_seguimiento',
      intervention_note: note.trim(),
      is_read: true,
    })
    .eq('id', alertId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('La alerta ya no está disponible para actualizar.');
}

/**
 * Cerrar la alerta con resultado. `note` debe venir YA COMPUESTA por el
 * caller (si había intervención previa, concatenada — nunca pisarla).
 */
export async function closeAlert(
  alertId: string,
  outcome: AlertOutcome,
  note?: string,
): Promise<void> {
  const updates: Record<string, unknown> = {
    status: 'cerrada',
    closed_outcome: outcome,
    closed_at: new Date().toISOString(),
    is_read: true,
  };
  if (note?.trim()) {
    updates.intervention_note = note.trim();
  }
  const { data, error } = await supabase.from('alerts').update(updates).eq('id', alertId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('La alerta ya no está disponible para actualizar.');
}

function mapAlert(row: any): Alert {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    message: row.message,
    date: row.date_label ?? '',
    studentIds: row.alert_students?.map((as: any) => as.student_id) ?? [],
    teacherId: row.teacher_id ?? undefined,
    schoolId: row.school_id,
    isRead: row.is_read,
    createdAt: row.created_at,
    status: row.status ?? 'abierta',
    interventionNote: row.intervention_note,
    interventionBy: row.intervention_by,
    interventionAt: row.intervention_at,
    closedOutcome: row.closed_outcome,
    closedAt: row.closed_at,
    escalatedAt: row.escalated_at,
  };
}
