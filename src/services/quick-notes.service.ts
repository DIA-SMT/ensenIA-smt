import { supabase, unwrap } from './_helpers';
import type { QuickNote } from '../types';

export async function getQuickNotes(teacherId: string): Promise<QuickNote[]> {
  const data = unwrap(
    await supabase
      .from('quick_notes')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
  );

  return data.map(mapNote);
}

export async function createNote(text: string, teacherId: string): Promise<QuickNote> {
  const row = unwrap(
    await supabase
      .from('quick_notes')
      .insert({ text, teacher_id: teacherId })
      .select()
      .single()
  );

  return mapNote(row);
}

export async function togglePin(noteId: string, isPinned: boolean): Promise<void> {
  await supabase.from('quick_notes').update({ is_pinned: isPinned }).eq('id', noteId);
}

export async function deleteNote(noteId: string): Promise<void> {
  await supabase.from('quick_notes').delete().eq('id', noteId);
}

function mapNote(row: any): QuickNote {
  return {
    id: row.id,
    text: row.text,
    teacherId: row.teacher_id,
    createdAt: row.created_at,
    isPinned: row.is_pinned,
  };
}
