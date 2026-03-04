import { supabase, unwrap } from './_helpers';
import type { Alert } from '../types';

export async function getAlertsByTeacher(teacherId: string): Promise<Alert[]> {
  const data = unwrap(
    await supabase
      .from('alerts')
      .select('*, alert_students(student_id)')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
  );

  return data.map(mapAlert);
}

export async function getAlertsBySchool(schoolId: string): Promise<Alert[]> {
  const data = unwrap(
    await supabase
      .from('alerts')
      .select('*, alert_students(student_id)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
  );

  return data.map(mapAlert);
}

export async function getUnreadAlertCount(teacherId: string): Promise<number> {
  const { count, error } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('is_read', false);

  if (error) return 0;
  return count ?? 0;
}

export async function markAlertRead(alertId: string): Promise<void> {
  const { error } = await supabase.from('alerts').update({ is_read: true }).eq('id', alertId);
  if (error) throw error;
}

function mapAlert(row: any): Alert {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    message: row.message,
    date: row.date_label ?? '',
    studentIds: row.alert_students?.map((as: any) => as.student_id) ?? [],
    teacherId: row.teacher_id ?? undefined,
    schoolId: row.school_id,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}
