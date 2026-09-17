/**
 * SMT EstudIA — Grupos por curso
 *
 * Para el aula real: no siempre hay un celular por estudiante (batería,
 * datos, equipos compartidos) y muchas consignas son grupales. El docente
 * arma los grupos en segundos (reparto automático + ajustes a mano) y en
 * la clase en vivo puede pedir "una respuesta por grupo".
 */

import { supabase, unwrap } from './_helpers';

export interface CourseGroup {
  id: string;
  courseId: string;
  teacherId: string;
  name: string;
  emoji: string;
  memberIds: string[];
}

/** Nombres listos para el reparto automático: cortos y sin jerarquías. */
export const GROUP_PRESETS: { emoji: string; name: string }[] = [
  { emoji: '🔵', name: 'Grupo Azul' },
  { emoji: '🟢', name: 'Grupo Verde' },
  { emoji: '🟡', name: 'Grupo Amarillo' },
  { emoji: '🔴', name: 'Grupo Rojo' },
  { emoji: '🟣', name: 'Grupo Violeta' },
  { emoji: '🟠', name: 'Grupo Naranja' },
  { emoji: '⚪', name: 'Grupo Blanco' },
  { emoji: '🟤', name: 'Grupo Marrón' },
];

export async function getGroupsByCourse(courseId: string): Promise<CourseGroup[]> {
  const groups = unwrap(
    await supabase
      .from('course_groups')
      .select('*')
      .eq('course_id', courseId)
      .order('created_at')
  );
  if (groups.length === 0) return [];
  const members = unwrap(
    await supabase
      .from('course_group_members')
      .select('group_id, student_id')
      .in('group_id', groups.map((g: any) => g.id))
  );
  return groups.map((g: any) => ({
    id: g.id,
    courseId: g.course_id,
    teacherId: g.teacher_id,
    name: g.name,
    emoji: g.emoji,
    memberIds: members.filter((m: any) => m.group_id === g.id).map((m: any) => m.student_id),
  }));
}

/**
 * Reemplaza los grupos del curso por el reparto nuevo, en un solo paso.
 * Borrar y recrear es lo más simple y a esta escala (un curso) no duele.
 */
export async function saveGroups(
  courseId: string,
  teacherId: string,
  groups: { name: string; emoji: string; memberIds: string[] }[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from('course_groups')
    .delete()
    .eq('course_id', courseId)
    .eq('teacher_id', teacherId);
  if (delErr) throw delErr;
  if (groups.length === 0) return;

  const inserted = unwrap(
    await supabase
      .from('course_groups')
      .insert(groups.map(g => ({
        course_id: courseId,
        teacher_id: teacherId,
        name: g.name,
        emoji: g.emoji,
      })))
      .select('id')
  );

  const rows = inserted.flatMap((row: any, i: number) =>
    groups[i].memberIds.map(sid => ({ group_id: row.id, student_id: sid }))
  );
  if (rows.length > 0) {
    const { error } = await supabase.from('course_group_members').insert(rows);
    if (error) throw error;
  }
}

/** El grupo del estudiante en su curso (para "respondé por tu grupo"). */
export async function getMyGroup(studentId: string, courseId: string): Promise<CourseGroup | null> {
  const groups = await getGroupsByCourse(courseId);
  return groups.find(g => g.memberIds.includes(studentId)) ?? null;
}

/**
 * Reparto automático: mezcla y corta en grupos de ~`size`. Los restos se
 * reparten entre los primeros grupos (mejor 4-4-3 que un grupo de 1).
 */
export function autoSplit<T>(items: T[], size: number): T[][] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const nGroups = Math.max(1, Math.round(shuffled.length / size));
  const groups: T[][] = Array.from({ length: nGroups }, () => []);
  shuffled.forEach((item, i) => groups[i % nGroups].push(item));
  return groups;
}
