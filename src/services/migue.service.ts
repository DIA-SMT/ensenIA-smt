/**
 * ENSEÑIA SMT — Migue (017)
 *
 * La audiencia no se manda: la deriva el servidor del rol del usuario.
 * Acá solo se calcula para elegir qué mostrar en pantalla.
 */

import { supabase, unwrap } from './_helpers';
import type { MigueAudience, MigueMessage, MigueSession, UserRole } from '../types';

export function audienceForRole(role: UserRole): MigueAudience | null {
  if (role === 'docente' || role === 'director') return 'equipo';
  if (role === 'estudiante') return 'estudiante';
  if (role === 'padre') return 'familia';
  return null;
}

function mapSession(row: any): MigueSession {
  return {
    id: row.id,
    userId: row.user_id,
    schoolId: row.school_id,
    audience: row.audience,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: any): MigueMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    citedPolicyIds: row.cited_policy_ids ?? [],
    createdAt: row.created_at,
  };
}

/**
 * La conversación abierta del usuario, o una nueva.
 * No manda user_id ni school_id: los pone el servidor (018), que es
 * justamente el dato que no hay que creerle al cliente.
 */
export async function getOrCreateSession(audience: MigueAudience): Promise<MigueSession> {
  const { data: existing, error } = await supabase
    .from('migue_sessions')
    .select('*')
    .eq('audience', audience)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (existing && existing.length > 0) return mapSession(existing[0]);

  const { data, error: err2 } = await supabase
    .from('migue_sessions')
    .insert({ audience })
    .select('*')
    .single();
  if (err2) throw err2;
  return mapSession(data);
}

export async function getMessages(sessionId: string): Promise<MigueMessage[]> {
  const data = unwrap(
    await supabase
      .from('migue_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at')
  );
  return data.map(mapMessage);
}

/** Empezar de cero: borra la conversación, no el historial de señales. */
export async function resetSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('migue_messages').delete().eq('session_id', sessionId);
  if (error) throw error;
}

export interface MigueCallbacks {
  onToken: (text: string) => void;
  onDone: (meta: {
    citedPolicies: { id: string; title: string }[];
    derivada: 'seguimiento' | 'urgente' | null;
  }) => void;
  onError: (e: { code: string; message: string }) => void;
}

export async function streamMigue(
  sessionId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  cb: MigueCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    cb.onError({ code: 'AUTH_INVALID', message: 'No hay sesión activa.' });
    return;
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migue`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ sessionId, messages }),
      signal,
    });
  } catch (err) {
    if ((err as any)?.name === 'AbortError') return;
    cb.onError({ code: 'NETWORK', message: 'No se pudo conectar con Migue.' });
    return;
  }

  if (!res.ok && !res.headers.get('Content-Type')?.includes('text/event-stream')) {
    cb.onError({ code: 'HTTP_' + res.status, message: 'Migue no respondió. Probá de nuevo.' });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    cb.onError({ code: 'NO_BODY', message: 'Migue no respondió. Probá de nuevo.' });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let evento = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lineas = buffer.split('\n');
      buffer = lineas.pop() ?? '';

      for (const l of lineas) {
        if (l.startsWith('event: ')) { evento = l.slice(7).trim(); continue; }
        if (!l.startsWith('data: ')) continue;
        let payload: any;
        try { payload = JSON.parse(l.slice(6)); } catch { continue; }

        if (evento === 'token') cb.onToken(payload.text ?? '');
        else if (evento === 'done') {
          cb.onDone({
            citedPolicies: payload.citedPolicies ?? [],
            derivada: payload.derivada ?? null,
          });
        } else if (evento === 'error') {
          cb.onError({ code: payload.code ?? 'ERROR', message: payload.message ?? 'Error.' });
        }
      }
    }
  } catch (err) {
    if ((err as any)?.name !== 'AbortError') {
      console.error(err);
      cb.onError({ code: 'STREAM', message: 'Se cortó la respuesta de Migue.' });
    }
  }
}
