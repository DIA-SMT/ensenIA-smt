/**
 * SMT EstudIA — Biblioteca de referencia: carga y edición (047)
 *
 * Leyes, resoluciones, NAP, ESI, diseño curricular y técnicas que la IA
 * del Laboratorio, Crear y Migue consulta y cita. Es común a todas las
 * escuelas municipales y la carga la Dirección de Innovación: escribir
 * es solo de superadmin (lo decide la RLS, no esta capa).
 *
 * Cada documento se guarda partido en fragmentos (un artículo, un NAP,
 * una sección). La IA busca fragmentos con buscar_referencias, que solo
 * devuelve lo publicado y vigente que quien pregunta puede ver.
 *
 * Los fragmentos se guardan conservando su id cuando ya existían: un
 * docente puede haber vinculado un NAP a un tema de su planificación
 * (planificacion_nap) y borrar el fragmento borra ese vínculo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './_helpers';

// Las tablas de la 047 todavía no están en los tipos generados: este
// cliente sin esquema evita pelear con ellos (y sigue andando cuando se
// regeneren).
const db = supabase as unknown as SupabaseClient;

// ── Tipos ──

export type CapaReferencia = 'nacional' | 'provincial' | 'municipal' | 'tecnica';
export type TipoReferencia = 'ley' | 'resolucion' | 'nap' | 'esi' | 'diseno_curricular' | 'tecnica' | 'otro';
export type AudienciaReferencia = 'equipo' | 'comunidad';
/** Cómo se ve en la lista: no vigente pesa más que publicada. */
export type EstadoReferencia = 'publicada' | 'borrador' | 'no_vigente';

export interface Referencia {
  id: string;
  capa: CapaReferencia;
  tipo: TipoReferencia;
  titulo: string;
  numero: string | null;
  organismo: string | null;
  /** AAAA-MM-DD */
  fecha: string | null;
  vigente: boolean;
  fuenteUrl: string | null;
  /** Vacío = todas las áreas */
  areas: string[];
  /** 1 a 7; vacío = todos los años */
  anios: number[];
  audiencia: AudienciaReferencia;
  publicada: boolean;
  resumen: string | null;
  creadoPor: string | null;
  actualizadoPor: string | null;
  createdAt: string;
  updatedAt: string;
  /** Solo en listarReferencias */
  cantidadFragmentos?: number;
}

export interface ReferenciaFragmento {
  id: string;
  referenciaId: string;
  orden: number;
  seccion: string | null;
  texto: string;
}

/** Lo que se carga en el formulario. */
export interface ReferenciaDatos {
  capa: CapaReferencia;
  tipo: TipoReferencia;
  titulo: string;
  numero?: string | null;
  organismo?: string | null;
  fecha?: string | null;
  vigente?: boolean;
  fuenteUrl?: string | null;
  areas?: string[];
  anios?: number[];
  audiencia?: AudienciaReferencia;
  resumen?: string | null;
}

/** Un fragmento para guardar: con id si ya existía (se actualiza), sin id si es nuevo. */
export interface FragmentoParaGuardar {
  id?: string | null;
  seccion: string | null;
  texto: string;
}

export interface FiltrosReferencias {
  capa?: CapaReferencia | null;
  tipo?: TipoReferencia | null;
  estado?: EstadoReferencia | null;
  /** Busca en título, número, organismo y resumen. */
  texto?: string | null;
}

/** Un fragmento que devolvió la búsqueda (lo que la IA cita). */
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
  rank: number;
}

// ── Etiquetas ──

export const CAPAS: CapaReferencia[] = ['nacional', 'provincial', 'municipal', 'tecnica'];
export const TIPOS: TipoReferencia[] = ['ley', 'resolucion', 'nap', 'esi', 'diseno_curricular', 'tecnica', 'otro'];

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

export const AUDIENCIA_LABELS: Record<AudienciaReferencia, string> = {
  equipo: 'Equipo: docentes y dirección',
  comunidad: 'Comunidad: también estudiantes y familias',
};

export const ESTADO_LABELS: Record<EstadoReferencia, string> = {
  publicada: 'Publicada',
  borrador: 'Borrador',
  no_vigente: 'No vigente',
};

export function estadoDe(r: Pick<Referencia, 'publicada' | 'vigente'>): EstadoReferencia {
  if (!r.vigente) return 'no_vigente';
  return r.publicada ? 'publicada' : 'borrador';
}

/** Lo que acepta la base por fragmento. */
export const MAX_TEXTO_FRAGMENTO = 6000;
const TANDA = 100;

// ── Filas como llegan de la base ──

