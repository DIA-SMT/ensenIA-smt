/**
 * SMT EstudIA — Biblioteca de referencia para el equipo y NAP de la
 * planificación (050)
 *
 * La biblioteca (leyes, resoluciones, NAP, ESI, diseño curricular y
 * técnicas) la carga la Dirección de Innovación; acá solo se LEE lo
 * publicado y vigente, y el docente vincula NAP a sus temas.
 *
 * Quién ve qué lo decide la RLS: buscar_referencias es SECURITY INVOKER,
 * así que un docente o un director ven lo de 'equipo' y 'comunidad'; un
 * estudiante, solo lo de 'comunidad'.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './_helpers';

// Las tablas de la 050 todavía no están en los tipos generados: este
// cliente sin esquema evita pelear con ellos (y sigue andando cuando se
// regeneren).
const db = supabase as unknown as SupabaseClient;

export type CapaReferencia = 'nacional' | 'provincial' | 'municipal' | 'tecnica';
export type TipoReferencia = 'ley' | 'resolucion' | 'nap' | 'esi' | 'diseno_curricular' | 'tecnica' | 'otro';

export const CAPAS: CapaReferencia[] = ['nacional', 'provincial', 'municipal', 'tecnica'];

export const CAPA_LABELS: Record<CapaReferencia, string> = {
  nacional: 'Nacional',
  provincial: 'Provincial',
  municipal: 'Municipal',
  tecnica: 'Técnicas pedagógicas',
};

export const TIPO_LABELS: Record<TipoReferencia, string> = {
  ley: 'Ley',
  resolucion: 'Resolución',
  nap: 'NAP',
  esi: 'ESI',
  diseno_curricular: 'Diseño curricular',
  tecnica: 'Técnica pedagógica',
  otro: 'Otro',
};

/** Los filtros por tipo que ve el equipo (leyes y resoluciones van juntas). */
export const FILTROS_TIPO: { id: string; etiqueta: string; tipos: TipoReferencia[] }[] = [
  { id: 'nap', etiqueta: 'NAP', tipos: ['nap'] },
  { id: 'esi', etiqueta: 'ESI', tipos: ['esi'] },
  { id: 'normas', etiqueta: 'Leyes y resoluciones', tipos: ['ley', 'resolucion'] },
  { id: 'diseno', etiqueta: 'Diseño curricular', tipos: ['diseno_curricular'] },
  { id: 'tecnicas', etiqueta: 'Técnicas pedagógicas', tipos: ['tecnica'] },
];

// ── Comparar áreas como normalizar_area() de la 050 ──

const SIN_ACENTO: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
};

/** "Físico-Química" y "fisicoquímica" dan lo mismo: minúsculas, sin acentos ni signos. */
export function normalizarArea(t: string | null | undefined): string {
  return (t ?? '')
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, c => SIN_ACENTO[c] ?? c)
    .replace(/[^a-z0-9]+/g, '');
}

/** El mismo criterio que buscar_referencias: vacío = aplica a todas las áreas / años. */
export function aplicaA(ref: { areas: string[]; anios: number[] }, area: string | null, anio: number | null): boolean {
  if (anio != null && ref.anios.length > 0 && !ref.anios.includes(anio)) return false;
  const areaN = normalizarArea(area);
  if (!areaN || ref.areas.length === 0) return true;
  return ref.areas.some(a => {
    const n = normalizarArea(a);
    return areaN.includes(n) || n.includes(areaN);
  });
}

// ── Filas como llegan de la base ──

interface FilaHallado {
  fragmento_id: string;
  referencia_id: string;
  titulo: string;
  numero: string | null;
  capa: CapaReferencia;
  tipo: TipoReferencia;
  seccion: string | null;
  texto: string;
  fuente_url: string | null;
}

interface FilaReferencia {
  id: string;
  capa: CapaReferencia;
  tipo: TipoReferencia;
  titulo: string;
  numero: string | null;
  organismo: string | null;
  fecha: string | null;
  fuente_url: string | null;
  areas: string[] | null;
  anios: number[] | null;
  resumen: string | null;
}

