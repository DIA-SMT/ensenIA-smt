/**
 * Camino Docente Tech (082): lo del docente, lo que ve la dirección si él lo
 * comparte, y la meta de la escuela (sin nombres). Todo lo calcula la base.
 */

import { supabase } from './_helpers';
import type { NumerosCamino } from '../lib/caminoDocente';

export interface MiCamino extends NumerosCamino {
  puntos: number;
  nivel: number;
  /** Desde cuántos puntos empieza cada nivel */
  umbrales: number[];
  /** Cuánto vale cada cosa (las claves de QUE_SUMA) */
  pesos: Record<string, number>;
  /** Subió de nivel con esta consulta */
  subio: boolean;
  primeraVez: boolean;
}

export interface MetaEscuela {
  clasesEnVivo: number;
  actividades: number;
  materiales: number;
  devoluciones: number;
  docentes: number;
  docentesEstaSemana: number;
}

function falla(error: { code?: string; message?: string }, porDefecto: string): Error {
  if (error.code === 'PGRST202' || error.code === '42883') return new Error('Falta correr la migración 082_camino_docente.sql.');
  return new Error(porDefecto);
}

/** El suyo. Si subió de nivel, la base lo anota (y avisa a la dirección si comparte). */
export async function getMiCamino(): Promise<MiCamino> {
  const { data, error } = await supabase.rpc('mi_camino_docente' as never);
  if (error) throw falla(error, 'No se pudo cargar tu camino.');
  return data as unknown as MiCamino;
}

/** La dirección: el de un docente de su escuela; null si no lo compartió */
export async function getCaminoDe(docenteId: string): Promise<(NumerosCamino & { nivel: number }) | null> {
  const { data, error } = await supabase.rpc('camino_de_docente' as never, { p_docente: docenteId } as never);
  if (error) throw falla(error, 'No se pudo cargar.');
  return (data as unknown as (NumerosCamino & { nivel: number }) | null) ?? null;
}

export async function getMetaEscuela(): Promise<MetaEscuela | null> {
  const { data, error } = await supabase.rpc('meta_de_mi_escuela' as never);
  if (error) throw falla(error, 'No se pudo cargar.');
  return (data as unknown as MetaEscuela | null) ?? null;
}
