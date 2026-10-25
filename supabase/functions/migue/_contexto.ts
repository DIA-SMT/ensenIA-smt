/**
 * Lo que el docente está mirando cuando le escribe a Migue (UX docente,
 * 25/10/2026): un tema de su planificación, un material, una actividad o la
 * clase en vivo.
 *
 * El cliente manda solo el tipo y el id. Acá se lee con el cliente del
 * usuario (su RLS): si no es suyo, no llega nada y Migue sigue sin contexto.
 * De los chicos no viaja nada: ni nombres ni respuestas, solo cuántos.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type TipoContexto = 'tema' | 'material' | 'actividad' | 'clase_en_vivo';
const TIPOS: TipoContexto[] = ['tema', 'material', 'actividad', 'clase_en_vivo'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ContextoResuelto {
  tipo: TipoContexto;
  id: string;
  titulo: string;
  temaId: string | null;
  subjectId: string | null;
  courseId: string | null;
  materia: string | null;
  curso: string | null;
  /** La sección para el prompt */
  texto: string;
}

const recortar = (s: string | null | undefined, max: number) => {
  const t = (s ?? '').replace(/\s+\n/g, '\n').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

const TIPO_ACTIVIDAD: Record<string, string> = { actividad: 'actividad', tp: 'trabajo práctico', evaluacion: 'evaluación' };
const ESTADO_ACTIVIDAD: Record<string, string> = { draft: 'borrador', published: 'publicada', closed: 'cerrada' };

type Nombre = { name?: string | null } | null;

/** El pedido del cliente, validado (o null) */
export function leerPedido(crudo: unknown): { tipo: TipoContexto; id: string } | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const { tipo, id } = crudo as { tipo?: unknown; id?: unknown };
  if (typeof tipo !== 'string' || !TIPOS.includes(tipo as TipoContexto)) return null;
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  return { tipo: tipo as TipoContexto, id };
}

export async function resolverContexto(db: SupabaseClient, pedido: { tipo: TipoContexto; id: string }): Promise<ContextoResuelto | null> {
  try {
    switch (pedido.tipo) {
      case 'tema': return await deTema(db, pedido.id);
      case 'material': return await deMaterial(db, pedido.id);
      case 'actividad': return await deActividad(db, pedido.id);
      case 'clase_en_vivo': return await deClaseEnVivo(db, pedido.id);
    }
  } catch (e) {
    console.error('contexto de Migue:', String(e).slice(0, 200));
    return null;
  }
}

async function deTema(db: SupabaseClient, id: string): Promise<ContextoResuelto | null> {
  const { data: t } = await db.from('planning_classes')
    .select('id, title, objectives, content, fecha, planning_units(id, title, subject_id, course_id, subjects(name), courses(name))')
    .eq('id', id).maybeSingle();
  if (!t) return null;
  const u = (t as any).planning_units as { title: string; subject_id: string; course_id: string; subjects: Nombre; courses: Nombre } | null;
  const [{ data: mats }, { data: acts }, { count: preguntas }] = await Promise.all([
    db.from('library_materials').select('title, file_type').eq('class_id', id).limit(8),
    db.from('activities').select('title, tipo, status').eq('class_id', id).limit(8),
    db.from('preguntas_en_vivo').select('id', { count: 'exact', head: true }).eq('class_id', id),
  ]);
  const materia = u?.subjects?.name ?? null;
  const curso = u?.courses?.name ?? null;
  const objetivos = ((t as any).objectives as string[] | null) ?? [];
  const lineas = [
    `Un tema de su planificación: «${t.title}»${u?.title ? ` (unidad «${u.title}»)` : ''}${materia ? `, ${materia}` : ''}${curso ? ` · ${curso}` : ''}${(t as any).fecha ? `, para el ${(t as any).fecha}` : ''}.`,
    objetivos.length ? `Al terminar, los chicos van a poder: ${objetivos.join('; ')}.` : 'Todavía no tiene objetivos escritos.',
    (mats ?? []).length
      ? `Materiales del tema: ${(mats as { title: string }[]).map(m => `«${m.title}»`).join(', ')}.`
      : 'Todavía no tiene materiales.',
    (acts ?? []).length
      ? `Actividades del tema: ${(acts as { title: string; tipo: string; status: string }[]).map(a => `«${a.title}» (${TIPO_ACTIVIDAD[a.tipo] ?? a.tipo}, ${ESTADO_ACTIVIDAD[a.status] ?? a.status})`).join(', ')}.`
      : 'Todavía no tiene actividades para los chicos.',
    `Preguntas preparadas para la clase en vivo: ${preguntas ?? 0}.`,
    (t as any).content ? `Sus notas del tema:\n${recortar((t as any).content, 1500)}` : '',
  ].filter(Boolean);
  return {
    tipo: 'tema', id, titulo: t.title, temaId: id,
    subjectId: u?.subject_id ?? null, courseId: u?.course_id ?? null, materia, curso,
    texto: lineas.join('\n'),
  };
}

