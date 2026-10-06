/**
 * SMT EstudIA — contabilidad de llamadas a la IA, compartida por las
 * Edge Functions que llaman a OpenRouter.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface EventoConsumo {
  user_id: string; school_id?: string | null; role?: string | null;
  feature: string; detail?: string | null; model?: string | null;
  tokens_in?: number; tokens_out?: number; cost_usd?: number | null; tts_chars?: number;
}

/**
 * Anota la llamada para la pantalla "Consumo de IA" del superadmin
 * (tabla ia_events, migración 040). Si falla no frena nada: es
 * contabilidad, no la respuesta.
 */
export async function registrarConsumo(db: SupabaseClient, ev: EventoConsumo): Promise<void> {
  try {
    const { error } = await db.from('ia_events').insert(ev);
    if (error) console.error('ia_events insert:', error.message);
  } catch (e) {
    console.error('ia_events insert:', String(e));
  }
}

/** Lo que cobró OpenRouter por la llamada (viene si se pide usage: { include: true }). */
export function costoDe(usage: unknown): number | null {
  const c = (usage as { cost?: unknown } | null | undefined)?.cost;
  return typeof c === 'number' && Number.isFinite(c) ? c : null;
}
