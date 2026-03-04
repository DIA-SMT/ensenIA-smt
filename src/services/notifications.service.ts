import { supabase, unwrap } from './_helpers';
import type { Notification } from '../types';

export async function getNotificationsForUser(userId: string): Promise<Notification[]> {
  const notifs = unwrap(
    await supabase
      .from('notifications')
      .select('*, from_profile:profiles!notifications_from_user_id_fkey(first_name, last_name)')
      .or(`to_user_id.eq.${userId},to_user_id.is.null`)
      .order('created_at', { ascending: false })
  );

  const readNotifs = (
    await supabase
      .from('notification_reads')
      .select('notification_id')
      .eq('user_id', userId)
  ).data ?? [];

  const readSet = new Set(readNotifs.map((r: any) => r.notification_id));

  return notifs.map((n: any) => mapNotification(n, readSet));
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const notifs = (
    await supabase
      .from('notifications')
      .select('id')
      .or(`to_user_id.eq.${userId},to_user_id.is.null`)
  ).data ?? [];

  const readNotifs = (
    await supabase
      .from('notification_reads')
      .select('notification_id')
      .eq('user_id', userId)
  ).data ?? [];

  const readSet = new Set(readNotifs.map((r: any) => r.notification_id));
  return notifs.filter((n: any) => !readSet.has(n.id)).length;
}

export async function getAllSentNotifications(schoolId: string): Promise<Notification[]> {
  const notifs = unwrap(
    await supabase
      .from('notifications')
      .select('*, from_profile:profiles!notifications_from_user_id_fkey(first_name, last_name)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
  );

  return notifs.map((n: any) => mapNotification(n, new Set()));
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('notification_reads').upsert({
    notification_id: notificationId,
    user_id: userId,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string, notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const rows = notificationIds.map(nid => ({ notification_id: nid, user_id: userId }));
  const { error } = await supabase.from('notification_reads').upsert(rows);
  if (error) throw error;
}

export async function createNotification(data: {
  fromUserId: string;
  toUserId: string | null;
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  schoolId: string;
}): Promise<void> {
  await supabase.from('notifications').insert({
    from_user_id: data.fromUserId,
    to_user_id: data.toUserId,
    title: data.title,
    message: data.message,
    priority: data.priority,
    school_id: data.schoolId,
  });
}

function mapNotification(row: any, readSet: Set<string>): Notification {
  const fromProfile = row.from_profile;
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    fromName: fromProfile
      ? `${fromProfile.first_name} ${fromProfile.last_name}`
      : '',
    toUserId: row.to_user_id ?? 'all',
    title: row.title,
    message: row.message,
    priority: row.priority,
    isRead: readSet.has(row.id),
    schoolId: row.school_id,
    createdAt: row.created_at,
  };
}
