/**
 * SMT EstudIA — Migue Edge Function
 *
 * POST /functions/v1/migue
 *
 * Una función, tres caras. La audiencia NO la manda el cliente: se deriva
 * del rol que tiene el usuario en la base. Si viniera del cliente,
 * cualquiera podría pedir la cara "equipo" y hacerse recitar protocolos
 * internos.
 *
 * La búsqueda de normativa corre con el JWT del usuario, no con el service
 * role: así la RLS de la 015 decide qué normas entran al prompt. Es la
 * diferencia entre filtrar y solo pedirle a la IA que no cuente.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildSystemPrompt, type MigueAudience, type PolicyHit } from './_prompts.ts';
import { costoDe, registrarConsumo } from '../_shared/consumo.ts';
import { avisoDerivacion, evaluarRiesgo, MAX_CHARS_RIESGO, type Derivada } from '../_shared/riesgo.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_CHAT = 'anthropic/claude-sonnet-5';
const DAILY_QUOTA = 60;
const MAX_TOKENS = 4000;
// Nunca más que lo que lee el clasificador de riesgo.
const MAX_MSG_CHARS = Math.min(4000, MAX_CHARS_RIESGO);
const HISTORY_LIMIT = 20;

interface MigueRequest {
  sessionId: string;
  /** Solo se usa el último, y tiene que ser del usuario. El historial lo
   *  arma el servidor desde migue_messages: si lo mandara el cliente,
   *  cualquiera podría inventar lo que Migue supuestamente respondió. */
  messages: { role: 'user' | 'assistant'; content: string }[];
}

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

function sseError(
  code: string, message: string, status = 200,
  derivada: Derivada | null = null,
): Response {
  return new Response(sseEvent('error', { code, message, derivada }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' },
  });
}