interface FilaFragmento {
  id: string;
  orden: number;
  seccion: string | null;
  texto: string;
}

interface FilaNap extends Pick<FilaReferencia, 'id' | 'titulo' | 'numero' | 'fuente_url' | 'areas' | 'anios'> {
  referencia_fragmentos: FilaFragmento[] | null;
}

interface FilaVinculo {
  class_id: string;
  fragmento_id: string;
  referencia_fragmentos: (FilaFragmento & {
    referencias: Pick<FilaReferencia, 'id' | 'titulo' | 'numero' | 'fuente_url'> | null;
  }) | null;
}

// ── Búsqueda ──

export interface FragmentoHallado {
  fragmentoId: string;
  referenciaId: string;
  titulo: string;
  numero: string | null;
  capa: CapaReferencia;
  tipo: TipoReferencia;
  seccion: string | null;
  texto: string;
  fuenteUrl: string | null;
}

export async function buscarReferencias(params: {
  q: string;
  area?: string | null;
  anio?: number | null;
  tipos?: TipoReferencia[] | null;
  max?: number;
}): Promise<FragmentoHallado[]> {
  const q = params.q.trim();
  if (!q) return [];
  const { data, error } = await db.rpc('buscar_referencias', {
    q,
    p_area: params.area?.trim() || null,
    p_anio: params.anio ?? null,
    p_tipos: params.tipos && params.tipos.length > 0 ? params.tipos : null,
    max_results: params.max ?? 8,
  });
  if (error) throw error;
  return ((data ?? []) as FilaHallado[]).map(r => ({
    fragmentoId: r.fragmento_id,
    referenciaId: r.referencia_id,
    titulo: r.titulo,
    numero: r.numero ?? null,
    capa: r.capa,
    tipo: r.tipo,
    seccion: r.seccion ?? null,
    texto: r.texto,
    fuenteUrl: r.fuente_url ?? null,
  }));
}

// ── Documentos publicados ──

export interface ReferenciaDoc {
  id: string;
  capa: CapaReferencia;
  tipo: TipoReferencia;
  titulo: string;
  numero: string | null;
  organismo: string | null;
  fecha: string | null;
  fuenteUrl: string | null;
  areas: string[];
  anios: number[];
  resumen: string | null;
}

export interface FragmentoRef {
  id: string;
  orden: number;
  seccion: string | null;
  texto: string;
}

function mapDoc(r: FilaReferencia): ReferenciaDoc {
  return {
    id: r.id,
    capa: r.capa,
    tipo: r.tipo,
    titulo: r.titulo,
    numero: r.numero ?? null,
    organismo: r.organismo ?? null,
    fecha: r.fecha ?? null,
    fuenteUrl: r.fuente_url ?? null,
    areas: r.areas ?? [],
    anios: r.anios ?? [],
    resumen: r.resumen ?? null,
  };
}

/**
 * Lo publicado y vigente. El filtro va explícito además de la RLS: el
 * superadmin ve también borradores y derogadas, y esta lista es la del equipo.
 */
export async function getReferenciasPublicadas(): Promise<ReferenciaDoc[]> {
  const { data, error } = await db
    .from('referencias')
    .select('id, capa, tipo, titulo, numero, organismo, fecha, fuente_url, areas, anios, resumen')
    .eq('publicada', true)
    .eq('vigente', true)
    .order('capa')
    .order('titulo');
  if (error) throw error;
  return ((data ?? []) as FilaReferencia[]).map(mapDoc);
}

export async function getFragmentos(referenciaId: string): Promise<FragmentoRef[]> {
  const { data, error } = await db
    .from('referencia_fragmentos')
    .select('id, orden, seccion, texto')
    .eq('referencia_id', referenciaId)
    .order('orden');
  if (error) throw error;
  return ((data ?? []) as FilaFragmento[]).map(f => ({ id: f.id, orden: f.orden, seccion: f.seccion ?? null, texto: f.texto }));
}

// ── NAP de la planificación ──

