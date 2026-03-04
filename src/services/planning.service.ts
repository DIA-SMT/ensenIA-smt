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
      })
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

export async function updateClass(id: string, updates: Partial<{
  title: string;
  objectives: string[];
  content: string;
  isComplete: boolean;
}>): Promise<void> {
  const dbUpdates: Record<string, any> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.objectives !== undefined) dbUpdates.objectives = updates.objectives;
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.isComplete !== undefined) dbUpdates.is_complete = updates.isComplete;

  await supabase.from('planning_classes').update(dbUpdates).eq('id', id);
}

export async function deleteUnit(id: string): Promise<void> {
  await supabase.from('planning_units').delete().eq('id', id);
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
    classes,
  };
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
  };
}
