/**
 * ENSEÑIA SMT — Chat History Service
 *
 * CRUD for chat sessions and messages stored in Supabase.
 * Follows the same patterns as planning.service.ts.
 */

import { supabase, unwrap } from './_helpers';
import type { ChatSession, ChatMessage, IAUsage, IAToolType, IAModel } from '../types';

// ── Mappers (snake_case → camelCase) ──

function mapSession(row: Record<string, unknown>): ChatSession {
  return {
    id: row.id as string,
    teacherId: row.teacher_id as string,
    classId: (row.class_id as string) ?? null,
    subjectId: (row.subject_id as string) ?? null,
    courseId: (row.course_id as string) ?? null,
    title: row.title as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as ChatMessage['role'],
    content: row.content as string,
    toolUsed: (row.tool_used as IAToolType) ?? null,
    modelUsed: (row.model_used as IAModel) ?? null,
    tokenCount: (row.token_count as number) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapUsage(row: Record<string, unknown>): IAUsage {
  return {
    id: row.id as string,
    teacherId: row.teacher_id as string,
    usageDate: row.usage_date as string,
    messageCount: row.message_count as number,
    tokenCountIn: row.token_count_in as number,
    tokenCountOut: row.token_count_out as number,
  };
}

// ── Session Operations ──

/**
 * Get or create a chat session for a teacher + class combination.
 * If classId is null, creates a "free chat" session.
 * Handles duplicate key race conditions gracefully.
 */
export async function getOrCreateSession(
  teacherId: string,
  classId: string | null,
  context?: { subjectId?: string; courseId?: string; title?: string },
): Promise<ChatSession> {
  // Try to find existing session
  if (classId) {
    const { data: existing } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('class_id', classId)
      .maybeSingle();

    if (existing) return mapSession(existing);
  }

  // Create new session
  const { data: created, error } = await supabase
    .from('chat_sessions')
    .insert({
      teacher_id: teacherId,
      class_id: classId,
      subject_id: context?.subjectId ?? null,
      course_id: context?.courseId ?? null,
      title: context?.title ?? 'Chat libre',
    })
    .select('*')
    .single();

  // Handle duplicate key (race condition or session created between SELECT and INSERT)
  if (error && error.code === '23505' && classId) {
    const { data: retry } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('class_id', classId)
      .maybeSingle();

    if (retry) return mapSession(retry);
  }

  if (error || !created) {
    throw new Error(error?.message ?? 'Failed to create session');
  }

  return mapSession(created);
}

/**
 * Get all sessions for a teacher, ordered by last updated.
 */
export async function getSessionsByTeacher(teacherId: string): Promise<ChatSession[]> {
  const result = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false });

  return unwrap(result).map(mapSession);
}

// ── Message Operations ──

/**
 * Get all messages for a session, ordered chronologically.
 */
export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const result = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  return unwrap(result).map(mapMessage);
}

/**
 * Save a user message to the database.
 */
export async function saveUserMessage(
  sessionId: string,
  content: string,
  tool?: IAToolType,
): Promise<ChatMessage> {
  const result = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'user' as const,
      content,
      tool_used: tool ?? null,
    })
    .select('*')
    .single();

  return mapMessage(unwrap(result));
}

/**
 * Save an assistant message (called after streaming completes).
 */
export async function saveAssistantMessage(
  sessionId: string,
  content: string,
  tool?: IAToolType,
  model?: IAModel,
  tokenCount?: number,
): Promise<ChatMessage> {
  const result = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant' as const,
      content,
      tool_used: tool ?? null,
      model_used: model ?? null,
      token_count: tokenCount ?? null,
    })
    .select('*')
    .single();

  return mapMessage(unwrap(result));
}

// ── Usage Operations ──

/**
 * Get today's usage for a teacher. Returns null if no usage today.
 */
export async function getTodayUsage(teacherId: string): Promise<IAUsage | null> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('ia_usage')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('usage_date', today)
    .maybeSingle();

  return data ? mapUsage(data) : null;
}

// ── Session Management ──

/**
 * Clear all messages from a session (keeps the session itself).
 */
export async function clearSession(sessionId: string): Promise<void> {
  const result = await supabase
    .from('chat_messages')
    .delete()
    .eq('session_id', sessionId);

  if (result.error) throw result.error;
}
