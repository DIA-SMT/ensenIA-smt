/**
 * SMT EstudIA — Qué repasar
 *
 * Qué entendió el curso y qué no, pregunta por pregunta y agrupado por tema.
 * Junta dos fuentes que el docente ya puede leer por RLS:
 *  · entregas de actividades (activity_submissions.answers): el trigger de la
 *    migración 018 marca `correct` en cada pregunta de opción múltiple;
 *  · preguntas rápidas de la clase en vivo (live_activities kind 'quiz' con
 *    correctId) y sus respuestas (live_responses.payload.opcion).
 *
 * Solo números agregados: nunca sale de acá un nombre ni un id de estudiante.
 * No usa students.attendance/average/progress (columnas de demo) ni
 * practice_attempts (el docente no tiene SELECT ahí).
 */

import { useEffect, useState } from 'react';
import { supabase, ServiceError } from './_helpers';
import type { ActivityQuestion } from '../types';

// ── Tipos ──

export type FuenteRepaso = 'actividad' | 'vivo';

export interface PuntoDebil {
  /** Única por pregunta: `${fuente}:${idOrigen}:${idPregunta}`. */
  clave: string;
  fuente: FuenteRepaso;
  /** Texto de la pregunta. */
  pregunta: string;
  respuestas: number;
  aciertos: number;
  /** 0–100, redondeado. */
  porcentaje: number;
  /** Nombre del tema: la clase del programa, o el título de la actividad / clase en vivo. */
  tema: string;
  /** Para agrupar: `clase:<id>`, `unidad:<id>`, `actividad:<id>` o `vivo:<id>`. */
  temaClave: string;
  /** Unidad del programa, si se sabe. */
  unidad: string | null;
  /** Título de la actividad o de la clase en vivo de donde sale la pregunta. */
  origen: string;
  /** Actividad → `/actividades/<id>`; clase en vivo → `/clase-en-vivo`. */
  enlace: string;
  /** Fecha (ISO) de la actividad o de la clase en vivo. */
  fecha: string;
  subjectId: string;
  courseId: string;
  /** La opción incorrecta más elegida (solo opción múltiple / quiz). */
  errorFrecuente: { opcion: string; veces: number } | null;
}

export interface TemaRepaso {
  clave: string;
  tema: string;
  unidad: string | null;
  /** Preguntas flojas del tema, la peor primero. */
  preguntas: PuntoDebil[];
  respuestas: number;
  aciertos: number;
  /** Aciertos sobre respuestas de las preguntas flojas del tema (0–100). */
  porcentaje: number;
  /** Enlace a la actividad con la pregunta más floja, si alguna sale de una actividad. */
  enlaceActividad: string | null;
  hayVivo: boolean;
  fecha: string;
  subjectId: string;
  courseId: string;
}

export interface OpcionesRepaso {
  subjectId?: string;
  courseId?: string;
  /** Ventana hacia atrás, en días. Por defecto 60. */
  dias?: number;
}

export interface Comprension {
  /** Preguntas con al menos MIN_RESPUESTAS respuestas y menos de UMBRAL_ACIERTO % de aciertos. */
  puntos: PuntoDebil[];
  /** Cuántas preguntas tenían respuestas suficientes para mirar (flojas o no). */
  preguntasAnalizadas: number;
  /** Cuántas respuestas corregibles se contaron en total. */
  respuestasContadas: number;
}

export const MIN_RESPUESTAS = 3;
export const UMBRAL_ACIERTO = 60;

const DIAS_POR_DEFECTO = 60;
const MAX_ACTIVIDADES = 80;
const MAX_SESIONES = 40;
/** Ids por consulta `in (...)`: la URL no se va de largo y cada tanda entra en el tope de filas. */
const TANDA = 25;
const MAX_FILAS_TANDA = 1000;

// ── Ayudas ──

function trozos<T>(lista: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

function fallar(error: { message: string } | null, que: string): void {
  if (error) throw new ServiceError(`No se pudo leer ${que}: ${error.message}`);
}

function aIndice(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v);
  return null;
}

