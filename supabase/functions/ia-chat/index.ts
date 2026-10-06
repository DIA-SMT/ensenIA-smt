/**
 * SMT EstudIA — IA Chat Edge Function
 *
 * POST /functions/v1/ia-chat
 *
 * Recibe mensajes + contexto, llama a Claude VÍA OPENROUTER con streaming
 * (protocolo chat completions) y reenvía SSE al frontend. Maneja auth,
 * cuota diaria, persistencia y tracking de uso.
 *
 * Modelos:
 *   - Sonnet (anthropic/claude-sonnet-5): chat, actividad, evaluación, presentación, oral
 *   - Haiku (anthropic/claude-haiku-4.5): "resumir documento"
 *
 * Con un estudiante (la guía de estudio de MiGuia) además:
 *   - cada mensaje pasa por el clasificador de riesgo compartido con Migue
 *     (_shared/riesgo.ts) antes de responder;
 *   - el material lo resuelve el servidor desde library_materials con la RLS
 *     del estudiante: el texto que mande el cliente no entra al prompt.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildSystemPrompt, type PromptContext } from './_system-prompt.ts';
import { costoDe, registrarConsumo } from '../_shared/consumo.ts';
import {
  avisoDerivacion, evaluarRiesgo, MAX_CHARS_RIESGO, type Derivada,
} from '../_shared/riesgo.ts';

// ── Config ──
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_SONNET = 'anthropic/claude-sonnet-5';
const MODEL_HAIKU = 'anthropic/claude-haiku-4.5';
const DAILY_QUOTA = 50;
// Sonnet 5 razona por defecto y eso cuenta dentro de max_tokens:
// margen para razonamiento + respuesta larga (streaming, sin timeout).
const MAX_TOKENS = 12000;
const SUMMARY_INPUT_LIMIT = 8000; // chars

// ── Types ──
interface IAChatRequest {
  sessionId: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tool?: 'act' | 'eval' | 'sum' | 'pres' | 'oral' | 'guide' | 'simplify';
  context: {
    subjectName: string;
    courseName: string;
    unitTitle?: string;
    classTitle?: string;
    classObjectives?: string[];
    classContent?: string;
    difficulty?: number;
    educationLevel?: string;
    documentTitle?: string;
    /** Solo para docentes. A un estudiante se le ignora: va documentId. */
    documentText?: string;
    /** Material de library_materials que el estudiante quiere estudiar. */
    documentId?: string;
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

/**
 * Error como evento SSE. `derivada` viaja también acá: si la escuela ya fue
 * avisada y después se cae la IA, el chico igual tiene que enterarse.
 */