async function deMaterial(db: SupabaseClient, id: string): Promise<ContextoResuelto | null> {
  const { data: m } = await db.from('library_materials')
    .select('id, title, description, subject_id, subject_name, course_id, class_id, ai_summary, extracted_text, file_type, courses(name), planning_classes(title)')
    .eq('id', id).maybeSingle();
  if (!m) return null;
  const curso = ((m as any).courses as Nombre)?.name ?? null;
  const tema = ((m as any).planning_classes as { title?: string } | null)?.title ?? null;
  const contenido = m.ai_summary
    ? `Resumen:\n${recortar(m.ai_summary, 1500)}`
    : m.extracted_text ? `Contenido (el comienzo):\n${recortar(m.extracted_text, 3000)}` : 'No hay texto del material para leer (puede ser una imagen o un video).';
  return {
    tipo: 'material', id, titulo: m.title, temaId: m.class_id ?? null,
    subjectId: m.subject_id ?? null, courseId: m.course_id ?? null, materia: m.subject_name ?? null, curso,
    texto: [
      `Un material de su biblioteca: «${m.title}»${m.subject_name ? `, ${m.subject_name}` : ''}${curso ? ` · ${curso}` : ''}${tema ? `, del tema «${tema}»` : ''}.`,
      m.description ? `Descripción: ${recortar(m.description, 300)}` : '',
      contenido,
    ].filter(Boolean).join('\n'),
  };
}

async function deActividad(db: SupabaseClient, id: string): Promise<ContextoResuelto | null> {
  const { data: a } = await db.from('activities')
    .select('id, title, tipo, status, content_md, questions, due_date, class_id, subject_id, course_id, subjects(name), courses(name)')
    .eq('id', id).maybeSingle();
  if (!a) return null;
  // Cuántos entregaron, sin quién
  const { data: entregas } = await db.from('activity_submissions').select('status').eq('activity_id', id).limit(500);
  const porEstado: Record<string, number> = {};
  for (const e of (entregas ?? []) as { status: string }[]) porEstado[e.status] = (porEstado[e.status] ?? 0) + 1;
  const materia = ((a as any).subjects as Nombre)?.name ?? null;
  const curso = ((a as any).courses as Nombre)?.name ?? null;
  const partes = Array.isArray(a.questions) ? a.questions.length : 0;
  return {
    tipo: 'actividad', id, titulo: a.title, temaId: a.class_id ?? null,
    subjectId: a.subject_id ?? null, courseId: a.course_id ?? null, materia, curso,
    texto: [
      `Una ${TIPO_ACTIVIDAD[(a as any).tipo] ?? 'actividad'} suya: «${a.title}»${materia ? `, ${materia}` : ''}${curso ? ` · ${curso}` : ''} (${ESTADO_ACTIVIDAD[a.status] ?? a.status}${a.due_date ? `, vence el ${String(a.due_date).slice(0, 10)}` : ''}).`,
      partes ? `Tiene ${partes} ${partes === 1 ? 'parte o pregunta' : 'partes o preguntas'}.` : '',
      a.content_md ? `Consigna:\n${recortar(a.content_md, 2000)}` : '',
      Object.keys(porEstado).length
        ? `Entregas (sin nombres): ${Object.entries(porEstado).map(([k, n]) => `${n} ${k === 'submitted' ? 'entregadas sin corregir' : k === 'graded' ? 'corregidas' : k === 'in_progress' ? 'empezadas' : k === 'pending' ? 'sin empezar' : k}`).join(', ')}.`
        : 'Todavía no hay entregas.',
    ].filter(Boolean).join('\n'),
  };
}

async function deClaseEnVivo(db: SupabaseClient, id: string): Promise<ContextoResuelto | null> {
  const { data: s } = await db.from('live_sessions')
    .select('id, title, status, class_id, subject_id, course_id, subjects(name), courses(name), planning_classes(title)')
    .eq('id', id).maybeSingle();
  if (!s) return null;
  const { data: acts } = await db.from('live_activities')
    .select('kind, config, status').eq('session_id', id).order('created_at', { ascending: false }).limit(3);
  const materia = ((s as any).subjects as Nombre)?.name ?? null;
  const curso = ((s as any).courses as Nombre)?.name ?? null;
  const tema = ((s as any).planning_classes as { title?: string } | null)?.title ?? null;
  const ultimas = ((acts ?? []) as { kind: string; config: { question?: string } | null; status: string }[])
    .map(x => x.config?.question ? `«${recortar(x.config.question, 140)}»` : x.kind);
  return {
    tipo: 'clase_en_vivo', id, titulo: s.title, temaId: s.class_id ?? null,
    subjectId: s.subject_id ?? null, courseId: s.course_id ?? null, materia, curso,
    texto: [
      `Está dando una clase en vivo: «${s.title}»${s.status === 'live' ? '' : ' (ya terminó)'}${tema ? `, con el tema «${tema}»` : ''}.`,
      s.course_id ? '' : 'Es una sala sin curso: participan invitados (una reunión, una jornada o una charla).',
      ultimas.length ? `Lo último que lanzó: ${ultimas.join(', ')}.` : 'Todavía no lanzó nada.',
    ].filter(Boolean).join('\n'),
  };
}

/** La sección del prompt (va en la parte que cambia, después del caché) */
export function seccionContexto(c: ContextoResuelto): string {
  return `\n\n## Lo que está mirando ahora
${c.texto}
Tomalo como punto de partida de esta pregunta: no se lo describas de vuelta, usalo.`;
}