interface Contador {
  respuestas: number;
  aciertos: number;
  /** Elecciones incorrectas: etiqueta → veces. */
  errores: Map<string, number>;
}

function nuevoContador(): Contador {
  return { respuestas: 0, aciertos: 0, errores: new Map() };
}

function errorMasElegido(c: Contador): { opcion: string; veces: number } | null {
  let mejor: { opcion: string; veces: number } | null = null;
  for (const [opcion, veces] of c.errores) {
    if (!mejor || veces > mejor.veces) mejor = { opcion, veces };
  }
  // Una sola persona no es "el error del curso"
  return mejor && mejor.veces >= 2 ? mejor : null;
}

const pct = (a: number, n: number) => (n > 0 ? Math.round((a / n) * 100) : 0);

// ── Filas que se leen ──

interface FilaActividad {
  id: string;
  title: string;
  questions: ActivityQuestion[] | null;
  class_id: string | null;
  unit_id: string | null;
  subject_id: string;
  course_id: string;
  created_at: string | null;
}

interface FilaEntrega {
  activity_id: string;
  answers: Record<string, { answer?: unknown; correct?: boolean } | null> | null;
}

interface FilaSesion {
  id: string;
  title: string;
  class_id: string | null;
  subject_id: string;
  course_id: string;
  created_at: string | null;
}

interface FilaQuiz {
  id: string;
  session_id: string;
  config: { question?: string; options?: { id: string; label: string }[]; correctId?: string } | null;
}

interface FilaRespuestaVivo {
  activity_id: string;
  opcion: string | null;
}

interface Tema { tema: string; unidad: string | null }

// ── Lectura ──

