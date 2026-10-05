/**
 * Consumo de IA de todo el sistema (pantalla del superadmin).
 *
 * Lo arma la base con ia_consumption (migración 040): usos y tokens salen
 * de ia_usage, que tiene historia; el costo y el detalle por función, de
 * ia_events, que se llena desde que se despliegan las funciones nuevas.
 */

import { supabase } from './_helpers';

export interface ConsumoFila {
  usos: number;
  tokens: number;
  personas: number;
  costo_usd: number | null;
}

export interface ConsumoIA {
  desde: string;
  hasta: string;
  totales: {
    usos: number;
    tokens: number;
    personas: number;
    usos_hoy: number;
    personas_hoy: number;
    costo_usd: number | null;
    costo_hoy_usd: number | null;
    llamadas: number;
    caracteres_voz: number;
    /** Desde cuándo hay costo registrado; null si todavía nada. */
    costo_desde: string | null;
  };
  por_dia: { dia: string; usos: number; tokens: number; costo_usd: number | null }[];
  por_escuela: (ConsumoFila & { escuela: string })[];
  por_rol: (ConsumoFila & { rol: string })[];
  por_funcion: {
    funcion: string;
    modelo: string | null;
    llamadas: number;
    tokens: number;
    costo_usd: number | null;
    caracteres_voz: number;
  }[];
  /** Solo docentes, dirección y superadmin (los chicos van sumados por rol). */
  personas: {
    nombre: string;
    email: string;
    rol: string;
    escuela: string;
    usos: number;
    tokens: number;
    usos_hoy: number;
    costo_usd: number | null;
  }[];
}

export async function getConsumoIA(dias: number): Promise<ConsumoIA> {
  const { data, error } = await supabase.rpc('ia_consumption', { p_days: dias });
  if (error) {
    // La función todavía no existe: falta correr la migración 040
    if (error.code === 'PGRST202' || /ia_consumption/.test(error.message)) {
      throw new Error('Falta correr la migración 040_consumo_ia.sql en Supabase.');
    }
    throw new Error(error.message);
  }
  return data as unknown as ConsumoIA;
}
