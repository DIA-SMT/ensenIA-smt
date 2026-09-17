/**
 * SMT EstudIA — Señales tempranas de bienestar
 *
 * Principio rector: la app detecta señales, NO diagnostica. Nunca dice
 * "posible depresión"; dice "hay un cambio sostenido que merece una
 * conversación". El diagnóstico es de profesionales; el rol del docente
 * es observar, conversar y derivar.
 *
 * Las reglas viven acá, en el cliente, a la vista: cada nivel llega al
 * docente con su porqué en palabras ("8 días por debajo de su línea,
 * dejó de responder en vivo"), nunca como un número opaco. Lo que la
 * literatura de screening escolar respalda:
 *   1. Cambio respecto a la PROPIA línea base, no el valor absoluto.
 *   2. Persistencia (el criterio clínico de interferencia es ~2 semanas;
 *      acá ámbar arranca antes, porque el objetivo es conversar temprano).
 *   3. Convergencia de dominios: ánimo + entregas + asistencia + vivo.
 *   4. El silencio es dato: quien contaba y dejó de contar.
 *   5. El pedido explícito ("quiero hablar") saltea todo el algoritmo.
 */

import { supabase } from './_helpers';

export type SignalLevel = 'verde' | 'ambar' | 'rojo';

export interface WellbeingSignal {
  studentId: string;
  level: SignalLevel;
  /** El porqué, en palabras del aula. Vacío en verde. */
  reasons: string[];
  /** Sugerencia del primer paso de la escalera de respuesta. */
  nextStep: string | null;
  helpRequested: boolean;
  metrics: {
    recentAvg: number | null;
    baseAvg: number | null;
    negStreak: number;
    daysSinceCheckin: number | null;
    subs14: number; subsPrev: number;
    abs30: number; absPrev: number;
    live14: number; livePrev: number;
  };
}

export const SIGNAL_META: Record<SignalLevel, { emoji: string; label: string; color: string }> = {
  verde: { emoji: '🟢', label: 'Sin señales', color: 'var(--success)' },
  ambar: { emoji: '🟡', label: 'Para mirar', color: 'var(--warning)' },
  rojo: { emoji: '🔴', label: 'Conversar ya', color: 'var(--danger, #F87171)' },
};