async function leerActividades(teacherId: string, o: OpcionesRepaso, desde: string) {
  let q = supabase
    .from('activities')
    .select('id, title, questions, class_id, unit_id, subject_id, course_id, created_at')
    .eq('teacher_id', teacherId)
    .gte('created_at', desde);
  if (o.subjectId) q = q.eq('subject_id', o.subjectId);
  if (o.courseId) q = q.eq('course_id', o.courseId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(MAX_ACTIVIDADES);
  fallar(error, 'las actividades');
  // Solo las que tienen algo que se pueda corregir solo
  return ((data ?? []) as unknown as FilaActividad[])
    .filter(a => (a.questions ?? []).some(p => p.type === 'multiple_choice'));
}

async function leerEntregas(ids: string[]): Promise<FilaEntrega[]> {
  const tandas = await Promise.all(trozos(ids, TANDA).map(async grupo => {
    const { data, error } = await supabase
      .from('activity_submissions')
      .select('activity_id, answers')
      .in('activity_id', grupo)
      .in('status', ['submitted', 'graded'])
      .limit(MAX_FILAS_TANDA);
    fallar(error, 'las entregas');
    return (data ?? []) as unknown as FilaEntrega[];
  }));
  return tandas.flat();
}

async function leerSesiones(teacherId: string, o: OpcionesRepaso, desde: string): Promise<FilaSesion[]> {
  let q = supabase
    .from('live_sessions')
    .select('id, title, class_id, subject_id, course_id, created_at')
    .eq('teacher_id', teacherId)
    .gte('created_at', desde);
  if (o.subjectId) q = q.eq('subject_id', o.subjectId);
  if (o.courseId) q = q.eq('course_id', o.courseId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(MAX_SESIONES);
  fallar(error, 'las clases en vivo');
  return (data ?? []) as unknown as FilaSesion[];
}

async function leerQuizzes(sesiones: string[]): Promise<FilaQuiz[]> {
  const tandas = await Promise.all(trozos(sesiones, TANDA).map(async grupo => {
    const { data, error } = await supabase
      .from('live_activities')
      .select('id, session_id, config')
      .in('session_id', grupo)
      .eq('kind', 'quiz')
      // Las dirigidas a un solo estudiante no dicen nada del curso
      .is('target_student_id', null)
      .limit(MAX_FILAS_TANDA);
    fallar(error, 'las preguntas de la clase en vivo');
    return (data ?? []) as unknown as FilaQuiz[];
  }));
  return tandas.flat().filter(q => !!q.config?.correctId);
}

async function leerRespuestasVivo(quizzes: string[]): Promise<FilaRespuestaVivo[]> {
  const tandas = await Promise.all(trozos(quizzes, TANDA).map(async grupo => {
    const { data, error } = await supabase
      .from('live_responses')
      .select('activity_id, opcion:payload->>opcion')
      .in('activity_id', grupo)
      // Solo estudiantes del curso (no invitados sin cuenta)
      .not('student_id', 'is', null)
      .limit(MAX_FILAS_TANDA);
    fallar(error, 'las respuestas de la clase en vivo');
    return (data ?? []) as unknown as FilaRespuestaVivo[];
  }));
  return tandas.flat();
}

/** Nombres de tema del programa: clases (con su unidad) y unidades sueltas. */
async function leerTemas(claseIds: string[], unidadIds: string[]) {
  const clases = new Map<string, Tema>();
  const unidades = new Map<string, string>();
  const tareas: Promise<void>[] = [];
  for (const grupo of trozos(claseIds, TANDA * 2)) {
    tareas.push((async () => {
      const { data, error } = await supabase
        .from('planning_classes')
        .select('id, title, planning_units(title)')
        .in('id', grupo);
      // Sin nombre de tema seguimos con el título de la actividad: no es para cortar
      if (error) { console.error(error); return; }
      for (const c of (data ?? []) as unknown as { id: string; title: string; planning_units: { title: string } | null }[]) {
        clases.set(c.id, { tema: c.title, unidad: c.planning_units?.title ?? null });
      }
    })());
  }
  for (const grupo of trozos(unidadIds, TANDA * 2)) {
    tareas.push((async () => {
      const { data, error } = await supabase.from('planning_units').select('id, title').in('id', grupo);
      if (error) { console.error(error); return; }
      for (const u of (data ?? []) as { id: string; title: string }[]) unidades.set(u.id, u.title);
    })());
  }
  await Promise.all(tareas);
  return { clases, unidades };
}

// ── API ──

/**
 * Todo lo que se pudo medir en la ventana: las preguntas flojas (peor primero)
 * y cuántas se miraron, para distinguir "no hay datos" de "va todo bien".
 */
export async function getComprension(teacherId: string, opts: OpcionesRepaso = {}): Promise<Comprension> {
  const dias = opts.dias ?? DIAS_POR_DEFECTO;
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  const [actividades, sesiones] = await Promise.all([
    leerActividades(teacherId, opts, desde),
    leerSesiones(teacherId, opts, desde),
  ]);

  const [entregas, quizzes] = await Promise.all([
    actividades.length ? leerEntregas(actividades.map(a => a.id)) : Promise.resolve([]),
    sesiones.length ? leerQuizzes(sesiones.map(s => s.id)) : Promise.resolve([]),
  ]);

  const claseIds = new Set<string>();
  const unidadIds = new Set<string>();
  for (const a of actividades) {
    if (a.class_id) claseIds.add(a.class_id);
    else if (a.unit_id) unidadIds.add(a.unit_id);
  }
  const sesionPorId = new Map(sesiones.map(s => [s.id, s]));
  for (const q of quizzes) {
    const s = sesionPorId.get(q.session_id);
    if (s?.class_id) claseIds.add(s.class_id);
  }

  const [respuestasVivo, temas] = await Promise.all([
    quizzes.length ? leerRespuestasVivo(quizzes.map(q => q.id)) : Promise.resolve([]),
    leerTemas([...claseIds], [...unidadIds]),
  ]);

  const puntos: PuntoDebil[] = [];
  let preguntasAnalizadas = 0;
  let respuestasContadas = 0;

  const cerrar = (c: Contador, base: Omit<PuntoDebil, 'respuestas' | 'aciertos' | 'porcentaje' | 'errorFrecuente'>) => {
    respuestasContadas += c.respuestas;
    if (c.respuestas < MIN_RESPUESTAS) return;
    preguntasAnalizadas++;
    const porcentaje = pct(c.aciertos, c.respuestas);
    if (porcentaje >= UMBRAL_ACIERTO) return;
    puntos.push({ ...base, respuestas: c.respuestas, aciertos: c.aciertos, porcentaje, errorFrecuente: errorMasElegido(c) });
  };

  // ── Actividades ──
  const entregasPorActividad = new Map<string, FilaEntrega[]>();
  for (const e of entregas) {
    const lista = entregasPorActividad.get(e.activity_id);
    if (lista) lista.push(e); else entregasPorActividad.set(e.activity_id, [e]);
  }

  for (const a of actividades) {
    const lista = entregasPorActividad.get(a.id) ?? [];
    if (!lista.length) continue;
    const clase = a.class_id ? temas.clases.get(a.class_id) : undefined;
    const unidad = !a.class_id && a.unit_id ? temas.unidades.get(a.unit_id) : undefined;
    const tema: Tema & { clave: string } = clase
      ? { ...clase, clave: `clase:${a.class_id}` }
      : unidad
        ? { tema: unidad, unidad, clave: `unidad:${a.unit_id}` }
        : { tema: a.title, unidad: null, clave: `actividad:${a.id}` };

    for (const p of a.questions ?? []) {
      if (p.type !== 'multiple_choice') continue;
      const c = nuevoContador();
      for (const e of lista) {
        const r = e.answers?.[p.id];
        if (!r || typeof r !== 'object') continue;
        const elegida = aIndice(r.answer);
        // `correct` lo puso la base al entregar; si falta (entregas viejas), se calcula igual
        const ok = typeof r.correct === 'boolean'
          ? r.correct
          : elegida !== null && typeof p.correct_index === 'number' && elegida === p.correct_index;
        if (elegida === null && typeof r.correct !== 'boolean') continue;
        c.respuestas++;
        if (ok) c.aciertos++;
        else if (elegida !== null) {
          const etiqueta = p.options?.[elegida];
          if (etiqueta) c.errores.set(etiqueta, (c.errores.get(etiqueta) ?? 0) + 1);
        }
      }
      cerrar(c, {
        clave: `actividad:${a.id}:${p.id}`,
        fuente: 'actividad',
        pregunta: p.prompt,
        tema: tema.tema,
        temaClave: tema.clave,
        unidad: tema.unidad,
        origen: a.title,
        enlace: `/actividades/${a.id}`,
        fecha: a.created_at ?? '',
        subjectId: a.subject_id,
        courseId: a.course_id,
      });
    }
  }

  // ── Clase en vivo ──
  const respuestasPorQuiz = new Map<string, Contador>();
  const quizPorId = new Map(quizzes.map(q => [q.id, q]));
  for (const r of respuestasVivo) {
    const q = quizPorId.get(r.activity_id);
    if (!q || !r.opcion) continue;
    let c = respuestasPorQuiz.get(q.id);
    if (!c) { c = nuevoContador(); respuestasPorQuiz.set(q.id, c); }
    c.respuestas++;
    if (r.opcion === q.config?.correctId) c.aciertos++;
    else {
      const etiqueta = q.config?.options?.find(o => o.id === r.opcion)?.label;
      if (etiqueta) c.errores.set(etiqueta, (c.errores.get(etiqueta) ?? 0) + 1);
    }
  }

  for (const q of quizzes) {
    const c = respuestasPorQuiz.get(q.id);
    const s = sesionPorId.get(q.session_id);
    if (!c || !s) continue;
    const clase = s.class_id ? temas.clases.get(s.class_id) : undefined;
    cerrar(c, {
      clave: `vivo:${s.id}:${q.id}`,
      fuente: 'vivo',
      pregunta: q.config?.question?.trim() || 'Pregunta rápida',
      tema: clase?.tema ?? s.title,
      temaClave: clase ? `clase:${s.class_id}` : `vivo:${s.id}`,
      unidad: clase?.unidad ?? null,
      origen: s.title,
      enlace: '/clase-en-vivo',
      fecha: s.created_at ?? '',
      subjectId: s.subject_id,
      courseId: s.course_id,
    });
  }

  puntos.sort((x, y) => x.porcentaje - y.porcentaje || y.respuestas - x.respuestas);
  return { puntos, preguntasAnalizadas, respuestasContadas };
}

/**
 * Las preguntas que le costaron al curso (≥ 3 respuestas, < 60 % de aciertos),
 * la peor primero. Para agruparlas por tema: `agruparPorTema(puntos)`.
 */
export async function getQueRepasar(teacherId: string, opts?: OpcionesRepaso): Promise<PuntoDebil[]> {
  return (await getComprension(teacherId, opts)).puntos;
}

/**
 * Por tema: cuántas preguntas flojas tiene y qué porcentaje acertó el curso en
 * ellas (aciertos sobre respuestas). El tema más flojo primero.
 * Un mismo tema del programa en otro curso o materia va por separado.
 */
export function agruparPorTema(puntos: PuntoDebil[]): TemaRepaso[] {
  const grupos = new Map<string, TemaRepaso>();
  for (const p of puntos) {
    const clave = `${p.subjectId}:${p.courseId}:${p.temaClave}`;
    let g = grupos.get(clave);
    if (!g) {
      g = {
        clave, tema: p.tema, unidad: p.unidad, preguntas: [], respuestas: 0, aciertos: 0, porcentaje: 0,
        enlaceActividad: null, hayVivo: false, fecha: p.fecha, subjectId: p.subjectId, courseId: p.courseId,
      };
      grupos.set(clave, g);
    }
    g.preguntas.push(p);
    g.respuestas += p.respuestas;
    g.aciertos += p.aciertos;
    if (p.fuente === 'actividad' && !g.enlaceActividad) g.enlaceActividad = p.enlace;
    if (p.fuente === 'vivo') g.hayVivo = true;
    if (p.fecha > g.fecha) g.fecha = p.fecha;
  }
  const lista = [...grupos.values()];
  for (const g of lista) {
    g.porcentaje = pct(g.aciertos, g.respuestas);
    g.preguntas.sort((x, y) => x.porcentaje - y.porcentaje || y.respuestas - x.respuestas);
  }
  return lista.sort((x, y) => x.porcentaje - y.porcentaje || y.preguntas.length - x.preguntas.length);
}

/** Cuántos temas hay para repasar (para un aviso en el inicio). */
export async function contarTemasParaRepasar(teacherId: string, opts?: OpcionesRepaso): Promise<number> {
  return agruparPorTema(await getQueRepasar(teacherId, opts)).length;
}

/**
 * Para el inicio: cuántos temas conviene repasar en todos los cursos del docente.
 * `temas` es null mientras carga o si no se pudo leer (en ese caso no se muestra nada).
 *
 *   const { temas } = useResumenRepaso(user?.id);
 *   {temas ? <Link to="/...">Hay {temas} temas para repasar</Link> : null}
 */
export function useResumenRepaso(teacherId: string | null | undefined): { temas: number | null; cargando: boolean } {
  const [estado, setEstado] = useState<{ para: string; temas: number | null } | null>(null);

  useEffect(() => {
    if (!teacherId) return;
    let vigente = true;
    contarTemasParaRepasar(teacherId)
      .then(n => { if (vigente) setEstado({ para: teacherId, temas: n }); })
      .catch(err => { console.error(err); if (vigente) setEstado({ para: teacherId, temas: null }); });
    return () => { vigente = false; };
  }, [teacherId]);

  const listo = !!teacherId && estado?.para === teacherId;
  return { temas: listo ? estado.temas : null, cargando: !!teacherId && !listo };
}
