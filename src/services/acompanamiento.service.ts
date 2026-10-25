/**
 * Acompañamiento de dirección a sus docentes (081): la observación de una
 * clase, formativa. La dirección la escribe con una pauta, fortalezas,
 * sugerencias y acuerdos; mientras es borrador el docente no la ve. Cerrada,
 * la ve completa, puede marcar "Me notifiqué" y responder. Ningún número sale
 * del uso de la app: la pauta la completa quien observó.
 *
 * Quién ve y quién escribe lo hace cumplir la base (RLS + el trigger que deja
 * solo tildar acuerdos en una cerrada), no esta pantalla.
 */

import { supabase, unwrap } from './_helpers';
import { esErrorDeRed } from '../lib/conexion';

export type ValorPauta = 'logrado' | 'en_proceso' | 'a_fortalecer' | 'no_observado';

export const VALORES_PAUTA: { valor: ValorPauta; etiqueta: string }[] = [
  { valor: 'logrado', etiqueta: 'Logrado' },
  { valor: 'en_proceso', etiqueta: 'En proceso' },
  { valor: 'a_fortalecer', etiqueta: 'A fortalecer' },
  { valor: 'no_observado', etiqueta: 'No observado' },
];

export const ETIQUETA_VALOR: Record<ValorPauta, string> = Object.fromEntries(
  VALORES_PAUTA.map(v => [v.valor, v.etiqueta]),
) as Record<ValorPauta, string>;

/** Qué se mira en la clase. "Qué mirar" son ejemplos para quien observa, no una lista a cumplir. */
export const DIMENSIONES: { clave: string; titulo: string; mirar: string }[] = [
  { clave: 'planificacion', titulo: 'Propósito y planificación', mirar: 'Se entiende para qué es la clase; lo que se hace va con lo planificado y con el programa.' },
  { clave: 'clima', titulo: 'Clima y vínculo', mirar: 'Trato respetuoso, se puede preguntar y equivocarse, la clase tiene un orden que ayuda a trabajar.' },
  { clave: 'estrategias', titulo: 'Estrategias y recursos', mirar: 'Explicaciones claras, ejemplos, materiales y momentos variados según lo que se enseña.' },
  { clave: 'participacion', titulo: 'Participación de los estudiantes', mirar: 'Hablan, resuelven, preguntan; no solo escuchan o copian. Participan también los que suelen quedar callados.' },
  { clave: 'evaluacion', titulo: 'Seguimiento y evaluación', mirar: 'Se revisa si se entendió, hay devoluciones, se retoman los errores.' },
  { clave: 'inclusion', titulo: 'Inclusión y atención a la diversidad', mirar: 'Hay lugar para distintos ritmos y formas de aprender; se acompaña a quien lo necesita.' },
];

/** "25 de octubre de 2026" (de una fecha o de un timestamp) */
export const fechaLarga = (iso: string) =>
  // Una fecha sola, al mediodía (que no se corra un día); un timestamp, en la hora de acá
  (iso.length > 10 ? new Date(iso) : new Date(`${iso}T12:00:00`))
    .toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export interface ItemPauta { valor: ValorPauta | null; nota: string }
export type Pauta = Record<string, ItemPauta>;
export interface Acuerdo { texto: string; cumplido: boolean }

export interface Observacion {
  id: string;
  schoolId: string;
  docenteId: string;
  observadorId: string | null;
  observadorNombre: string | null;
  fecha: string;
  subjectId: string | null;
  courseId: string | null;
  materia: string | null;
  curso: string | null;
  pauta: Pauta;
  fortalezas: string;
  sugerencias: string;
  acuerdos: Acuerdo[];
  estado: 'borrador' | 'cerrada';
  cerradaAt: string | null;
  notificadoAt: string | null;
  respuestaDocente: string | null;
  respondidaAt: string | null;
}

/** Lo que escribe la dirección (crear, guardar, cerrar) */
export interface DatosObservacion {
  fecha: string;
  subjectId: string | null;
  courseId: string | null;
  pauta: Pauta;
  fortalezas: string;
  sugerencias: string;
  acuerdos: Acuerdo[];
}

const SELECT = `id, school_id, docente_id, observador_id, fecha, subject_id, course_id, pauta, fortalezas, sugerencias,
  acuerdos, estado, cerrada_at, notificado_at, respuesta_docente, respondida_at,
  subjects(name), courses(name), observador:profiles!observaciones_docentes_observador_id_fkey(first_name, last_name)`;

