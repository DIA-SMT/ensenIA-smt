import { supabase, unwrap } from './_helpers';
import type { Alert, AlertOutcome } from '../types';

export async function getAlertsByTeacher(teacherId: string): Promise<Alert[]> {
  const data = unwrap(
    await supabase
      .from('alerts')
      .select('*, alert_students(student_id), docente:profiles!alerts_teacher_id_fkey(first_name, last_name)')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
  );

  return data.map(mapAlert);
}

export async function getAlertsBySchool(schoolId: string): Promise<Alert[]> {
  const data = unwrap(
    await supabase
      .from('alerts')
      .select('*, alert_students(student_id), docente:profiles!alerts_teacher_id_fkey(first_name, last_name)')
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
    escalatedBy: row.escalated_by ?? null,
    escalationReason: row.escalation_reason ?? null,
    teacherName: row.docente ? `${row.docente.first_name} ${row.docente.last_name}` : undefined,
  };
}

// ── Avisos entre personas (051) ──

/** De qué se trata el aviso a dirección desde la ficha de un alumno. */
export const TEMAS_AVISO: { valor: string; label: string }[] = [
  { valor: 'convivencia', label: 'Convivencia' },
  { valor: 'bienestar', label: 'Bienestar' },
  { valor: 'aprendizaje', label: 'Aprendizaje' },
  { valor: 'asistencia', label: 'Asistencia' },
  { valor: 'familia', label: 'La familia' },
  { valor: 'otro', label: 'Otro' },
];

const sinLa051 = (code?: string) => code === 'PGRST202';
const MENSAJE_SIN_051 = 'Falta correr la migración 051_avisos_entre_personas.sql en Supabase.';

/** El docente le avisa a dirección desde una alerta suya: queda escalada y le llega a cada directivo. */
export async function avisarADireccion(alertId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('avisar_a_direccion', { p_alert: alertId, p_motivo: motivo.trim() });
  if (error) throw new Error(sinLa051(error.code) ? MENSAJE_SIN_051 : error.message);
}

/** El docente le avisa a dirección sobre un alumno que tiene a cargo, sin alerta previa. */
export async function avisarADireccionPorAlumno(studentId: string, tema: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('avisar_a_direccion_por_alumno', { p_student: studentId, p_tema: tema, p_motivo: motivo.trim() });
  if (error) throw new Error(sinLa051(error.code) ? MENSAJE_SIN_051 : error.message);
}

/** Lo que dirección tiene pendiente: alertas escaladas (por un docente o por el tiempo) y sin cerrar. */
export async function getEscaladasPendientes(schoolId: string): Promise<number> {
  const { count, error } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .not('escalated_at', 'is', null)
    .neq('status', 'cerrada');
  if (error) return 0;
  return count ?? 0;
}

export interface DocenteDelAlumno {
  teacherId: string;
  nombre: string;
  materias: string;
}

/** Los docentes del curso del alumno, para elegir con quién quiere hablar. */
export async function getMisDocentes(): Promise<DocenteDelAlumno[]> {
  const { data, error } = await supabase.rpc('mis_docentes');
  if (error) throw new Error(sinLa051(error.code) ? MENSAJE_SIN_051 : error.message);
  return (data ?? []).map(d => ({ teacherId: d.teacher_id, nombre: d.nombre, materias: d.materias }));
}

/** El alumno pide hablar con un docente (o con cualquiera de los suyos, con null). */
export async function pedirHablarConDocente(teacherId: string | null, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('pedir_hablar_con_docente', {
    p_teacher: teacherId, p_motivo: motivo.trim() || null,
  });
  if (error) throw new Error(sinLa051(error.code) ? MENSAJE_SIN_051 : error.message);
}
