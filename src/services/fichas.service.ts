/**
 * SMT EstudIA — Fichas por materia y año para Migue (077)
 *
 * El currículum oficial (NAP, diseño curricular) de cada materia y año,
 * resumido una vez desde la Biblioteca de referencia. Migue la recibe cuando
 * sabe de qué curso se habla, en un bloque que se cachea y comparten todos
 * los docentes de esa materia y año. Las arma el superadmin.
 */

import { supabase } from '../lib/supabase';

export interface FichaPosible {
  area: string;
  materia: string;
  anio: number;
  /** NAP o diseños curriculares publicados para esa materia y año */
  documentos: number;
  tieneFicha: boolean;
  /** Algún documento cambió después de armarla */
  desactualizada: boolean;
  generadaAt: string | null;
}

/** Las materias y años que se dan en las escuelas, con sus documentos y su ficha. Solo superadmin. */
export async function getFichasPosibles(): Promise<FichaPosible[]> {
  const { data, error } = await supabase.rpc('fichas_posibles' as never);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Falta correr la migración 077_cache_y_fichas.sql.');
    throw error;
  }
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    area: String(r.area),
    materia: String(r.materia),
    anio: Number(r.anio),
    documentos: Number(r.documentos ?? 0),
    tieneFicha: Boolean(r.tiene_ficha),
    desactualizada: Boolean(r.desactualizada),
    generadaAt: (r.generada_at as string | null) ?? null,
  }));
}

export async function getFicha(area: string, anio: number): Promise<{ materia: string; texto: string; generadaAt: string } | null> {
  const { data, error } = await supabase
    .from('fichas_curso' as never)
    .select('materia, texto, generada_at')
    .eq('area', area)
    .eq('anio', anio)
    .maybeSingle();
  if (error) throw error;
  const r = data as { materia: string; texto: string; generada_at: string } | null;
  return r ? { materia: r.materia, texto: r.texto, generadaAt: r.generada_at } : null;
}

/** Arma (o rearma) la ficha con la IA. Tarda unos segundos; devuelve el texto. */
export async function armarFicha(materia: string, anio: number): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa.');
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ accion: 'ficha', materia, anio }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || typeof json.texto !== 'string') throw new Error(json.error || `No se pudo armar la ficha (${resp.status}).`);
  return json.texto;
}
