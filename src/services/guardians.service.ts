/**
 * ENSEÑIA SMT — Familias
 *
 * Vínculos tutor-estudiante, comunicados oficiales y citaciones
 * con acuse de recibo y confirmación de asistencia.
 */

import { supabase, unwrap } from './_helpers';
import type { GuardianLink, GuardianNotice, NoticeReceipt, NoticeResponse, NoticeType, Student } from '../types';

// ── Tutor: mis hijos ──

export async function getMyChildren(): Promise<(Student & { relationship: string })[]> {
  const data = unwrap(
    await supabase
      .from('student_guardians')
      .select('relationship, students(*, courses(name))')
      .order('created_at')
  );
  return data
    .filter((r: any) => r.students)
    .map((r: any) => ({
      id: r.students.id,
      firstName: r.students.first_name,
      lastName: r.students.last_name,
      avatarInitials: r.students.avatar_initials,
      courseId: r.students.course_id,
      courseName: r.students.courses?.name ?? '',
      status: r.students.status,
      alerts: r.students.alerts_count,
      progress: Number(r.students.progress),
      attendance: Number(r.students.attendance),
      average: Number(r.students.average),
      schoolId: r.students.school_id,
      relationship: r.relationship,
    }));
}

// ── Tutor: comunicados ──

function mapNotice(row: any): GuardianNotice {
  return {
    id: row.id,
    schoolId: row.school_id,
    studentId: row.student_id,
    fromUserId: row.from_user_id,
    fromName: row.profiles ? `${row.profiles.first_name} ${row.profiles.last_name}` : undefined,
    type: row.type,
    title: row.title,
    body: row.body,
    meetingAt: row.meeting_at,
    meetingPlace: row.meeting_place,
    createdAt: row.created_at,
    studentName: row.students ? `${row.students.first_name} ${row.students.last_name}` : undefined,
  };
}

export async function getNoticesForGuardian(guardianUserId: string): Promise<GuardianNotice[]> {
  const data = unwrap(
    await supabase
      .from('guardian_notices')
      .select('*, profiles!guardian_notices_from_user_id_fkey(first_name, last_name), students(first_name, last_name)')
      .order('created_at', { ascending: false })
  );
  const notices = data.map(mapNotice);

  // Merge con mis acuses de recibo
  const { data: receipts } = await supabase
    .from('guardian_notice_receipts')
    .select('*')
    .eq('guardian_user_id', guardianUserId);

  const byNotice = new Map((receipts ?? []).map((r: any) => [r.notice_id, r]));
  return notices.map(n => {
    const r = byNotice.get(n.id);
    return r ? { ...n, readAt: r.read_at, response: r.response } : n;
  });
}

export async function markNoticeRead(noticeId: string, guardianUserId: string): Promise<void> {
  await supabase.from('guardian_notice_receipts').upsert({
    notice_id: noticeId,
    guardian_user_id: guardianUserId,
    read_at: new Date().toISOString(),
  }, { onConflict: 'notice_id,guardian_user_id', ignoreDuplicates: false });
}

export async function respondToNotice(
  noticeId: string,
  guardianUserId: string,
  response: NoticeResponse,
): Promise<void> {
  const { error } = await supabase.from('guardian_notice_receipts').upsert({
    notice_id: noticeId,
    guardian_user_id: guardianUserId,
    read_at: new Date().toISOString(),
    response,
    responded_at: new Date().toISOString(),
  }, { onConflict: 'notice_id,guardian_user_id' });
  if (error) throw error;
}

// ── Staff: gestión ──

export async function createNotice(n: {
  schoolId: string;
  studentId?: string | null;
  fromUserId: string;
  type: NoticeType;
  title: string;
  body: string;
  meetingAt?: string | null;
  meetingPlace?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('guardian_notices').insert({
    school_id: n.schoolId,
    student_id: n.studentId ?? null,
    from_user_id: n.fromUserId,
    type: n.type,
    title: n.title.trim(),
    body: n.body.trim(),
    meeting_at: n.meetingAt ?? null,
    meeting_place: n.meetingPlace?.trim() || null,
  });
  if (error) throw error;
}

export async function getNoticesForStaff(): Promise<(GuardianNotice & { receipts: NoticeReceipt[] })[]> {
  const data = unwrap(
    await supabase
      .from('guardian_notices')
      .select('*, profiles!guardian_notices_from_user_id_fkey(first_name, last_name), students(first_name, last_name)')
      .order('created_at', { ascending: false })
  );
  const notices = data.map(mapNotice);
  if (notices.length === 0) return [];

  const { data: receipts } = await supabase
    .from('guardian_notice_receipts')
    .select('*, profiles(first_name, last_name)')
    .in('notice_id', notices.map(n => n.id));

  const grouped = new Map<string, NoticeReceipt[]>();
  (receipts ?? []).forEach((r: any) => {
    const arr = grouped.get(r.notice_id) ?? [];
    arr.push({
      guardianUserId: r.guardian_user_id,
      guardianName: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : undefined,
      readAt: r.read_at,
      response: r.response,
      respondedAt: r.responded_at,
    });
    grouped.set(r.notice_id, arr);
  });

  return notices.map(n => ({ ...n, receipts: grouped.get(n.id) ?? [] }));
}

export async function deleteNotice(id: string): Promise<void> {
  const { error } = await supabase.from('guardian_notices').delete().eq('id', id);
  if (error) throw error;
}

/** Familia vinculada a un estudiante (vista staff). */
export async function getGuardiansOfStudent(studentId: string): Promise<GuardianLink[]> {
  const data = unwrap(
    await supabase
      .from('student_guardians')
      .select('*, profiles(first_name, last_name, email)')
      .eq('student_id', studentId)
  );
  return data.map((r: any) => ({
    id: r.id,
    studentId: r.student_id,
    guardianUserId: r.guardian_user_id,
    relationship: r.relationship,
    guardianName: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : undefined,
    guardianEmail: r.profiles?.email,
  }));
}