interface FilaReferencia {
  id: string;
  capa: CapaReferencia;
  tipo: TipoReferencia;
  titulo: string;
  numero: string | null;
  organismo: string | null;
  fecha: string | null;
  vigente: boolean;
  fuente_url: string | null;
  areas: string[] | null;
  anios: number[] | null;
  audiencia: AudienciaReferencia;
  publicada: boolean;
  resumen: string | null;
  creado_por: string | null;
  actualizado_por: string | null;
  created_at: string;
  updated_at: string;
  referencia_fragmentos?: { count: number }[] | null;
}

interface FilaFragmento {
  id: string;
  referencia_id: string;
  orden: number;
  seccion: string | null;
  texto: string;
}

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
  rank: number | null;
}

const COLUMNAS_FRAGMENTO = 'id, referencia_id, orden, seccion, texto';

function mapReferencia(r: FilaReferencia): Referencia {
  return {
    id: r.id,
    capa: r.capa,
    tipo: r.tipo,
    titulo: r.titulo,
    numero: r.numero ?? null,
    organismo: r.organismo ?? null,
    fecha: r.fecha ?? null,
    vigente: r.vigente,
    fuenteUrl: r.fuente_url ?? null,
    areas: r.areas ?? [],
    anios: r.anios ?? [],
    audiencia: r.audiencia,
    publicada: r.publicada,
    resumen: r.resumen ?? null,
    creadoPor: r.creado_por ?? null,
    actualizadoPor: r.actualizado_por ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    cantidadFragmentos: r.referencia_fragmentos ? (r.referencia_fragmentos[0]?.count ?? 0) : undefined,
  };
}

function mapFragmento(f: FilaFragmento): ReferenciaFragmento {
  return { id: f.id, referenciaId: f.referencia_id, orden: f.orden, seccion: f.seccion ?? null, texto: f.texto };
}

const vacioANull = (t: string | null | undefined) => {
  const s = (t ?? '').trim();
  return s ? s : null;
};