export interface NapFragmento {
  fragmentoId: string;
  referenciaId: string;
  titulo: string;
  numero: string | null;
  fuenteUrl: string | null;
  seccion: string | null;
  texto: string;
  orden: number;
}

/** Área (nombre de la materia) y año del curso: lo que filtra los NAP. */
export async function getContextoNap(
  subjectId: string, courseId: string,
): Promise<{ area: string | null; anio: number | null }> {
  const [s, c] = await Promise.all([
    db.from('subjects').select('name').eq('id', subjectId).maybeSingle(),
    db.from('courses').select('year').eq('id', courseId).maybeSingle(),
  ]);
  if (s.error) throw s.error;
  if (c.error) throw c.error;
  const year = (c.data as { year: unknown } | null)?.year;
  return {
    area: (s.data as { name: string | null } | null)?.name ?? null,
    anio: typeof year === 'number' ? year : null,
  };
}

/** Todos los NAP publicados que aplican a esa área y ese año. */
export async function getNapDelArea(area: string | null, anio: number | null): Promise<NapFragmento[]> {
  const { data, error } = await db
    .from('referencias')
    .select('id, titulo, numero, fuente_url, areas, anios, referencia_fragmentos(id, orden, seccion, texto)')
    .eq('tipo', 'nap')
    .eq('publicada', true)
    .eq('vigente', true)
    .order('titulo');
  if (error) throw error;
  const salida: NapFragmento[] = [];
  for (const r of (data ?? []) as FilaNap[]) {
    if (!aplicaA({ areas: r.areas ?? [], anios: r.anios ?? [] }, area, anio)) continue;
    const frags = [...(r.referencia_fragmentos ?? [])].sort((a, b) => a.orden - b.orden);
    for (const f of frags) {
      salida.push({
        fragmentoId: f.id,
        referenciaId: r.id,
        titulo: r.titulo,
        numero: r.numero ?? null,
        fuenteUrl: r.fuente_url ?? null,
        seccion: f.seccion ?? null,
        texto: f.texto,
        orden: f.orden,
      });
    }
  }
  return salida;
}

export interface VinculoNap {
  classId: string;
  fragmentoId: string;
  /** null: el NAP se despublicó o se derogó después de vincularlo. */
  fragmento: NapFragmento | null;
}

/** Qué NAP tiene vinculado cada tema de esas unidades. */
export async function getVinculosNap(unitIds: string[]): Promise<VinculoNap[]> {
  if (unitIds.length === 0) return [];
  const { data, error } = await db
    .from('planificacion_nap')
    .select(`
      class_id, fragmento_id,
      planning_classes!inner(unit_id),
      referencia_fragmentos(id, orden, seccion, texto, referencias(id, titulo, numero, fuente_url))
    `)
    .in('planning_classes.unit_id', unitIds);
  if (error) throw error;
  return ((data ?? []) as unknown as FilaVinculo[]).map(v => {
    const f = v.referencia_fragmentos;
    const r = f?.referencias;
    return {
      classId: v.class_id,
      fragmentoId: v.fragmento_id,
      fragmento: f && r ? {
        fragmentoId: f.id,
        referenciaId: r.id,
        titulo: r.titulo,
        numero: r.numero ?? null,
        fuenteUrl: r.fuente_url ?? null,
        seccion: f.seccion ?? null,
        texto: f.texto,
        orden: f.orden,
      } : null,
    };
  });
}

export async function vincularNap(classId: string, fragmentoId: string): Promise<void> {
  const { error } = await db.from('planificacion_nap').insert({ class_id: classId, fragmento_id: fragmentoId });
  // Ya estaba vinculado (otra pestaña, doble toque): el resultado es el mismo.
  if (error && error.code !== '23505') throw error;
}

export async function desvincularNap(classId: string, fragmentoId: string): Promise<void> {
  const { error } = await db
    .from('planificacion_nap')
    .delete()
    .eq('class_id', classId)
    .eq('fragmento_id', fragmentoId);
  if (error) throw error;
}
