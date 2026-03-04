import { supabase, unwrap } from './_helpers';
import type { Communication } from '../types';

export async function getCommunicationsBySchool(schoolId: string): Promise<Communication[]> {
  const data = unwrap(
    await supabase
      .from('communications')
      .select(`
        *,
        from_profile:profiles!communications_from_user_id_fkey(first_name, last_name),
        communication_recipients(user_id, profiles(first_name, last_name)),
        communication_reads(user_id)
      `)
      .eq('school_id', schoolId)
      .order('sent_at', { ascending: false })
  );

  return data.map(mapCommunication);
}

export async function sendCommunication(data: {
  fromUserId: string;
  subject: string;
  body: string;
  priority: 'high' | 'medium' | 'low';
  schoolId: string;
  toUserIds: string[] | 'all';
}): Promise<void> {
  const isBroadcast = data.toUserIds === 'all';

  const comm = unwrap(
    await supabase
      .from('communications')
      .insert({
        from_user_id: data.fromUserId,
        subject: data.subject,
        body: data.body,
        priority: data.priority,
        school_id: data.schoolId,
        is_broadcast: isBroadcast,
      })
      .select()
      .single()
  );

  if (!isBroadcast && Array.isArray(data.toUserIds)) {
    const recipients = data.toUserIds.filter(uid => uid).map(uid => ({
      communication_id: comm.id,
      user_id: uid,
    }));
    if (recipients.length > 0) {
      const { error } = await supabase.from('communication_recipients').insert(recipients);
      if (error) throw error;
    }
  }
}

export async function markCommunicationRead(communicationId: string, userId: string): Promise<void> {
  await supabase.from('communication_reads').upsert({
    communication_id: communicationId,
    user_id: userId,
  });
}

function mapCommunication(row: any): Communication {
  const fromProfile = row.from_profile;
  const recipients = row.communication_recipients ?? [];
  const reads = row.communication_reads ?? [];

  const toNames: string[] = row.is_broadcast
    ? ['Todos los docentes']
    : recipients.map((r: any) => {
        const p = r.profiles;
        return p ? `${p.first_name} ${p.last_name}` : '';
      });

  const toUserIds: string[] | 'all' = row.is_broadcast
    ? 'all'
    : recipients.map((r: any) => r.user_id);

  return {
    id: row.id,
    fromUserId: row.from_user_id,
    fromName: fromProfile
      ? `${fromProfile.first_name} ${fromProfile.last_name}`
      : '',
    toUserIds,
    toNames,
    subject: row.subject,
    body: row.body,
    priority: row.priority,
    schoolId: row.school_id,
    sentAt: row.sent_at,
    readBy: reads.map((r: any) => r.user_id),
  };
}