/** Racha de check-ins negativos consecutivos (confundido/frustrado), del más reciente hacia atrás. */
function negStreak(lastVals: number[]): number {
  let n = 0;
  for (const v of lastVals) {
    if (v <= 2) n++;
    else break;
  }
  return n;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Aplica las reglas a las métricas crudas del RPC. Devuelve nivel +
 * razones legibles. Umbrales conservadores a propósito: mejor pocas
 * alertas creíbles que muchas que se ignoran.
 */
function evaluate(raw: any): WellbeingSignal {
  const recentAvg: number | null = raw.recent_avg != null ? Number(raw.recent_avg) : null;
  const baseAvg: number | null = raw.base_avg != null ? Number(raw.base_avg) : null;
  const recentN: number = raw.recent_n ?? 0;
  const baseN: number = raw.base_n ?? 0;
  const lastVals: number[] = Array.isArray(raw.last_vals) ? raw.last_vals.map(Number) : [];
  const streak = negStreak(lastVals);
  const gap = daysSince(raw.last_checkin_at ?? null);
  const help: boolean = Boolean(raw.help_requested);
  const subs14 = raw.subs_14 ?? 0, subsPrev = raw.subs_prev ?? 0;
  const abs30 = raw.abs_30 ?? 0, absPrev = raw.abs_prev ?? 0;
  const live14 = raw.live_14 ?? 0, livePrev = raw.live_prev ?? 0;

  const reasons: string[] = [];

  // Caída respecto a su propia línea base (necesita base y datos recientes)
  const drop = baseAvg != null && recentAvg != null && baseN >= 3 && recentN >= 2
    ? baseAvg - recentAvg
    : 0;
  if (drop >= 1) {
    reasons.push(`Su ánimo viene ${drop >= 1.5 ? 'bastante' : ''} por debajo de lo habitual en él/ella (${recentAvg} vs. ${baseAvg} de su línea).`);
  }

  // Persistencia: racha de negativos consecutivos
  if (streak >= 3) {
    reasons.push(`${streak} check-ins negativos seguidos (confundido/frustrado).`);
  }

  // Silencio: contaba seguido y dejó de contar
  const silence = baseN >= 4 && gap != null && gap > 10;
  if (silence) {
    reasons.push(`Contaba cómo se sentía y hace ${gap} días que no lo hace. La ausencia también es dato.`);
  }

  // Convergencia de dominios académicos
  const subsDown = subsPrev >= 2 && subs14 <= subsPrev / 2;
  const absUp = abs30 >= 2 && abs30 > absPrev;
  const liveDown = livePrev >= 3 && live14 <= livePrev / 2;
  if (subsDown) reasons.push(`Entregó la mitad o menos que en las dos semanas anteriores (${subs14} vs. ${subsPrev}).`);
  if (absUp) reasons.push(`Las inasistencias vienen en aumento (${abs30} en 30 días, antes ${absPrev}).`);
  if (liveDown) reasons.push(`Participaba en las clases en vivo y bajó (${live14} vs. ${livePrev} respuestas).`);

  const academicDomains = [subsDown, absUp, liveDown].filter(Boolean).length;
  const emotional = drop >= 1 || streak >= 3;

  let level: SignalLevel = 'verde';
  if (help) {
    level = 'rojo';
    reasons.unshift('Pidió hablar con su docente en el check-in. Esto va primero que todo lo demás.');
  } else if ((emotional && academicDomains >= 1) || (drop >= 1.5 && streak >= 3)) {
    level = 'rojo';
  } else if (emotional || silence || academicDomains >= 2) {
    level = 'ambar';
  }

  const nextStep = level === 'rojo'
    ? (help
      ? 'Buscá un momento hoy para charlar en privado. Después registrá una observación.'
      : 'Convergen varias señales: conversá en privado esta semana y, si persiste, derivá a dirección/gabinete.')
    : level === 'ambar'
      ? 'Un comentario informal alcanza para empezar ("te noto distinto, ¿todo bien?"). Registralo si algo te llama la atención.'
      : null;

  return {
    studentId: raw.student_id,
    level,
    reasons: level === 'verde' ? [] : reasons,
    nextStep,
    helpRequested: help,
    metrics: {
      recentAvg, baseAvg, negStreak: streak, daysSinceCheckin: gap,
      subs14, subsPrev, abs30, absPrev, live14, livePrev,
    },
  };
}

/** Señales de todos los estudiantes del docente (o de la escuela, si es director). */
export async function getWellbeingSignals(): Promise<Map<string, WellbeingSignal>> {
  const { data, error } = await supabase.rpc('get_wellbeing_signals');
  if (error) throw error;
  const map = new Map<string, WellbeingSignal>();
  for (const raw of (data as any[]) ?? []) {
    const sig = evaluate(raw);
    map.set(sig.studentId, sig);
  }
  return map;
}

/**
 * Patrón por día de la semana sobre los check-ins de UN estudiante
 * (se calcula con lo que la ficha ya trae). Orienta la conversación:
 * peor los lunes → mirar el fin de semana/hogar; peor los viernes →
 * mirar la semana escolar. Es una pista, jamás una certeza.
 */
export function weekdayPattern(checkins: { createdAt: string; feeling: string }[]): string | null {
  const VAL: Record<string, number> = { genial: 5, bien: 4, neutral: 3, confundido: 2, frustrado: 1 };
  const early: number[] = [];  // lunes y martes
  const late: number[] = [];   // jueves y viernes
  for (const c of checkins) {
    const dow = new Date(c.createdAt).getDay();
    const v = VAL[c.feeling];
    if (v == null) continue;
    if (dow === 1 || dow === 2) early.push(v);
    if (dow === 4 || dow === 5) late.push(v);
  }
  if (early.length < 3 || late.length < 3) return null;
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const diff = avg(early) - avg(late);
  if (diff <= -0.8) return 'Tiende a venir peor los lunes que los viernes: puede que el peso esté fuera de la escuela.';
  if (diff >= 0.8) return 'Tiende a terminar la semana peor de lo que la empieza: puede que el peso esté en la semana escolar.';
  return null;
}
