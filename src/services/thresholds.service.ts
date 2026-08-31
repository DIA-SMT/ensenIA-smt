/**
 * ENSEÑIA SMT — Umbrales de alerta por escuela (Fase 2)
 *
 * Cada escuela ajusta cuándo el sistema debe avisar. Los defaults
 * replican los de get_alert_thresholds() en la migración 010: si no
 * hay fila, el trigger y la UI ven exactamente lo mismo.
 */

import { supabase } from './_helpers';
import type { AlertThresholds } from '../types';

export const DEFAULT_THRESHOLDS: Omit<AlertThresholds, 'schoolId'> = {
  negativeCheckinsCount: 2,
  negativeCheckinsDays: 7,
  lowScorePct: 40,
  inactivityDays: 14,
  escalationHours: 72,
};

export async function getThresholds(schoolId: string): Promise<AlertThresholds> {
  const { data, error } = await supabase
    .from('alert_thresholds')
    .select('*')
    .eq('school_id', schoolId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { schoolId, ...DEFAULT_THRESHOLDS };
  return {
    schoolId: data.school_id,
    negativeCheckinsCount: data.negative_checkins_count,
    negativeCheckinsDays: data.negative_checkins_days,
    lowScorePct: data.low_score_pct,
    inactivityDays: data.inactivity_days,
    escalationHours: data.escalation_hours,
  };
}

/** updated_by/updated_at los sella el trigger del servidor con auth.uid()/now(). */
export async function saveThresholds(t: AlertThresholds): Promise<void> {
  const { error } = await supabase.from('alert_thresholds').upsert({
    school_id: t.schoolId,
    negative_checkins_count: t.negativeCheckinsCount,
    negative_checkins_days: t.negativeCheckinsDays,
    low_score_pct: t.lowScorePct,
    inactivity_days: t.inactivityDays,
    escalation_hours: t.escalationHours,
  });
  if (error) throw error;
}
