import { supabase, unwrap } from './_helpers';
import type { PlanningUnit, PlanningClass } from '../types';

export async function getPlanningByTeacher(teacherId: string): Promise<PlanningUnit[]> {
  const data = unwrap(
    await supabase
      .from('planning_units')
      .select('*, planning_classes(*)')
      .eq('teacher_id', teacherId)
      .order('sort_order')
  );

  return data.map(mapUnit);
}

/**
 * Solo títulos, fechas y estado (sin el contenido de cada tema): para saber
 * qué toca hoy sin bajar toda la planificación con datos prepagos.
 */
export async function getTemasConFecha(teacherId: string): Promise<PlanningUnit[]> {
  const data = unwrap(
    await supabase
      .from('planning_units')
      .select('id, title, subject_id, course_id, teacher_id, sort_order, term_id, anio, planning_classes(id, unit_id, title, sort_order, is_complete, fecha)' as '*')
      .eq('teacher_id', teacherId)
      .order('sort_order')
  );
  return data.map(mapUnit);
}

/** Un tema con su unidad (para prepararlo: /tema/:id). null si no existe o no es del docente. */
export async function getTema(classId: string): Promise<{ tema: PlanningClass; unidad: PlanningUnit } | null> {
  const { data, error } = await supabase
    .from('planning_classes')
    .select('*, planning_units(*)')
    .eq('id', classId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown> & { planning_units: Record<string, unknown> | null };
  if (!row.planning_units) return null;
  return { tema: mapClass(row), unidad: mapUnit({ ...row.planning_units, planning_classes: [] }) };
}

export async function getPlanningBySubjectAndCourse(
  subjectId: string,
  courseId: string,
  teacherId: string
): Promise<PlanningUnit[]> {
  const data = unwrap(
    await supabase
      .from('planning_units')
      .select('*, planning_classes(*)')
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
      .eq('teacher_id', teacherId)
      .order('sort_order')
  );

  return data.map(mapUnit);
}

export async function createUnit(unit: {
  title: string;
  subjectId: string;
  courseId: string;
  teacherId: string;
  order: number;
  /** Ciclo lectivo (062). Sin él, la base la toma como del año en curso. */
  anio?: number;
}): Promise<PlanningUnit> {
  const row = unwrap(
    await supabase
      .from('planning_units')
      .insert({
        title: unit.title,
        subject_id: unit.subjectId,
        course_id: unit.courseId,
        teacher_id: unit.teacherId,
        sort_order: unit.order,
        ...(unit.anio ? { anio: unit.anio } : {}),
      } as never)
      .select('*, planning_classes(*)')
      .single()
  );

  return mapUnit(row);
}

export async function createClass(cls: {
  unitId: string;
  title: string;
  order: number;
  objectives?: string[];
  content?: string;
}): Promise<PlanningClass> {
  const row = unwrap(
    await supabase
      .from('planning_classes')
      .insert({
        unit_id: cls.unitId,
        title: cls.title,
        sort_order: cls.order,
        objectives: cls.objectives ?? [],
        content: cls.content ?? null,
      })
      .select()
      .single()
  );

  return mapClass(row);
}

/**
 * Suma un texto al final de las notas del tema: lee lo que hay en ese momento
 * (no una copia vieja de la pantalla) y avisa si no se guardó (por ejemplo,
 * un tema de un curso que ya no tiene asignado).
 */
export async function agregarAlTema(id: string, texto: string): Promise<string> {
  const { data: actual, error: errLeer } = await supabase.from('planning_classes').select('content').eq('id', id).maybeSingle();
  if (errLeer) throw errLeer;
  if (!actual) throw new Error('No encontramos el tema.');
  const nuevo = actual.content ? `${actual.content}\n\n${texto}` : texto;
  const { data, error } = await supabase.from('planning_classes').update({ content: nuevo }).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo guardar en el tema: puede ser de un curso que ya no tenés asignado.');
  return nuevo;
}

export async function updateClass(id: string, updates: Partial<{
  title: string;
  objectives: string[];
  content: string;
  isComplete: boolean;
  fecha: string | null;
}>): Promise<void> {
  const dbUpdates: Record<string, any> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.objectives !== undefined) dbUpdates.objectives = updates.objectives;
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.isComplete !== undefined) dbUpdates.is_complete = updates.isComplete;
  if (updates.fecha !== undefined) dbUpdates.fecha = updates.fecha;

  const { error } = await supabase.from('planning_classes').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export async function deleteUnit(id: string): Promise<void> {
  const { error } = await supabase.from('planning_units').delete().eq('id', id);
  if (error) throw error;
}

function mapUnit(row: any): PlanningUnit {
  const classes = (row.planning_classes ?? [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map(mapClass);

  return {
    id: row.id,
    title: row.title,
    subjectId: row.subject_id,
    courseId: row.course_id,
    teacherId: row.teacher_id,
    order: row.sort_order,
    termId: row.term_id ?? null,
    anio: row.anio ?? null,
    classes,
  };
}

/**
 * ¿La unidad es de este ciclo lectivo? Las de antes de la 062 no tienen año
 * y cuentan como del año en curso (igual que en la base, anio_de_unidad).
 */
export function esDelAnio(u: PlanningUnit, anio: number): boolean {
  return (u.anio ?? new Date().getFullYear()) === anio;
}

function mapClass(row: any): PlanningClass {
  return {
    id: row.id,
    unitId: row.unit_id,
    title: row.title,
    order: row.sort_order,
    objectives: row.objectives ?? [],
    content: row.content ?? undefined,
    isComplete: row.is_complete,
    fecha: row.fecha ?? null,
  };
}

export interface TemaDelPrograma {
  /** El id del tema: la actividad que se arma con él queda en ese tema */
  id: string;
  unidad: string;
  clase: string;
  dada: boolean;
}

/**
 * Temas del programa de un curso, para sugerir en Actividad rápida. Solo
 * títulos y si la clase ya se dio: nada del contenido de cada clase, que
 * puede ser largo y no hace falta para sugerir.
 */
export async function getTemasDelPrograma(
  subjectId: string,
  courseId: string,
  teacherId: string,
): Promise<TemaDelPrograma[]> {
  const data = unwrap(
    await supabase
      .from('planning_units')
      .select('title, sort_order, planning_classes(id, title, sort_order, is_complete)')
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
      .eq('teacher_id', teacherId)
      .order('sort_order')
  );
  return data.flatMap((u: { title: string; planning_classes: { id: string; title: string; sort_order: number; is_complete: boolean }[] | null }) =>
    [...(u.planning_classes ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => ({ id: c.id, unidad: u.title, clase: c.title, dada: !!c.is_complete })),
  );
}
