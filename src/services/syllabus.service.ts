/**
 * ENSEÑIA SMT — Temario por trimestre y criterios de evaluación (012)
 *
 * Pedido de las escuelas: "Criterios de evaluación. Temario de primer,
 * segundo y tercer trimestre." Y que el estudiante no tenga que descargar
 * nada para verlo.
 *
 * Asignarle trimestre a una unidad ES publicarla: sin trimestre, la unidad
 * queda como borrador del docente y la RLS (012) no se la muestra a nadie más.
 */

import { supabase, unwrap } from './_helpers';
import type { PlanningUnit, PlanningClass, EvaluationCriteria, SyllabusSubject } from '../types';

function mapClass(row: any): PlanningClass {
  return {
    id: row.id,
    unitId: row.unit_id,
    title: row.title,
    order: row.sort_order,
    objectives: row.objectives ?? [],
    content: row.content ?? undefined,
    isComplete: row.is_complete,
  };
}

function mapUnit(row: any): PlanningUnit {
  return {
    id: row.id,
    title: row.title,
    subjectId: row.subject_id,
    courseId: row.course_id,
    teacherId: row.teacher_id,
    order: row.sort_order,
    termId: row.term_id,
    classes: (row.planning_classes ?? [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map(mapClass),
  };
}

function mapCriteria(row: any): EvaluationCriteria {
  return {
    id: row.id,
    schoolId: row.school_id,
    subjectId: row.subject_id,
    courseId: row.course_id,
    termId: row.term_id,
    criteria: row.criteria,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
  };
}

// ── Docente ──

/** Unidades del docente en una materia+curso, con el trimestre asignado. */
export async function getUnitsForTeacher(
  teacherId: string, subjectId: string, courseId: string,
): Promise<PlanningUnit[]> {
  const data = unwrap(
    await supabase
      .from('planning_units')
      .select('*, planning_classes(*)')
      .eq('teacher_id', teacherId)
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
      .order('sort_order')
  );
  return data.map(mapUnit);
}

/** Ubicar (o sacar) una unidad de un trimestre. null = vuelve a borrador. */
export async function setUnitTerm(unitId: string, termId: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('planning_units')
    .update({ term_id: termId })
    .eq('id', unitId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo actualizar la unidad.');
}

export async function getCriteria(
  subjectId: string, courseId: string, termId: string,
): Promise<EvaluationCriteria | null> {
  const { data, error } = await supabase
    .from('evaluation_criteria')
    .select('*')
    .eq('subject_id', subjectId)
    .eq('course_id', courseId)
    .eq('term_id', termId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCriteria(data) : null;
}

export async function saveCriteria(params: {
  existingId: string | null;
  schoolId: string;
  subjectId: string;
  courseId: string;
  termId: string;
  criteria: string;
  isPublished: boolean;
}): Promise<void> {
  const { existingId, schoolId, subjectId, courseId, termId, criteria, isPublished } = params;
  if (existingId) {
    const { data, error } = await supabase
      .from('evaluation_criteria')
      .update({ criteria: criteria.trim(), is_published: isPublished })
      .eq('id', existingId)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No se pudieron guardar los criterios.');
    return;
  }
  const { error } = await supabase.from('evaluation_criteria').insert({
    school_id: schoolId,
    subject_id: subjectId,
    course_id: courseId,
    term_id: termId,
    criteria: criteria.trim(),
    is_published: isPublished,
  });
  if (!error) return;

  // Alguien más (la pareja pedagógica, u otra pestaña) creó la fila entre
  // nuestra lectura y este insert. Sin esto el docente queda en un error
  // que se repite para siempre: no hay upsert porque los GRANT por
  // columna solo permiten actualizar criteria e is_published.
  if (error.code !== '23505') throw error;

  const existente = await getCriteria(subjectId, courseId, termId);
  if (!existente) throw error;
  const { data, error: err2 } = await supabase
    .from('evaluation_criteria')
    .update({ criteria: criteria.trim(), is_published: isPublished })
    .eq('id', existente.id)
    .select('id');
  if (err2) throw err2;
  if (!data || data.length === 0) throw new Error('No se pudieron guardar los criterios.');
}

// ── Estudiante / familia ──

/**
 * Temario de un trimestre para quien cursa: unidades publicadas de cada
 * materia con sus clases, y los criterios de evaluación publicados.
 * La RLS (012) hace el filtrado real — acá solo se agrupa por materia.
 */
export async function getSyllabusForTerm(termId: string): Promise<SyllabusSubject[]> {
  const [unitRows, critRows] = await Promise.all([
    supabase
      .from('planning_units')
      .select('*, planning_classes(*), subjects(name)')
      .eq('term_id', termId)
      .order('sort_order'),
    supabase
      .from('evaluation_criteria')
      .select('*, subjects(name)')
      .eq('term_id', termId)
      .eq('is_published', true),
  ]);
  if (unitRows.error) throw unitRows.error;
  if (critRows.error) throw critRows.error;

  const bySubject = new Map<string, SyllabusSubject>();
  const entrada = (subjectId: string, courseId: string, nombre?: string): SyllabusSubject => {
    const key = `${subjectId}|${courseId}`;
    let e = bySubject.get(key);
    if (!e) {
      e = { subjectId, courseId, subjectName: nombre ?? 'Materia', units: [], criteria: null };
      bySubject.set(key, e);
    } else if (nombre && e.subjectName === 'Materia') {
      e.subjectName = nombre;
    }
    return e;
  };

  for (const row of unitRows.data ?? []) {
    entrada(row.subject_id, row.course_id, (row as any).subjects?.name)
      .units.push(mapUnit(row));
  }

  // Los criterios entran por derecho propio: una materia puede tener los
  // criterios del trimestre publicados antes de cargar ninguna unidad, y
  // el estudiante igual tiene que poder leer cómo se lo va a evaluar.
  for (const c of critRows.data ?? []) {
    entrada(c.subject_id, c.course_id, (c as any).subjects?.name).criteria = c.criteria;
  }

  return [...bySubject.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}