type Fila = {
  id: string; school_id: string; docente_id: string; observador_id: string | null; fecha: string;
  subject_id: string | null; course_id: string | null; pauta: unknown; fortalezas: string | null; sugerencias: string | null;
  acuerdos: unknown; estado: 'borrador' | 'cerrada'; cerrada_at: string | null; notificado_at: string | null;
  respuesta_docente: string | null; respondida_at: string | null;
  subjects?: { name?: string } | null; courses?: { name?: string } | null;
  observador?: { first_name?: string; last_name?: string } | null;
};

function leerPauta(v: unknown): Pauta {
  const p: Pauta = {};
  if (!v || typeof v !== 'object') return p;
  for (const d of DIMENSIONES) {
    const it = (v as Record<string, { valor?: unknown; nota?: unknown }>)[d.clave];
    if (!it) continue;
    const valor = VALORES_PAUTA.some(x => x.valor === it.valor) ? it.valor as ValorPauta : null;
    p[d.clave] = { valor, nota: typeof it.nota === 'string' ? it.nota : '' };
  }
  return p;
}

function leerAcuerdos(v: unknown): Acuerdo[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is { texto: string; cumplido?: unknown } => Boolean(a) && typeof (a as { texto?: unknown }).texto === 'string')
    .map(a => ({ texto: a.texto, cumplido: a.cumplido === true }));
}

const aObservacion = (f: Fila): Observacion => ({
  id: f.id,
  schoolId: f.school_id,
  docenteId: f.docente_id,
  observadorId: f.observador_id,
  observadorNombre: f.observador ? `${f.observador.first_name ?? ''} ${f.observador.last_name ?? ''}`.trim() || null : null,
  fecha: f.fecha,
  subjectId: f.subject_id,
  courseId: f.course_id,
  materia: f.subjects?.name ?? null,
  curso: f.courses?.name ?? null,
  pauta: leerPauta(f.pauta),
  fortalezas: f.fortalezas ?? '',
  sugerencias: f.sugerencias ?? '',
  acuerdos: leerAcuerdos(f.acuerdos),
  estado: f.estado,
  cerradaAt: f.cerrada_at,
  notificadoAt: f.notificado_at,
  respuestaDocente: f.respuesta_docente,
  respondidaAt: f.respondida_at,
});

/** Sin lo vacío: una dimensión sin valor ni nota no se guarda; acuerdos sin texto, tampoco */
function aFila(d: DatosObservacion) {
  const pauta: Record<string, { valor: ValorPauta | null; nota: string }> = {};
  for (const [clave, it] of Object.entries(d.pauta)) {
    const nota = it.nota.trim().slice(0, 1000);
    if (it.valor || nota) pauta[clave] = { valor: it.valor, nota };
  }
  return {
    fecha: d.fecha,
    subject_id: d.subjectId,
    course_id: d.courseId,
    pauta,
    fortalezas: d.fortalezas.trim().slice(0, 4000) || null,
    sugerencias: d.sugerencias.trim().slice(0, 4000) || null,
    acuerdos: d.acuerdos.map(a => ({ texto: a.texto.trim().slice(0, 500), cumplido: a.cumplido })).filter(a => a.texto),
  };
}

/** Los mensajes de la base (el trigger) ya vienen redactados; los técnicos, no se muestran */
function mensajeDe(err: unknown, porDefecto: string): string {
  if (esErrorDeRed(err)) return 'Se cortó la señal. Probá de nuevo cuando vuelva.';
  const m = (err as { message?: string } | null)?.message ?? '';
  if (/observaciones_docentes|relation|does not exist|PGRST20/i.test(m)) return 'Falta correr la migración 081_acompanamiento_docente.sql.';
  return m && !/permission|violates|function|syntax|jwt|column|constraint|null value/i.test(m) ? m : porDefecto;
}

// ── Dirección ──

/** Las observaciones de un docente, de la más nueva a la más vieja */
export async function getObservacionesDe(docenteId: string): Promise<Observacion[]> {
  const { data, error } = await supabase.from('observaciones_docentes' as never)
    .select(SELECT).eq('docente_id', docenteId).order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new Error(mensajeDe(error, 'No se pudieron cargar las observaciones.'));
  return ((data ?? []) as unknown as Fila[]).map(aObservacion);
}

