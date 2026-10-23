/**
 * Seguimiento del docente (fase 4, migración 066): el panel de un curso,
 * las consultas que hacen los estudiantes desde cada actividad y las
 * aclaraciones que el docente publica para todo el curso.
 *
 * Las consultas son conversaciones de la mensajería (060) con la actividad
 * anotada: siguen sus reglas (nunca privadas, la dirección las puede leer,
 * no se editan ni se borran) y aparecen en la misma bandeja.
 */

import { supabase, ServiceError } from './_helpers';
import type { TipoActividad } from '../types';

/**
 * Solo se muestra lo que escribimos nosotros en la 066 (RAISE con código
 * P0001 o 22023, o los 42501 propios). Lo demás (red, proxy, la RLS, en
 * inglés) se cambia por un texto de la escuela.
 */
function mensajeDe(error: { message?: string; code?: string } | null, porDefecto: string): string {
  const m = error?.message ?? '';
  const nuestro = error?.code === 'P0001' || error?.code === '22023'
    || (error?.code === '42501' && !/permission|row-level|violates/i.test(m));
  return nuestro && m ? m : porDefecto;
}

/** Con pgError (la cola decide por el código) y reintentable si fue la red o el servidor. */
function fallo(error: { message?: string; code?: string }, status: number, porDefecto: string): ServiceError {
  const e = new ServiceError(mensajeDe(error, porDefecto), error as never);
  if (status === 0 || status === 401 || status === 429 || status >= 500) Object.assign(e, { reintentable: true });
  return e;
}

export interface ActividadSeguimiento {
  id: string;
  titulo: string;
  tipo: TipoActividad;
  estado: 'published' | 'closed';
  vence: string | null;
  puntos: number | null;
  publicada: string;
  entregaron: number;
  sinCorregir: number;
  enCurso: number;
  noEntrego: number;
  consultasSinResponder: number;
}

export interface EstudianteSeguimiento {
  id: string;
  nombre: string;
  apellido: string;
  entregadas: number;
  enCurso: number;
  /** Vencidas sin entregar */
  atrasadas: number;
  /** ISO: lo último que hizo en estas actividades (entregas, huella o consultas) */
  ultimaActividad: string | null;
  consultasSinResponder: number;
}

export interface ConsultaSeguimiento {
  conversacionId: string;
  activityId: string;
  actividad: string;
  studentId: string | null;
  estudiante: string | null;
  ultimo: string;
  ultimoAt: string;
  sinResponder: boolean;
  /** La archivó en Mensajes sin responder: no cuenta como pendiente. */
  archivada?: boolean;
}

export interface Seguimiento {
  actividades: ActividadSeguimiento[];
  estudiantes: EstudianteSeguimiento[];
  consultas: ConsultaSeguimiento[];
}

/**
 * Todo el panel de un curso en un solo pedido. Por GET: el service worker
 * lo guarda y el panel se ve también sin señal (con lo último que bajó).
 */
export async function getSeguimiento(subjectId: string, courseId: string): Promise<Seguimiento> {
  const { data, error } = await supabase.rpc('seguimiento_curso' as never, { p_subject: subjectId, p_course: courseId } as never, { get: true });
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Falta correr la migración 066_seguimiento_y_consultas.sql.');
    console.error('seguimiento_curso:', error);
    throw new ServiceError('No se pudo traer el seguimiento. Revisá la conexión y probá de nuevo.', error);
  }
  const d = (data ?? {}) as Partial<Seguimiento>;
  return { actividades: d.actividades ?? [], estudiantes: d.estudiantes ?? [], consultas: d.consultas ?? [] };
}

export interface ConsultasPorCurso {
  subjectId: string;
  courseId: string;
  cantidad: number;
}

/**
 * Consultas de estudiantes esperando respuesta, por materia y curso (para
 * Hoy y para que el panel abra donde hay). Sin la 066, ninguna.
 */
