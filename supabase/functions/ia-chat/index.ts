/**
 * ENSEÑIA SMT — IA Chat Edge Function
 *
 * POST /functions/v1/ia-chat
 *
 * Receives chat messages + context, calls Claude API with streaming,
 * and returns SSE events to the frontend. Handles auth, quota checking,
 * message persistence, and usage tracking.
 *
 * Models:
 *   - Sonnet: chat libre, actividad, evaluación, presentación, oral
 *   - Haiku: solo "resumir documento" (input limitado a 8000 chars)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildSystemPrompt, type PromptContext } from './_system-prompt.ts';

// ── Config ──
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL_SONNET = 'claude-sonnet-4-20250514';
const MODEL_HAIKU = 'claude-haiku-4-20250414';
const DAILY_QUOTA = 50;
const MAX_TOKENS = 4096;
const SUMMARY_INPUT_LIMIT = 8000; // chars

// ── Types ──
interface IAChatRequest {
  sessionId: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tool?: 'act' | 'eval' | 'sum' | 'pres' | 'oral';
  context: {
    subjectName: string;
    courseName: string;
    unitTitle?: string;
    classTitle?: string;
    classObjectives?: string[];
    classContent?: string;
    difficulty?: number;
    educationLevel?: string;
  };
}

// ── Helpers ──
function sseEvent(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// ── Main Handler ──
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  }

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    return new Response(
      sseEvent('error', { code: 'CONFIG_ERROR', message: 'API key no configurada.' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
    );
  }

  // ── 1. Parse request ──
  let body: IAChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders() });
  }

  const { sessionId, messages, tool, context } = body;

  if (!sessionId || !messages?.length || !context) {
    return new Response('Missing required fields', { status: 400, headers: corsHeaders() });
  }

  // ── 2. Auth ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify the user's JWT
  const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      sseEvent('error', { code: 'AUTH_INVALID', message: 'Sesión expirada. Volvé a iniciar sesión.' }),
      { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
    );
  }

  // Use service role client for DB operations (bypasses RLS for ia_usage writes)
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ── 3. Get teacher profile ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single();

  const teacherName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : 'Docente';

  // ── 4. Check daily quota ──
  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabase
    .from('ia_usage')
    .select('message_count, token_count_in, token_count_out')
    .eq('teacher_id', user.id)
    .eq('usage_date', today)
    .maybeSingle();

  if (usage && usage.message_count >= DAILY_QUOTA) {
    return new Response(
      sseEvent('error', {
        code: 'QUOTA_EXCEEDED',
        message: `Alcanzaste el límite de ${DAILY_QUOTA} mensajes por hoy. ¡Volvé mañana! 💪`,
      }),
      { headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
    );
  }

  // ── 5. Validate summary input length ──
  if (tool === 'sum') {
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.content.length > SUMMARY_INPUT_LIMIT) {
      return new Response(
        sseEvent('error', {
          code: 'INPUT_TOO_LONG',
          message: `El texto para resumir es demasiado largo (máx. ${SUMMARY_INPUT_LIMIT} caracteres). Intentá con un fragmento más corto.`,
        }),
        { headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
      );
    }
  }

  // ── 6. Build system prompt ──
  const promptCtx: PromptContext = {
    teacherName,
    subjectName: context.subjectName,
    courseName: context.courseName,
    unitTitle: context.unitTitle,
    classTitle: context.classTitle,
    classObjectives: context.classObjectives,
    classContent: context.classContent,
    difficulty: context.difficulty,
    educationLevel: context.educationLevel,
    tool: tool ?? undefined,
  };
  const systemPrompt = buildSystemPrompt(promptCtx);

  // ── 7. Determine model ──
  const modelId = tool === 'sum' ? MODEL_HAIKU : MODEL_SONNET;
  const modelLabel = tool === 'sum' ? 'haiku' : 'sonnet';

  // ── 8. Call Anthropic API with streaming ──
  const anthropicBody = {
    model: modelId,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (err) {
    return new Response(
      sseEvent('error', { code: 'API_ERROR', message: 'No se pudo conectar con el servicio de IA.' }),
      { headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
    );
  }

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text();
    console.error('Anthropic error:', anthropicResponse.status, errText);
    return new Response(
      sseEvent('error', {
        code: 'API_ERROR',
        message: anthropicResponse.status === 429
          ? 'El servicio de IA está sobrecargado. Intentá de nuevo en unos segundos.'
          : 'Error del servicio de IA. Intentá de nuevo.',
      }),
      { headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
    );
  }

  // ── 9. Stream response ──
  const reader = anthropicResponse.body!.getReader();
  const decoder = new TextDecoder();

  let fullContent = '';
  let tokensIn = 0;
  let tokensOut = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;

            let event;
            try {
              event = JSON.parse(dataStr);
            } catch {
              continue;
            }

            // Content delta — stream text to client
            if (event.type === 'content_block_delta' && event.delta?.text) {
              fullContent += event.delta.text;
              controller.enqueue(
                encoder.encode(sseEvent('token', { text: event.delta.text })),
              );
            }

            // Message start — capture input token count
            if (event.type === 'message_start' && event.message?.usage) {
              tokensIn = event.message.usage.input_tokens || 0;
            }

            // Message delta — capture output token count
            if (event.type === 'message_delta' && event.usage) {
              tokensOut = event.usage.output_tokens || 0;
            }
          }
        }

        // ── 10. Persist message & update usage ──
        // Save assistant message
        const { data: savedMsg } = await supabase.from('chat_messages').insert({
          session_id: sessionId,
          role: 'assistant',
          content: fullContent,
          tool_used: tool ?? 'free',
          model_used: modelLabel,
          token_count: tokensOut,
        }).select('id').single();

        // Update session timestamp
        await supabase
          .from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId);

        // Upsert daily usage (accumulate tokens, not overwrite)
        const { error: upsertErr } = await supabase
          .from('ia_usage')
          .upsert(
            {
              teacher_id: user.id,
              usage_date: today,
              message_count: (usage?.message_count ?? 0) + 1,
              token_count_in: (usage?.token_count_in ?? 0) + tokensIn,
              token_count_out: (usage?.token_count_out ?? 0) + tokensOut,
            },
            { onConflict: 'teacher_id,usage_date' },
          );

        if (upsertErr) {
          console.error('Usage upsert error:', upsertErr);
        }

        // Send done event
        controller.enqueue(
          encoder.encode(
            sseEvent('done', {
              messageId: savedMsg?.id ?? '',
              model: modelLabel,
              tokensIn,
              tokensOut,
            }),
          ),
        );
      } catch (err) {
        console.error('Stream processing error:', err);
        controller.enqueue(
          encoder.encode(
            sseEvent('error', { code: 'STREAM_ERROR', message: 'Error durante la generación.' }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