function audienceForRole(role: string): MigueAudience | null {
  if (role === 'docente' || role === 'director') return 'equipo';
  if (role === 'estudiante') return 'estudiante';
  if (role === 'padre') return 'familia';
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  }

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!OPENROUTER_API_KEY || !supabaseUrl || !serviceKey || !anonKey) {
    return sseError('CONFIG_ERROR', 'Migue no está configurado. Avisale al administrador.', 500);
  }

  let body: MigueRequest;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders() });
  }
  const { sessionId, messages } = body;
  if (!sessionId || !messages?.length) {
    return new Response('Missing required fields', { status: 400, headers: corsHeaders() });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
  const token = authHeader.replace('Bearer ', '');

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) {
    return sseError('AUTH_INVALID', 'Sesión expirada. Volvé a iniciar sesión.', 401);
  }

  // Cliente con el JWT del usuario: la búsqueda de normativa pasa por su RLS.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // ── Rol y audiencia: de la base, nunca del cliente ──
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile) return sseError('AUTH_INVALID', 'No encontramos tu perfil.', 403);

  const audience = audienceForRole(profile.role);
  if (!audience) return sseError('FORBIDDEN', 'Tu rol no tiene acceso a Migue.', 403);

  const nombre = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Hola';

  const { data: school } = await admin
    .from('schools').select('name').eq('id', profile.school_id).single();
  const escuela = school?.name ?? 'la escuela';

  // ── La sesión tiene que ser suya y de esta audiencia ──
  const { data: sesion } = await admin
    .from('migue_sessions')
    .select('id, user_id, audience')
    .eq('id', sessionId)
    .maybeSingle();
  if (!sesion || sesion.user_id !== user.id) {
    return sseError('FORBIDDEN', 'Esa conversación no es tuya.', 403);
  }
  if (sesion.audience !== audience) {
    return sseError('FORBIDDEN', 'Esa conversación no corresponde a tu rol.', 403);
  }

  // ── Cuota diaria ──
  const hoy = new Date().toISOString().split('T')[0];
  const { data: usage } = await admin
    .from('ia_usage')
    .select('message_count, token_count_in, token_count_out')
    .eq('teacher_id', user.id)
    .eq('usage_date', hoy)
    .maybeSingle();

  // A un estudiante el tope le llega mucho más tarde: si le cortamos Migue
  // antes, lo que cuente ya no pasa por la alerta emocional.
  const tope = audience === 'estudiante' ? DAILY_QUOTA * 4 : DAILY_QUOTA;
  if (usage && usage.message_count >= tope) {
    return sseError('QUOTA_EXCEEDED',
      `Llegaste al límite de ${DAILY_QUOTA} mensajes por hoy. Seguimos mañana.`);
  }

  const ultimo = messages[messages.length - 1];
  if (!ultimo || ultimo.role !== 'user') {
    return new Response('Last message must be from user', { status: 400, headers: corsHeaders() });
  }
  if (ultimo.content.length > MAX_MSG_CHARS) {
    return sseError('INPUT_TOO_LONG',
      `El mensaje es muy largo (máximo ${MAX_MSG_CHARS} caracteres).`);
  }

  // ── Normativa: con la RLS del usuario ──
  let policyHits: PolicyHit[] = [];
  try {
    const { data } = await asUser.rpc('search_school_policies', {
      q: ultimo.content, max_results: 4,
    });
    policyHits = (data ?? []) as PolicyHit[];
  } catch (_e) {
    policyHits = [];
  }

  // ── Contexto extra por audiencia ──
  let cursoNombre: string | undefined;
  let hijosNombres: string[] | undefined;
  let studentId: string | null = null;

  if (audience === 'estudiante') {
    const { data: st } = await admin
      .from('students')
      .select('id, course_id, courses(name)')
      .eq('user_id', user.id)
      .maybeSingle();
    studentId = st?.id ?? null;
    cursoNombre = (st as any)?.courses?.name ?? undefined;
  }
  if (audience === 'familia') {
    const { data: hijos } = await admin
      .from('student_guardians')
      .select('students(first_name)')
      .eq('guardian_user_id', user.id);
    hijosNombres = (hijos ?? [])
      .map((h: any) => h.students?.first_name)
      .filter(Boolean);
  }

  const systemPrompt = buildSystemPrompt({
    audience, nombre, escuela, policyHits, cursoNombre, hijosNombres,
    puedeDerivar: audience !== 'estudiante' || Boolean(studentId),
  });

  if (audience === 'estudiante' && !studentId) {
    console.error('Migue: estudiante sin fila en students', user.id);
  }

  // ── Alerta emocional ──
  // Se decide ANTES de responder para poder avisarle al chico en la misma
  // respuesta. Y solo se le dice que la escuela se enteró si el registro
  // se guardó de verdad: prometerlo sin haberlo hecho sería lo peor.
  const derivada = audience === 'estudiante' && studentId
    ? await evaluarRiesgo({
      admin, apiKey: OPENROUTER_API_KEY, texto: ultimo.content, origen: 'migue',
      studentId, schoolId: profile.school_id, userId: user.id, role: profile.role,
    })
    : null;

  // El historial sale de la base, no del cliente: así nadie puede
  // fabricar turnos de Migue que no existieron (por ejemplo, uno donde
  // "prometió" no avisarle a la escuela).
  const { data: guardados } = await admin
    .from('migue_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  const historial = (guardados ?? [])
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const orBody = {
    model: MODEL_CHAT,
    max_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
    // Que el último chunk traiga también el costo (Consumo de IA)
    usage: { include: true },
    messages: [
      { role: 'system', content: systemPrompt + avisoDerivacion(derivada) },
      ...historial,
      { role: 'user', content: ultimo.content },
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
    // La señal ya se guardó: el error tiene que llevarla igual, o el chico
    // se queda sin enterarse de algo que la escuela sí sabe.
    return sseError('API_ERROR', 'No se pudo conectar con Migue. Probá de nuevo.', 200, derivada);
  }

  if (!orResponse.ok) {
    const errText = await orResponse.text();
    console.error('OpenRouter error:', orResponse.status, errText.substring(0, 500));
    const friendly = orResponse.status === 429
      ? 'Migue está sobrecargado. Probá de nuevo en unos segundos.'
      : orResponse.status === 402
        ? 'La cuenta de IA se quedó sin crédito. Avisale al administrador.'
        : 'Error del servicio de IA. Probá de nuevo.';
    return sseError('API_ERROR', friendly, 200, derivada);
  }

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
            let ev;
            try { ev = JSON.parse(dataStr); } catch { continue; }

            const delta = ev?.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              controller.enqueue(encoder.encode(sseEvent('token', { text: delta })));
            }
            if (ev?.usage) {
              tokensIn = ev.usage.prompt_tokens ?? 0;
              tokensOut = ev.usage.completion_tokens ?? 0;
              costUsd = costoDe(ev.usage);
            }
          }
        }

        // ── Persistencia: el par pregunta/respuesta y las normas citadas ──
        // Los errores se miran: un fallo silencioso acá le borra el
        // historial al usuario sin que nadie se entere.
        const citadas = policyHits.map((h) => h.id);
        const { error: errMsgs } = await admin.from('migue_messages').insert([
          // cited_policy_ids va explícito: en un insert múltiple PostgREST
          // alinea las columnas y manda NULL donde falta la clave, sin
          // llegar a usar el DEFAULT de la tabla.
          { session_id: sessionId, role: 'user', content: ultimo.content, cited_policy_ids: [] },
          {
            session_id: sessionId, role: 'assistant', content: fullContent,
            cited_policy_ids: citadas,
          },
        ]);
        if (errMsgs) console.error('migue_messages insert:', JSON.stringify(errMsgs));

        const { error: errSes } = await admin.from('migue_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId);
        if (errSes) console.error('migue_sessions update:', JSON.stringify(errSes));

        await admin.from('ia_usage').upsert({
          teacher_id: user.id,
          usage_date: hoy,
          message_count: (usage?.message_count ?? 0) + 1,
          token_count_in: (usage?.token_count_in ?? 0) + tokensIn,
          token_count_out: (usage?.token_count_out ?? 0) + tokensOut,
        }, { onConflict: 'teacher_id,usage_date' });

        await registrarConsumo(admin, {
          user_id: user.id, school_id: profile.school_id, role: profile.role,
          feature: 'migue', detail: audience, model: MODEL_CHAT,
          tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: costUsd,
        });

        controller.enqueue(encoder.encode(sseEvent('done', {
          model: 'sonnet',
          tokensIn,
          tokensOut,
          persistido: !errMsgs,
          errorPersistencia: errMsgs ? String(errMsgs.message ?? errMsgs) : null,
          citedPolicies: policyHits.map((h) => ({ id: h.id, title: h.title })),
          // El cliente lo usa para mostrarle al chico, en la interfaz y no
          // solo dentro del texto de la IA, que esto se compartió.
          derivada,
        })));
      } catch (err) {
        console.error('stream error', err);
        controller.enqueue(encoder.encode(sseEvent('error', {
          code: 'STREAM_ERROR', message: 'Se cortó la respuesta. Probá de nuevo.',
        })));
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