export async function consultasSinResponder(): Promise<ConsultasPorCurso[]> {
  const { data, error } = await supabase.rpc('consultas_sin_responder' as never, {} as never, { get: true });
  if (error || !Array.isArray(data)) return [];
  return data as ConsultasPorCurso[];
}

// ── Consultas del estudiante ──

/**
 * Manda la consulta: la primera abre la charla con el docente, las
 * siguientes se suman. Con el id que eligió el celular, mandarla de nuevo
 * (la respuesta se perdió) no la duplica.
 */
export async function consultarActividad(activityId: string, texto: string, id?: string): Promise<string> {
  const { data, error, status } = await supabase.rpc('consultar_actividad' as never,
    { p_activity: activityId, p_texto: texto.trim(), p_id: id ?? null } as never);
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Las consultas todavía no están habilitadas. Probá más tarde.');
    throw fallo(error, status, 'No se pudo mandar la consulta.');
  }
  return data as unknown as string;
}

/**
 * La charla de consulta de esta actividad, si ya hay una. Solo el id: la
 * RLS deja ver las conversaciones donde uno participa (060). Es un GET
 * chico; la charla en sí se pide aparte y no se guarda en el celular.
 */
export async function consultaDeActividad(activityId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversaciones' as never)
    .select('id')
    .eq('activity_id', activityId)
    .eq('origen', 'consulta')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') return null; // sin la 066
    throw new ServiceError(mensajeDe(error, 'No se pudo traer tu consulta.'), error);
  }
  return ((data ?? []) as unknown as { id: string }[])[0]?.id ?? null;
}

// ── Aclaraciones para todo el curso ──
// Como los mensajes, no se editan ni se borran: se retiran (066).

export interface Aclaracion {
  id: string;
  activityId: string;
  texto: string;
  createdAt: string;
}

const mapAclaracion = (r: { id: string; activity_id: string; texto: string; created_at: string }): Aclaracion => ({
  id: r.id, activityId: r.activity_id, texto: r.texto, createdAt: r.created_at,
});

/** Las vigentes de una actividad (el estudiante, solo de las publicadas para él). */
export async function getAclaraciones(activityId: string): Promise<Aclaracion[]> {
  const { data, error } = await supabase
    .from('aclaraciones_actividad' as never)
    .select('id, activity_id, texto, created_at')
    .eq('activity_id', activityId)
    .is('retirada_at', null)
    .order('created_at');
  if (error) {
    // Sin la 066 todavía no hay aclaraciones: la actividad se ve igual
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw new ServiceError(mensajeDe(error, 'No se pudieron traer las aclaraciones.'), error);
  }
  return ((data ?? []) as unknown as Parameters<typeof mapAclaracion>[0][]).map(mapAclaracion);
}

/**
 * Publica para todo el curso. Con el id elegido acá: si se publicó pero la
 * respuesta se perdió, publicar otra vez con el mismo id no la duplica.
 */
export async function publicarAclaracion(activityId: string, texto: string, id: string = crypto.randomUUID()): Promise<Aclaracion> {
  const { error } = await supabase
    .from('aclaraciones_actividad' as never)
    .insert({ id, activity_id: activityId, texto: texto.trim() } as never);
  // 23505: ya estaba (era un reintento)
  if (error && error.code !== '23505') throw new ServiceError(mensajeDe(error, 'No se pudo publicar la aclaración.'), error);
  return { id, activityId, texto: texto.trim(), createdAt: new Date().toISOString() };
}

/**
 * Los estudiantes dejan de verla; la dirección la sigue viendo. Con .select:
 * si la RLS no la deja tocar no da error sino cero filas, y no hay que decir
 * "retirada" cuando no pasó.
 */
export async function retirarAclaracion(id: string): Promise<void> {
  const { data, error } = await supabase.from('aclaraciones_actividad' as never)
    .update({ retirada_at: new Date().toISOString() } as never).eq('id', id).select('id');
  if (error) throw new ServiceError(mensajeDe(error, 'No se pudo retirar la aclaración.'), error);
  if (!data?.length) throw new Error('No se pudo retirar: la aclaración ya no está o no es tuya.');
}