function sseError(
  code: string, message: string, status = 200, derivada: Derivada | null = null,
): Response {
  return new Response(sseEvent('error', { code, message, derivada }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' },
  });
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

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    return new Response(
      sseEvent('error', { code: 'CONFIG_ERROR', message: 'API key de IA no configurada.' }),
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
    return new Response(
      sseEvent('error', { code: 'CONFIG_ERROR', message: 'Configuración de Supabase incompleta.' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
    );
  }

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

  // ── 3. Perfil y ROL real del usuario ──
  // El rol se resuelve en el servidor: lo que mande el cliente no decide nada.
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, role, school_id')
    .eq('id', user.id)
    .single();

  // Sin perfil no se sabe el rol, y sin rol no se sabe qué reglas aplicar:
  // tratarlo como docente le daría el asistente completo a cualquiera.
  if (!profile) return sseError('AUTH_INVALID', 'No encontramos tu perfil.', 403);

  const teacherName = `${profile.first_name} ${profile.last_name}`;
  const isStudent = profile.role === 'estudiante';

  // ── 3a. La sesión tiene que ser suya ──
  // Las escrituras de abajo van con service role: sin este chequeo, con el
  // id de una sesión ajena se le metían mensajes en el historial a otro.
  const { data: sesion } = await supabase
    .from('chat_sessions')
    .select('teacher_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!sesion || sesion.teacher_id !== user.id) {
    return sseError('FORBIDDEN', 'Esa conversación no es tuya.', 403);
  }

  // ── 3b. Un estudiante solo puede usar los modos de estudio ──
  // Sin esto, bastaba con mandar tool:'act' para tener el asistente
  // completo del docente y pedirle la tarea resuelta.
  let effectiveTool = tool;
  let studentSubjects: string[] = [];
  let studentId: string | null = null;

  if (isStudent) {
    if (tool !== 'guide' && tool !== 'simplify') {
      effectiveTool = 'guide';
    }

    // De qué puede preguntar: sus materias reales, según su inscripción.
    const { data: studentRow } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    studentId = studentRow?.id ?? null;
    if (studentRow) {
      const { data: enrolled } = await supabase
        .from('enrollments')
        .select('subjects(name)')
        .eq('student_id', studentRow.id);
      studentSubjects = [...new Set(
        ((enrolled ?? []) as { subjects?: { name?: string } }[])
          .map((e) => e.subjects?.name)
          .filter((n): n is string => Boolean(n)),
      )];
    }
  }

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
  if (effectiveTool === 'sum') {
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

  // ── 5b. Estudiante: mensaje, material y alerta emocional ──
  let derivada: Derivada | null = null;
  let material: { title: string; subject_name: string | null; extracted_text: string | null } | null = null;

  if (isStudent) {
    const ultimo = messages[messages.length - 1];
    if (!ultimo || ultimo.role !== 'user' || typeof ultimo.content !== 'string') {
      return new Response('Last message must be from user', { status: 400, headers: corsHeaders() });
    }
    // Lo que pase de este largo no lo leería el clasificador de riesgo.
    if (ultimo.content.length > MAX_CHARS_RIESGO) {
      return sseError('INPUT_TOO_LONG',
        `El mensaje es muy largo (máximo ${MAX_CHARS_RIESGO} caracteres). Probá con un pedazo más corto.`);
    }

    // El material se busca con el JWT del estudiante: la RLS de la 003
    // decide si puede verlo (compartido y de una materia en la que está
    // inscripto). Lo que mande el cliente como texto no entra al prompt.
    if (context.documentId) {
      const asUser = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: mat, error: errMat } = await asUser
        .from('library_materials')
        .select('title, subject_name, extracted_text')
        .eq('id', context.documentId)
        .eq('is_shared_with_students', true)
        .maybeSingle();
      if (errMat) console.error('library_materials (guía):', JSON.stringify(errMat));
      if (!mat) {
        return sseError('MATERIAL_NOT_FOUND',
          'No encontramos ese material entre los que te compartieron. Elegilo de nuevo de la lista.');
      }
      material = mat;
    }

    // Se decide ANTES de responder, para que el aviso vaya en la misma
    // respuesta. derivada solo es no-null si la señal quedó guardada.
    if (studentId) {
      derivada = await evaluarRiesgo({
        admin: supabase, apiKey: OPENROUTER_API_KEY, texto: ultimo.content, origen: 'guia',
        studentId, schoolId: profile.school_id, userId: user.id, role: profile.role,
      });
    } else {
      // Sin fila en students no hay a quién asignarle una señal.
      console.error('ia-chat: estudiante sin fila en students, sin evaluación de riesgo', user.id);
    }
  }

  // ── 6. Build system prompt ──
  // Para un estudiante solo entra lo que resolvió el servidor.
  const promptCtx: PromptContext = isStudent
    ? {
      audience: 'estudiante',
      studentSubjects,
      teacherName,
      subjectName: material?.subject_name ?? '',
      courseName: '',
      tool: effectiveTool ?? undefined,
      documentTitle: material?.title,
      documentText: material?.extracted_text ?? undefined,
    }
    : {
      audience: 'docente',
      studentSubjects,
      teacherName,
      subjectName: context.subjectName,
      courseName: context.courseName,
      unitTitle: context.unitTitle,
      classTitle: context.classTitle,
      classObjectives: context.classObjectives,
      classContent: context.classContent,
      difficulty: context.difficulty,
      educationLevel: context.educationLevel,
      tool: effectiveTool ?? undefined,
      documentTitle: context.documentTitle,
      documentText: context.documentText,
    };
  const systemPrompt = buildSystemPrompt(promptCtx) + avisoDerivacion(derivada) + (derivada
    ? '\nEn esta respuesta lo primero es él: el repaso queda para después, si quiere.'
    : '');

  // ── 7. Determine model ──
  // Resúmenes y simplificación de lenguaje van al modelo rápido.
  const useFastModel = effectiveTool === 'sum' || effectiveTool === 'simplify';
  const modelId = useFastModel ? MODEL_HAIKU : MODEL_SONNET;
  const modelLabel = useFastModel ? 'haiku' : 'sonnet';

  // ── 8. Call OpenRouter (Claude) with streaming ──
  const orBody = {
    model: modelId,
    max_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
    // Que el último chunk traiga también el costo (Consumo de IA)
    usage: { include: true },
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  let orResponse: Response;
  try {
    orResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://ensenia-aula.vercel.app',
        'X-Title': 'SMT EstudIA',
      },
      body: JSON.stringify(orBody),
    });
  } catch (_err) {
    return sseError('API_ERROR', 'No se pudo conectar con el servicio de IA.', 200, derivada);
  }

  if (!orResponse.ok) {
    const errText = await orResponse.text();
    console.error('OpenRouter error:', orResponse.status, errText.substring(0, 500));
    const friendly = orResponse.status === 429
      ? 'El servicio de IA está sobrecargado. Intentá de nuevo en unos segundos.'
      : orResponse.status === 402
        ? 'La cuenta de IA se quedó sin crédito. Avisale al administrador.'
        : 'Error del servicio de IA. Intentá de nuevo.';
    return sseError('API_ERROR', friendly, 200, derivada);
  }

  // ── 9. Stream response (SSE estilo OpenAI: choices[0].delta.content) ──
  const reader = orResponse.body!.getReader();
  const decoder = new TextDecoder();

  let fullContent = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = null;

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

            const delta = event.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              fullContent += delta;
              controller.enqueue(
                encoder.encode(sseEvent('token', { text: delta })),
              );
            }

            // Chunk final con usage (stream_options.include_usage)
            if (event.usage) {
              tokensIn = event.usage.prompt_tokens || 0;
              tokensOut = event.usage.completion_tokens || 0;
              costUsd = costoDe(event.usage);
            }
          }
        }

        // ── 10. Persist message & update usage ──
        // Save assistant message
        const { data: savedMsg, error: errMsg } = await supabase.from('chat_messages').insert({
          session_id: sessionId,
          role: 'assistant',
          content: fullContent,
          tool_used: effectiveTool ?? 'free',
          model_used: modelLabel,
          token_count: tokensOut,
        }).select('id').single();
        if (errMsg) console.error('chat_messages insert:', JSON.stringify(errMsg));

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

        await registrarConsumo(supabase, {
          user_id: user.id, school_id: profile.school_id, role: profile.role,
          feature: 'chat', detail: effectiveTool ?? 'free', model: modelId,
          tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: costUsd,
        });

        // Send done event
        controller.enqueue(
          encoder.encode(
            sseEvent('done', {
              messageId: savedMsg?.id ?? '',
              model: modelLabel,
              tokensIn,
              tokensOut,
              // Para que la interfaz muestre, aparte del texto de la IA,
              // que esto se compartió con la escuela.
              derivada,
            }),
          ),
        );
      } catch (err) {
        console.error('Stream processing error:', err);
        controller.enqueue(
          encoder.encode(
            sseEvent('error', { code: 'STREAM_ERROR', message: 'Error durante la generación.', derivada }),
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
