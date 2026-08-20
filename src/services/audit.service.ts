/**
 * ENSEÑIA SMT — Audit Service
 *
 * Bitácora de acceso a datos sensibles (fichas de estudiantes y docentes).
 * Fire-and-forget: el registro nunca debe romper la UX.
 * La RLS solo permite a staff insertar filas propias (user_id = auth.uid())
 * dentro de la propia escuela; la lee dirección.
 * userLabel denormaliza la identidad del actor: la bitácora debe seguir
 * siendo legible aunque la cuenta se dé de baja.
 *
 * Alcance Fase 0: registra los accesos hechos desde la app (advisory).
 * El registro forzado en servidor (RPC que loguea y devuelve) es Fase 1.
 */

import { supabase } from './_helpers';

export type AuditAction = 'view_student_profile' | 'view_teacher_profile';

export async function logAccess(params: {
  userId: string;
  userLabel: string;
  schoolId: string;
  action: AuditAction;
  entityType: 'student' | 'teacher';
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    user_id: params.userId,
    user_label: params.userLabel,
    school_id: params.schoolId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata: (params.metadata ?? {}) as any,
  });
  if (error) console.error('logAccess:', error.message);
}
