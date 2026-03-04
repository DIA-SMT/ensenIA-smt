/**
 * ENSEÑIA SMT — IA Chat Streaming Service
 *
 * Handles SSE communication with the ia-chat Edge Function.
 * Uses raw fetch + ReadableStream to parse server-sent events.
 */

import { supabase } from './_helpers';
import type { IAToolType, IAModel, IAChatContext } from '../types';

// ── Types ──

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onDone: (metadata: { messageId: string; model: string; tokensIn: number; tokensOut: number }) => void;
  onError: (error: { code: string; message: string }) => void;
}

interface StreamOptions {
  sessionId: string;
  tool?: IAToolType;
  model?: IAModel;
}

// ── Main streaming function ──

/**
 * Send messages to the IA Edge Function and stream the response.
 *
 * @param messages  - Conversation history (user + assistant messages)
 * @param context   - Teacher's current context (subject, course, class, etc.)
 * @param options   - Session ID, tool selection, model preference
 * @param callbacks - onToken, onDone, onError handlers
 * @param signal    - AbortSignal for cancellation
 */
export async function streamChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
  context: IAChatContext,
  options: StreamOptions,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  // Get auth token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    callbacks.onError({ code: 'AUTH_INVALID', message: 'No hay sesión activa.' });
    return;
  }

  const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ia-chat`;

  let response: Response;
  try {
    response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        sessionId: options.sessionId,
        messages,
        tool: options.tool !== 'free' ? options.tool : undefined,
        context,
      }),
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return; // User cancelled, don't call onError
    }
    callbacks.onError({
      code: 'NETWORK_ERROR',
      message: 'No se pudo conectar con el servidor. Verificá tu conexión.',
    });
    return;
  }

  if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
    callbacks.onError({
      code: 'SERVER_ERROR',
      message: `Error del servidor (${response.status}).`,
    });
    return;
  }

  if (!response.body) {
    callbacks.onError({ code: 'STREAM_ERROR', message: 'La respuesta del servidor no tiene contenido.' });
    return;
  }

  // ── Parse SSE stream ──
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ') && currentEvent) {
          try {
            const data = JSON.parse(line.slice(6));

            switch (currentEvent) {
              case 'token':
                callbacks.onToken(data.text);
                break;
              case 'done':
                callbacks.onDone(data);
                break;
              case 'error':
                callbacks.onError(data);
                break;
            }
          } catch {
            // Skip malformed JSON lines
          }
          currentEvent = '';
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return; // User cancelled
    }
    callbacks.onError({
      code: 'STREAM_ERROR',
      message: 'Se interrumpió la conexión durante la generación.',
    });
  }
}
