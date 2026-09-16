/**
 * EstudIA — Gamificación
 *
 * Logros del estudiante (otorgados por docentes o automáticos por el
 * sistema) y reacciones a materiales de la biblioteca. La motivación
 * también es dato pedagógico.
 */

import { supabase, unwrap } from './_helpers';
import type { StudentAchievement, MaterialReactionType } from '../types';

function mapAchievement(row: any): StudentAchievement {
  return {
    id: row.id,
    studentId: row.student_id,
    grantedBy: row.granted_by,
    kind: row.kind,
    emoji: row.emoji,
    title: row.title,
    reason: row.reason,
    points: row.points,
    createdAt: row.created_at,
    grantedByName: row.profiles ? `${row.profiles.first_name} ${row.profiles.last_name}` : undefined,
  };
}

export async function getAchievementsByStudent(studentId: string): Promise<StudentAchievement[]> {
  const data = unwrap(
    await supabase
      .from('student_achievements')
      .select('*, profiles(first_name, last_name)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
  );
  return data.map(mapAchievement);
}

export async function grantAchievement(a: {
  studentId: string;
  teacherId: string;
  emoji: string;
  title: string;
  points?: number;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.from('student_achievements').insert({
    student_id: a.studentId,
    granted_by: a.teacherId,
    kind: 'docente',
    emoji: a.emoji,
    title: a.title.trim(),
    points: a.points ?? 10,
    reason: a.reason?.trim() || null,
  });
  if (error) throw error;
}

export async function revokeAchievement(id: string): Promise<void> {
  const { error } = await supabase.from('student_achievements').delete().eq('id', id);
  if (error) throw error;
}

export function totalPoints(achievements: StudentAchievement[]): number {
  return achievements.reduce((acc, a) => acc + a.points, 0);
}

// ── Reacciones a materiales ──

/** Reacciones del estudiante logueado, indexadas por material. */
export async function getMyMaterialReactions(studentId: string): Promise<Record<string, MaterialReactionType>> {
  const data = unwrap(
    await supabase
      .from('material_reactions')
      .select('material_id, reaction')
      .eq('student_id', studentId)
  );
  const map: Record<string, MaterialReactionType> = {};
  data.forEach((r: any) => { map[r.material_id] = r.reaction; });
  return map;
}

/** Setea, cambia o quita (reaction=null) la reacción a un material. */
export async function setMaterialReaction(
  materialId: string,
  studentId: string,
  reaction: MaterialReactionType | null,
): Promise<void> {
  if (reaction === null) {
    const { error } = await supabase
      .from('material_reactions')
      .delete()
      .eq('material_id', materialId)
      .eq('student_id', studentId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('material_reactions')
    .upsert({ material_id: materialId, student_id: studentId, reaction });
  if (error) throw error;
}

/** Conteo de reacciones por material del docente logueado (para su biblioteca). */
export async function getReactionCountsForTeacher(materialIds: string[]): Promise<Record<string, { likes: number; dislikes: number }>> {
  if (materialIds.length === 0) return {};
  const data = unwrap(
    await supabase
      .from('material_reactions')
      .select('material_id, reaction')
      .in('material_id', materialIds)
  );
  const map: Record<string, { likes: number; dislikes: number }> = {};
  data.forEach((r: any) => {
    const entry = (map[r.material_id] ??= { likes: 0, dislikes: 0 });
    if (r.reaction === 'like') entry.likes += 1;
    else entry.dislikes += 1;
  });
  return map;
}
