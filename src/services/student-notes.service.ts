/**
 * ENSEÑIA SMT — Notas personales del estudiante
 *
 * Checklist simple para organizarse: crear, tildar como hecha,
 * fijar arriba y borrar. Calcado de quick_notes del docente.
 */

import { supabase, unwrap } from './_helpers';
import type { StudentNote } from '../types';

function mapNote(row: any): StudentNote {
  return {
    id: row.id,
    studentId: row.student_id,
    text: row.text,
    isDone: row.is_done,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
  };
}

export async function getStudentNotes(studentId: string): Promise<StudentNote[]> {
  const data = unwrap(
    await supabase
      .from('student_notes')
      .select('*')
      .eq('student_id', studentId)
      .order('is_pinned', { ascending: false })
      .order('is_done', { ascending: true })
      .order('created_at', { ascending: false })
  );
  return data.map(mapNote);
}

export async function createStudentNote(studentId: string, text: string): Promise<StudentNote> {
  const row = unwrap(
    await supabase
      .from('student_notes')
      .insert({ student_id: studentId, text })
      .select()
      .single()
  );
  return mapNote(row);
}

export async function toggleNoteDone(noteId: string, isDone: boolean): Promise<void> {
  const { error } = await supabase.from('student_notes').update({ is_done: isDone }).eq('id', noteId);
  if (error) throw error;
}

export async function toggleNotePin(noteId: string, isPinned: boolean): Promise<void> {
  const { error } = await supabase.from('student_notes').update({ is_pinned: isPinned }).eq('id', noteId);
  if (error) throw error;
}

export async function deleteStudentNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('student_notes').delete().eq('id', noteId);
  if (error) throw error;
}