/** Datos del formulario → columnas. Solo las que vinieron (para actualizar parcial). */
function aColumnas(d: Partial<ReferenciaDatos>): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (d.capa !== undefined) c.capa = d.capa;
  if (d.tipo !== undefined) c.tipo = d.tipo;
  if (d.titulo !== undefined) c.titulo = d.titulo.trim();
  if (d.numero !== undefined) c.numero = vacioANull(d.numero);
  if (d.organismo !== undefined) c.organismo = vacioANull(d.organismo);
  if (d.fecha !== undefined) c.fecha = vacioANull(d.fecha);
  if (d.vigente !== undefined) c.vigente = d.vigente;
  if (d.fuenteUrl !== undefined) c.fuente_url = vacioANull(d.fuenteUrl);
  if (d.areas !== undefined) {
    const vistas = new Set<string>();
    c.areas = d.areas.map(a => a.trim()).filter(a => {
      const k = a.toLowerCase();
      if (!a || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
  }
  if (d.anios !== undefined) c.anios = [...new Set(d.anios)].filter(a => a >= 1 && a <= 7).sort((a, b) => a - b);
  if (d.audiencia !== undefined) c.audiencia = d.audiencia;
  if (d.resumen !== undefined) c.resumen = vacioANull(d.resumen);
  return c;
}

/** Lo que se escribe en el error que ve el superadmin, en vez del mensaje de Postgres. */
function errorLegible(error: { message: string; code?: string }, accion: string): Error {
  const m = error.message ?? '';
  if (error.code === '42P01' || /relation .*referencia/i.test(m)) {
    return new Error('Falta correr la migración 047_biblioteca_referencia.sql en Supabase.');
  }
  if (/fuente_url/.test(m)) return new Error('El enlace oficial tiene que empezar con http:// o https://.');
  if (/titulo/.test(m) && /check/i.test(m)) return new Error('El título tiene que tener entre 3 y 300 caracteres.');
  if (/anios/.test(m) && /check/i.test(m)) return new Error('Los años van del 1° al 7°.');
  if (/texto/.test(m) && /check/i.test(m)) return new Error(`Hay un fragmento vacío o de más de ${MAX_TEXTO_FRAGMENTO.toLocaleString('es-AR')} caracteres.`);
  if (error.code === '42501' || /row-level security/i.test(m)) {
    return new Error('No tenés permiso para cambiar la biblioteca de referencia (es solo de la Dirección de Innovación).');
  }
  return new Error(`No se pudo ${accion}: ${m}`);
}

// ── Documentos ──

/** Todos los documentos que puede ver quien pregunta (el superadmin, también borradores y derogados). */
export async function listarReferencias(filtros: FiltrosReferencias = {}): Promise<Referencia[]> {
  let q = db.from('referencias').select('*, referencia_fragmentos(count)');
  if (filtros.capa) q = q.eq('capa', filtros.capa);
  if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
  if (filtros.estado === 'publicada') q = q.eq('publicada', true).eq('vigente', true);
  if (filtros.estado === 'borrador') q = q.eq('publicada', false).eq('vigente', true);
  if (filtros.estado === 'no_vigente') q = q.eq('vigente', false);
  // Sin los caracteres que arman filtros en PostgREST
  const texto = (filtros.texto ?? '').replace(/[%_\\(),.*"]/g, ' ').trim();
  if (texto) {
    q = q.or(['titulo', 'numero', 'organismo', 'resumen'].map(c => `${c}.ilike.%${texto}%`).join(','));
  }
  const { data, error } = await q.order('capa').order('titulo');
  if (error) throw errorLegible(error, 'cargar la biblioteca');
  return ((data ?? []) as FilaReferencia[]).map(mapReferencia);
}

/** Un documento con sus fragmentos en orden. null si no existe o no se puede ver. */
export async function obtenerReferencia(id: string): Promise<{ referencia: Referencia; fragmentos: ReferenciaFragmento[] } | null> {
  const [doc, frags] = await Promise.all([
    db.from('referencias').select('*').eq('id', id).maybeSingle(),
    db.from('referencia_fragmentos').select(COLUMNAS_FRAGMENTO).eq('referencia_id', id).order('orden'),
  ]);
  if (doc.error) throw errorLegible(doc.error, 'abrir el documento');
  if (frags.error) throw errorLegible(frags.error, 'abrir los fragmentos');
  if (!doc.data) return null;
  const fragmentos = ((frags.data ?? []) as FilaFragmento[]).map(mapFragmento);
  return { referencia: { ...mapReferencia(doc.data as FilaReferencia), cantidadFragmentos: fragmentos.length }, fragmentos };
}

/** Crea el documento como borrador (publicar es aparte). */
export async function crearReferencia(datos: ReferenciaDatos): Promise<Referencia> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await db
    .from('referencias')
    .insert({ ...aColumnas(datos), publicada: false, creado_por: session?.user.id ?? null })
    .select('*')
    .single();
  if (error) throw errorLegible(error, 'crear el documento');
  return mapReferencia(data as FilaReferencia);
}

/**
 * Cambia datos del documento. Si la RLS no deja, el update no falla:
 * no toca ninguna fila. Por eso se pide la fila de vuelta y se avisa.
 */
async function cambiar(id: string, columnas: Record<string, unknown>, accion: string): Promise<Referencia> {
  const { data, error } = await db.from('referencias').update(columnas).eq('id', id).select('*');
  if (error) throw errorLegible(error, accion);
  const filas = (data ?? []) as FilaReferencia[];
  if (filas.length === 0) {
    throw new Error(`No se pudo ${accion}: el documento ya no existe o no tenés permiso para cambiarlo.`);
  }
  return mapReferencia(filas[0]);
}

export async function actualizarReferencia(id: string, cambios: Partial<ReferenciaDatos>): Promise<Referencia> {
  return cambiar(id, aColumnas(cambios), 'guardar el documento');
}

/** Publicar: desde ahora la IA lo consulta y cita. Despublicar: vuelve a borrador. */
export async function publicarReferencia(id: string, publicada: boolean): Promise<Referencia> {
  if (publicada) {
    const { count, error } = await db.from('referencia_fragmentos')
      .select('id', { count: 'exact', head: true }).eq('referencia_id', id);
    if (error) throw errorLegible(error, 'publicar');
    if (!count) throw new Error('El documento no tiene fragmentos: la IA no tendría nada para citar.');
  }
  return cambiar(id, { publicada }, publicada ? 'publicar' : 'despublicar');
}

/** Derogada o reemplazada: la IA deja de citarla, pero queda en la biblioteca. */
export async function marcarVigencia(id: string, vigente: boolean): Promise<Referencia> {
  return cambiar(id, { vigente }, vigente ? 'marcarla vigente' : 'marcarla no vigente');
}

/** Borra el documento y sus fragmentos (y los vínculos de NAP de las planificaciones). */
export async function borrarReferencia(id: string): Promise<void> {
  const { data, error } = await db.from('referencias').delete().eq('id', id).select('id');
  if (error) throw errorLegible(error, 'borrar el documento');
  if (!data || data.length === 0) {
    throw new Error('No se pudo borrar: el documento ya no existe o no tenés permiso.');
  }
}

// ── Fragmentos ──

export async function listarFragmentos(referenciaId: string): Promise<ReferenciaFragmento[]> {
  const { data, error } = await db.from('referencia_fragmentos')
    .select(COLUMNAS_FRAGMENTO).eq('referencia_id', referenciaId).order('orden');
  if (error) throw errorLegible(error, 'cargar los fragmentos');
  return ((data ?? []) as FilaFragmento[]).map(mapFragmento);
}

function validarFragmentos(fragmentos: FragmentoParaGuardar[]) {
  fragmentos.forEach((f, i) => {
    const largo = f.texto.trim().length;
    if (largo === 0) throw new Error(`El fragmento ${i + 1} está vacío: escribile texto o borralo.`);
    if (f.texto.length > MAX_TEXTO_FRAGMENTO) {
      throw new Error(`El fragmento ${i + 1} tiene ${f.texto.length.toLocaleString('es-AR')} caracteres; el máximo es ${MAX_TEXTO_FRAGMENTO.toLocaleString('es-AR')}. Partilo en dos.`);
    }
  });
}

/**
 * Deja los fragmentos del documento exactamente como `fragmentos`, en ese
 * orden: actualiza los que traen id (conservan sus vínculos), inserta los
 * nuevos y borra los que ya no están. Primero escribe y al final borra:
 * si algo falla a mitad de camino, no queda el documento vacío.
 * Devuelve los fragmentos como quedaron.
 */
export async function guardarFragmentos(referenciaId: string, fragmentos: FragmentoParaGuardar[]): Promise<ReferenciaFragmento[]> {
  validarFragmentos(fragmentos);

  const { data: actuales, error: errActuales } = await db.from('referencia_fragmentos')
    .select('id').eq('referencia_id', referenciaId);
  if (errActuales) throw errorLegible(errActuales, 'guardar los fragmentos');
  const idsActuales = new Set(((actuales ?? []) as { id: string }[]).map(f => f.id));

  const filas = fragmentos.map((f, orden) => ({
    // Un id que no es de este documento se trata como fragmento nuevo
    id: f.id && idsActuales.has(f.id) ? f.id : null,
    referencia_id: referenciaId,
    orden,
    seccion: vacioANull(f.seccion),
    texto: f.texto.trim(),
  }));
  const existentes = filas.filter(f => f.id);
  const nuevas = filas.filter(f => !f.id)
    .map(f => ({ referencia_id: f.referencia_id, orden: f.orden, seccion: f.seccion, texto: f.texto }));
  const quedan = new Set(existentes.map(f => f.id as string));
  const sobran = [...idsActuales].filter(id => !quedan.has(id));

  for (let i = 0; i < existentes.length; i += TANDA) {
    const { error } = await db.from('referencia_fragmentos')
      .upsert(existentes.slice(i, i + TANDA), { onConflict: 'id' });
    if (error) throw errorLegible(error, 'guardar los fragmentos');
  }

  const insertados: string[] = [];
  for (let i = 0; i < nuevas.length; i += TANDA) {
    const { data, error } = await db.from('referencia_fragmentos').insert(nuevas.slice(i, i + TANDA)).select('id');
    if (error) {
      // Que no queden fragmentos repetidos a medio guardar
      if (insertados.length > 0) await db.from('referencia_fragmentos').delete().in('id', insertados);
      throw errorLegible(error, 'guardar los fragmentos');
    }
    insertados.push(...((data ?? []) as { id: string }[]).map(f => f.id));
  }

  for (let i = 0; i < sobran.length; i += TANDA) {
    const { error } = await db.from('referencia_fragmentos').delete().in('id', sobran.slice(i, i + TANDA));
    if (error) throw errorLegible(error, 'quitar los fragmentos que borraste');
  }

  return listarFragmentos(referenciaId);
}

/**
 * Reemplaza todos los fragmentos por otros nuevos (por ejemplo, al volver
 * a partir el documento). Los vínculos de NAP a fragmentos viejos se pierden.
 */
export async function reemplazarFragmentos(referenciaId: string, fragmentos: { seccion: string | null; texto: string }[]): Promise<ReferenciaFragmento[]> {
  return guardarFragmentos(referenciaId, fragmentos.map(f => ({ seccion: f.seccion, texto: f.texto })));
}

// ── Búsqueda (la usan la IA y las pantallas de consulta) ──

/**
 * Busca fragmentos publicados y vigentes, en español. Como la función es
 * SECURITY INVOKER, devuelve solo lo que quien pregunta puede ver: un
 * estudiante nunca recibe lo de audiencia 'equipo'.
 */
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
    max_results: params.max ?? 6,
  });
  if (error) throw errorLegible(error, 'buscar en la biblioteca');
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
    rank: r.rank ?? 0,
  }));
}