export async function getObservacion(id: string): Promise<Observacion | null> {
  const { data, error } = await supabase.from('observaciones_docentes' as never).select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(mensajeDe(error, 'No se pudo cargar la observación.'));
  return data ? aObservacion(data as unknown as Fila) : null;
}

export async function crearObservacion(schoolId: string, docenteId: string, observadorId: string, d: DatosObservacion, cerrar = false): Promise<Observacion> {
  const { data, error } = await supabase.from('observaciones_docentes' as never)
    .insert({ school_id: schoolId, docente_id: docenteId, observador_id: observadorId, ...aFila(d), estado: cerrar ? 'cerrada' : 'borrador' } as never)
    .select(SELECT).single();
  if (error) throw new Error(mensajeDe(error, 'No se pudo guardar la observación.'));
  return aObservacion(data as unknown as Fila);
}

export async function guardarObservacion(id: string, d: DatosObservacion, cerrar = false): Promise<Observacion> {
  const { data, error } = await supabase.from('observaciones_docentes' as never)
    .update({ ...aFila(d), ...(cerrar ? { estado: 'cerrada' } : {}) } as never)
    .eq('id', id).select(SELECT).single();
  if (error) throw new Error(mensajeDe(error, 'No se pudo guardar la observación.'));
  return aObservacion(data as unknown as Fila);
}

/** Cerrada: solo se tildan los acuerdos (los textos quedan como se compartieron) */
export async function tildarAcuerdos(id: string, acuerdos: Acuerdo[]): Promise<void> {
  const { error } = await supabase.from('observaciones_docentes' as never)
    .update({ acuerdos: acuerdos.map(a => ({ texto: a.texto, cumplido: a.cumplido })) } as never).eq('id', id);
  if (error) throw new Error(mensajeDe(error, 'No se pudo guardar el acuerdo.'));
}

export async function borrarBorrador(id: string): Promise<void> {
  unwrap(await supabase.from('observaciones_docentes' as never).delete().eq('id', id).eq('estado', 'borrador'));
}

/**
 * Migue arma un borrador de fortalezas, sugerencias y acuerdos con lo que
 * marcó quien observó. No evalúa ni pone niveles: redacta lo que le dan.
 * Sin el nombre del docente; los nombres que aparezcan en las notas se tapan
 * en el servidor antes de mandarlos.
 */
export async function redactarConMigue(escuela: string, pauta: Pauta, notas: string): Promise<{ fortalezas: string; sugerencias: string; acuerdos: string[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa.');
  const items = DIMENSIONES
    .map(d => ({ dimension: d.titulo, valor: pauta[d.clave]?.valor ? ETIQUETA_VALOR[pauta[d.clave].valor as ValorPauta] : null, nota: pauta[d.clave]?.nota.trim() ?? '' }))
    .filter(i => i.valor || i.nota);
  let resp: Response;
  try {
    resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ accion: 'redactar_observacion', escuela, pauta: items, notas: notas.trim().slice(0, 3000) }),
    });
  } catch (err) {
    throw new Error(mensajeDe(err, 'No se pudo hablar con Migue.'));
  }
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || 'Migue no pudo armar el borrador. Probá de nuevo.');
  return {
    fortalezas: typeof json.fortalezas === 'string' ? json.fortalezas : '',
    sugerencias: typeof json.sugerencias === 'string' ? json.sugerencias : '',
    acuerdos: Array.isArray(json.acuerdos) ? json.acuerdos.filter((a: unknown): a is string => typeof a === 'string') : [],
  };
}

// ── Docente ──

/** Las suyas: la base solo le devuelve las cerradas */
export async function getMisObservaciones(docenteId: string): Promise<Observacion[]> {
  const { data, error } = await supabase.from('observaciones_docentes' as never)
    .select(SELECT).eq('docente_id', docenteId).eq('estado', 'cerrada').order('fecha', { ascending: false });
  if (error) throw new Error(mensajeDe(error, 'No se pudieron cargar tus devoluciones.'));
  return ((data ?? []) as unknown as Fila[]).map(aObservacion);
}

export async function notificarme(id: string): Promise<void> {
  const { error } = await supabase.rpc('notificarme_observacion' as never, { p_id: id } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo marcar. Probá de nuevo.'));
}

export async function responderObservacion(id: string, respuesta: string): Promise<void> {
  const { error } = await supabase.rpc('responder_observacion' as never, { p_id: id, p_respuesta: respuesta } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo enviar tu respuesta. Probá de nuevo.'));
}
