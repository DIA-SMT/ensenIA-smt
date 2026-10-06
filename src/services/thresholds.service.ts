/**
 * SMT EstudIA — Umbrales de alerta por escuela (Fase 2)
 *
 * Cada escuela ajusta cuándo el sistema debe avisar. Los defaults
 * replican los de get_alert_thresholds() en la migración 046: si no
 * hay fila, el trigger y la UI ven exactamente lo mismo.
 */

import { supabase } from './_helpers';
import { PASSING_GRADE } from './libreta.service';
import type { AlertThresholds, DecemberRule } from '../types';

export const DEFAULT_THRESHOLDS: Omit<AlertThresholds, 'schoolId'> = {
  negativeCheckinsCount: 2,
  negativeCheckinsDays: 7,
  lowScorePct: 40,
  inactivityDays: 14,
  escalationHours: 72,
  gradeRiskMax: 5,
  gradeFailMax: 4,
  decemberRule: 'trimestre',
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
    gradeRiskMax: Number(data.grade_risk_max),
    gradeFailMax: Number(data.grade_fail_max),
    // Antes de la 046 la columna no existe: la regla de siempre
    decemberRule: data.december_rule === 'anual' ? 'anual' : 'trimestre',
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
    grade_risk_max: t.gradeRiskMax,
    grade_fail_max: t.gradeFailMax,
    december_rule: t.decemberRule,
  });
  if (error) throw error;
}

type ReglaNotas = Pick<AlertThresholds, 'gradeFailMax' | 'decemberRule'>;

/**
 * ¿Esta nota, sola, ya manda la materia a diciembre? Es lo que la libreta
 * marca mientras el docente carga. Con la regla anual también cuenta el
 * promedio de los tres trimestres: eso lo calcula el servidor al publicar
 * (lleva_a_diciembre en la 046) y vuelve en carriesToDecember.
 */
export function notaLlevaADiciembre(nota: number, trimestre: number, regla: ReglaNotas): boolean {
  if (regla.decemberRule === 'anual') return trimestre === 3 && nota < PASSING_GRADE;
  return nota <= regla.gradeFailMax;
}

/** La regla en una frase, para explicársela al docente y a dirección. */
export function textoReglaDiciembre(regla: ReglaNotas): string {
  if (regla.decemberRule === 'anual') {
    return `la materia se lleva a diciembre si el 3er trimestre no llega a ${PASSING_GRADE} o si el promedio de los tres trimestres no llega a ${PASSING_GRADE}`;
  }
  return `una nota de ${regla.gradeFailMax} o menos en cualquier trimestre marca que la materia se lleva a diciembre`;
}

export const REGLAS_DICIEMBRE: { valor: DecemberRule; titulo: string; detalle: string }[] = [
  {
    valor: 'anual',
    titulo: 'Por el promedio del año',
    detalle: `Va a diciembre si el 3er trimestre no llega a ${PASSING_GRADE} o si el promedio de los tres no llega a ${PASSING_GRADE}. Una nota baja en el 1° o el 2° solo avisa a la familia.`,
  },
  {
    valor: 'trimestre',
    titulo: 'Por la nota de cada trimestre',
    detalle: 'Una nota igual o menor a la que elijas abajo, en cualquier trimestre, marca que la materia se lleva a diciembre.',
  },
];
