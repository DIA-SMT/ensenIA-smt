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
 *
 * Al proveedor de IA no le llegan nombres del padrón de la escuela ni datos
 * de contacto (_datos-personales.ts): se tapan al mandar y los nombres
 * vuelven en la respuesta. Al estudiante y a la familia, además, el prompt
 * no los nombra ni dice la escuela.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildSystemPromptPartes, RIESGO_SYSTEM,
  type MigueAudience, type PolicyHit, type RefHit,
} from './_prompts.ts';
import { padronDeEscuela, proveedorPrivado, Seudonimos, taparContacto } from './_datos-personales.ts';
import { pantallaActual } from './_guia.ts';
import { leerPedido, resolverContexto, seccionContexto, type ContextoResuelto } from './_contexto.ts';
import { accionesDe, GUIA_ACCIONES, sinMarcas } from './_acciones.ts';
import { memoriaDocenteDesde, memoriaDocenteParaPrompt } from '../ia-chat/_memoria-docente.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_CHAT = 'anthropic/claude-sonnet-5';
const MODEL_CLASIF = 'anthropic/claude-haiku-4.5';
const DAILY_QUOTA = 60;
const MAX_TOKENS = 4000;
const MAX_MSG_CHARS = 4000;
const HISTORY_LIMIT = 20;
const REASON_SIN_CLASIFICAR =
  'Migue no pudo evaluar el mensaje (falló el clasificador). Conviene mirarlo a mano.';

interface MigueRequest {
  sessionId: string;
  /** Solo se usa el último, y tiene que ser del usuario. El historial lo
   *  arma el servidor desde migue_messages: si lo mandara el cliente,
   *  cualquiera podría inventar lo que Migue supuestamente respondió. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Ruta desde la que se abrió el globito. Solo vale si está en la lista
   *  de _guia.ts, que es la que pone el nombre de la pantalla. */
  pantalla?: unknown;
  /** Lo que el docente está mirando: solo { tipo, id }. Se lee con su RLS
   *  (_contexto.ts); si no es suyo, no llega nada. */
  contexto?: unknown;
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
  derivada: 'seguimiento' | 'urgente' | null = null,
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

interface Clasificacion {
  nivel: 'ninguno' | 'seguimiento' | 'urgente';
  motivo: string;
  frase: string | null;
}

/**
 * Una pasada del clasificador. Devuelve null SOLO si falló — "sin riesgo"
 * es un resultado, no un null. La diferencia importa: en un sistema que
 * protege a un chico, confundir "no pasa nada" con "no pude mirar" es el
 * peor modo de falla posible.
 */
async function pasadaClasificador(
  apiKey: string, modelo: string, texto: string,
  anotar?: (modelo: string, usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined) => void,
): Promise<Clasificacion | null> {
  try {
    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Title': 'SMT EstudIA',
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 300,
        // Sin razonamiento: en Sonnet 5 (el respaldo) viene prendido y se
        // comía los 300 tokens antes de llegar al JSON
        reasoning: { enabled: false },
        provider: proveedorPrivado(),
        usage: { include: true },
        messages: [
          { role: 'system', content: RIESGO_SYSTEM },
          // El texto del chico va delimitado y el prompt dice que es dato.
          // Entero: el mensaje ya viene limitado a 4000 caracteres, y con un
          // recorte lo que escribía al final (lo más grave, a veces) no se leía.
          {
            role: 'user',
            content: `<mensaje_del_estudiante>\n${texto.slice(0, 6000)}\n</mensaje_del_estudiante>`,
          },
        ],
      }),
      // Si el proveedor se cuelga, que caiga en "no pude evaluar" y deje la señal
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      console.error('clasificador HTTP', modelo, r.status, (await r.text()).slice(0, 300));
      return null;
    }
    const j = await r.json();
    anotar?.(modelo, j?.usage);
    const raw: string = j?.choices?.[0]?.message?.content ?? '';
    // Objetos planos, sin anidar: se toma el ÚLTIMO, que es la respuesta
    // del modelo. Un regex greedy podía abarcar desde una llave escrita
    // por el estudiante hasta el final.
    const candidatos = raw.match(/\{[^{}]*\}/g);
    if (!candidatos || candidatos.length === 0) {
      console.error('clasificador sin JSON', modelo, raw.slice(0, 200));
      return null;
    }
    const parsed = JSON.parse(candidatos[candidatos.length - 1]);
    if (!['ninguno', 'seguimiento', 'urgente'].includes(parsed?.nivel)) {
      console.error('clasificador nivel inválido', modelo, String(parsed?.nivel).slice(0, 60));
      return null;
    }
    return {
      nivel: parsed.nivel,
      motivo: String(parsed.motivo ?? '').slice(0, 400) || 'Sin motivo especificado.',
      frase: parsed.frase ? String(parsed.frase).slice(0, 400) : null,
    };
  } catch (e) {
    console.error('clasificador excepción', modelo, String(e).slice(0, 300));
    return null;
  }
}

/**
 * Clasifica con un modelo y, si ese falla, reintenta con el otro. Que
 * fallen los dos a la vez es mucho menos probable que uno solo, y el del
 * chat ya demostró estar respondiendo.
 *
 * Si igual fallan los dos, NO devuelve "ninguno": devuelve 'error', y el
 * llamador deja una señal para que alguien de la escuela lo mire a mano.
 */
async function clasificarRiesgo(
  apiKey: string, texto: string,
  anotar?: Parameters<typeof pasadaClasificador>[3],
): Promise<Clasificacion | 'error'> {
  const primera = await pasadaClasificador(apiKey, MODEL_CLASIF, texto, anotar);
  if (primera) return primera;
  const segunda = await pasadaClasificador(apiKey, MODEL_CHAT, texto, anotar);
  if (segunda) return segunda;
  console.error('clasificador: fallaron los dos modelos');
  return 'error';
}

/**
 * Anota la llamada para la pantalla "Consumo de IA" del superadmin
 * (tabla ia_events, migración 040). Si falla no frena nada: es
 * contabilidad, no la respuesta.
 */
async function registrarConsumo(
  db: SupabaseClient,
  ev: {
    user_id: string; school_id?: string | null; role?: string | null;
    feature: string; detail?: string | null; model?: string | null;
    tokens_in?: number; tokens_out?: number; cost_usd?: number | null; tts_chars?: number;
  },
): Promise<void> {
  try {
    const { error } = await db.from('ia_events').insert(ev);
    if (error) console.error('ia_events insert:', error.message);
  } catch (e) {
    console.error('ia_events insert:', String(e));
  }
}

/** Lo que cobró OpenRouter por la llamada (viene si se pide usage: { include: true }). */
function costoDe(usage: unknown): number | null {
  const c = (usage as { cost?: unknown } | null | undefined)?.cost;
  return typeof c === 'number' && Number.isFinite(c) ? c : null;
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
    .from('schools').select('name, short_name, address, district').eq('id', profile.school_id).single();
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

  // ── Cuota diaria ── (076: su propio contador; el de los botones con IA es otro)
  const hoy = new Date().toISOString().split('T')[0];
  let usage: { migue_mensajes: number; token_count_in: number; token_count_out: number } | null = null;
  // Sin la 076 (la columna no existe todavía) se usa el contador de antes:
  // nunca sin tope por no haber podido leerlo
  let sinColumnaPropia = false;
  {
    const { data, error } = await admin
      .from('ia_usage')
      .select('migue_mensajes, token_count_in, token_count_out')
      .eq('teacher_id', user.id)
      .eq('usage_date', hoy)
      .maybeSingle();
    if (!error) {
      usage = data;
    } else {
      console.error('ia_usage (migue_mensajes):', error.message);
      sinColumnaPropia = true;
      const viejo = await admin
        .from('ia_usage')
        .select('message_count, token_count_in, token_count_out')
        .eq('teacher_id', user.id)
        .eq('usage_date', hoy)
        .maybeSingle();
      if (viejo.error) return sseError('API_ERROR', 'No se pudo revisar tu cupo de hoy. Probá de nuevo en un rato.');
      usage = viejo.data ? { ...viejo.data, migue_mensajes: viejo.data.message_count } : null;
    }
  }

  // A un estudiante el tope le llega mucho más tarde: si le cortamos Migue
  // antes, lo que cuente ya no pasa por la alerta emocional.
  const tope = audience === 'estudiante' ? DAILY_QUOTA * 4 : DAILY_QUOTA;
  if (usage && usage.migue_mensajes >= tope) {
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

  // ── Lo que el docente está mirando (UX docente): con SU permiso ──
  let ctx: ContextoResuelto | null = null;
  if (profile.role === 'docente') {
    const pedido = leerPedido(body.contexto);
    if (pedido) ctx = await resolverContexto(asUser, pedido);
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

  // ── Biblioteca de referencia municipal (047), también con la RLS del
  // usuario: a un estudiante o una familia solo le llega lo de 'comunidad'.
  let refHits: RefHit[] = [];
  try {
    const { data } = await asUser.rpc('buscar_referencias', {
      q: ultimo.content, max_results: 4,
    });
    refHits = (data ?? []) as RefHit[];
  } catch (_e) {
    refHits = [];
  }

  // ── Contexto extra por audiencia ──
  let anio: number | null = null;
  let contextoEscuela: string | undefined;
  let studentId: string | null = null;

  if (profile.role === 'docente' || profile.role === 'director') {
    contextoEscuela = [
      `Escuela: ${school?.name ?? escuela}${school?.short_name ? ` (${school.short_name})` : ''}.`,
      school?.address ? `Dirección: ${school.address}.` : '',
      school?.district ? `Distrito o localidad: ${school.district}.` : '',
    ].filter(Boolean).join('\n');
  }

  if (profile.role === 'docente') {
    const { data: asignaciones } = await admin
      .from('teacher_assignments')
      .select('subjects(name), courses(name)')
      .eq('teacher_id', user.id);
    const materiasYCursos = (asignaciones ?? [])
      .map((a: { subjects: { name: string } | null; courses: { name: string } | null }) =>
        `${a.subjects?.name ?? 'Materia'} — ${a.courses?.name ?? 'Curso'}`)
      .filter((valor: string, indice: number, todos: string[]) => todos.indexOf(valor) === indice);
    contextoEscuela = [
      contextoEscuela,
      materiasYCursos.length
        ? `Materias y cursos asignados al docente: ${materiasYCursos.join('; ')}.`
        : 'No hay materias ni cursos asignados disponibles en el sistema.',
    ].filter(Boolean).join('\n');
  }

  if (audience === 'estudiante') {
    const { data: st } = await admin
      .from('students')
      .select('id, course_id, courses(name)')
      .eq('user_id', user.id)
      .maybeSingle();
    studentId = st?.id ?? null;
    // Solo el año ("3° A" → 3): alcanza para el nivel y no identifica
    anio = Number(((st as any)?.courses?.name ?? '').match(/\d/)?.[0]) || null;
  }

  // Dos partes: la fija se cachea; la normativa de esta pregunta cambia
  const { base: promptBase, contexto: promptNormativa } = buildSystemPromptPartes({
    audience, rol: profile.role, nombre, escuela, policyHits, refHits, anio, contextoEscuela,
    puedeDerivar: audience !== 'estudiante' || Boolean(studentId),
  });

  // Nombres del padrón y datos de contacto: tapados para el proveedor. El
  // docente puede dar en más de una escuela: lo que está mirando puede ser de
  // la otra, así que van los padrones de todas
  const padron = new Set(await padronDeEscuela(admin, profile.school_id));
  if (profile.role === 'docente') {
    const { data: suyas } = await admin.from('teacher_assignments').select('courses(school_id)').eq('teacher_id', user.id);
    const otras = [...new Set(((suyas ?? []) as { courses: { school_id?: string } | null }[])
      .map(a => a.courses?.school_id).filter((s): s is string => Boolean(s) && s !== profile.school_id))];
    for (const s of otras) (await padronDeEscuela(admin, s)).forEach(n => padron.add(n));
  }
  const seudo = new Seudonimos(padron);

  // El docente: los botones que puede ofrecer (fijo, con caché), lo que está
  // mirando y lo que ya se sabe de cómo trabaja (memoria docente, 062: solo
  // si la tiene prendida; Migue la lee, no le agrega nada)
  let extraDocente = '';
  if (profile.role === 'docente') {
    if (ctx) extraDocente += seudo.tapar(seccionContexto(ctx));
    try {
      if (await memoriaDocenteDesde(admin, user.id)) {
        extraDocente += await memoriaDocenteParaPrompt(admin, user.id, ctx?.materia ?? undefined, ctx?.curso ?? undefined);
      }
    } catch (e) {
      console.error('memoria docente en Migue:', String(e).slice(0, 200));
    }
  }
  const promptFijo = profile.role === 'docente' ? `${promptBase}\n\n${GUIA_ACCIONES}` : promptBase;

  if (audience === 'estudiante' && !studentId) {
    console.error('Migue: estudiante sin fila en students', user.id);
  }

  // ── Alerta emocional ──
  // Se decide ANTES de responder para poder avisarle al chico en la misma
  // respuesta. Y solo se le dice que la escuela se enteró si el registro
  // se guardó de verdad: prometerlo sin haberlo hecho sería lo peor.
  let derivada: 'seguimiento' | 'urgente' | null = null;
  if (audience === 'estudiante' && studentId) {
    const pasadas: Parameters<typeof registrarConsumo>[1][] = [];
    const clasif = await clasificarRiesgo(OPENROUTER_API_KEY, seudo.tapar(ultimo.content), (modelo, u) => {
      pasadas.push({
        user_id: user.id, school_id: profile.school_id, role: profile.role,
        feature: 'migue_riesgo', model: modelo,
        tokens_in: u?.prompt_tokens ?? 0, tokens_out: u?.completion_tokens ?? 0, cost_usd: costoDe(u),
      });
    });
    for (const p of pasadas) await registrarConsumo(admin, p);

    if (clasif === 'error') {
      // Falló la evaluación. No es "no pasa nada": se deja una señal para
      // que alguien mire, acotada a una por día para no inundar el tablero
      // durante una caída del proveedor.
      // Con lo que escribió (nadie del equipo puede leer sus charlas): si
      // falla de nuevo el mismo día, se suma a la misma señal.
      const fragmento = taparContacto(ultimo.content).slice(0, 600);
      const hoyIso = new Date().toISOString().split('T')[0];
      const { data: yaHay } = await admin
        .from('wellbeing_signals')
        .select('id, excerpt')
        .eq('student_id', studentId)
        .eq('reason', REASON_SIN_CLASIFICAR)
        .gte('created_at', `${hoyIso}T00:00:00Z`)
        .limit(1);
      if (!yaHay || yaHay.length === 0) {
        const { error } = await admin.from('wellbeing_signals').insert({
          student_id: studentId,
          school_id: profile.school_id,
          level: 'seguimiento',
          reason: REASON_SIN_CLASIFICAR,
          excerpt: fragmento,
        });
        if (error) console.error('wellbeing_signals (sin clasificar):', JSON.stringify(error));
      } else {
        const anterior = (yaHay[0] as { excerpt: string | null }).excerpt ?? '';
        const { error } = await admin.from('wellbeing_signals')
          .update({ excerpt: `${anterior}${anterior ? '\n— ' : ''}${fragmento}`.slice(-4000) })
          .eq('id', (yaHay[0] as { id: string }).id);
        if (error) console.error('wellbeing_signals (sin clasificar, sumar):', JSON.stringify(error));
      }
      // Al chico no se le dice nada: no se evaluó nada sobre él.
    } else if (clasif.nivel !== 'ninguno') {
      // La escuela lee los nombres reales: las marcas se destapan acá
      const { error } = await admin.from('wellbeing_signals').insert({
        student_id: studentId,
        school_id: profile.school_id,
        level: clasif.nivel,
        reason: seudo.destapar(clasif.motivo),
        excerpt: clasif.frase ? seudo.destapar(clasif.frase) : null,
      });
      if (error) {
        // No se guardó: Migue NO puede decirle que la escuela ya sabe.
        console.error('wellbeing_signals insert:', JSON.stringify(error));
      } else {
        derivada = clasif.nivel;
      }
    }
  }

  const avisoDerivacion = derivada
    ? `\n\n## Importante para esta respuesta
Lo que escribió requiere acompañamiento y YA quedó avisada la escuela.
Decíselo en tu respuesta, con naturalidad y sin asustarlo: que le pasaste esto al equipo
de la escuela para que puedan darle una mano, y que no está solo. No le pidas permiso
—ya está hecho— ni se lo presentes como un castigo.${
        derivada === 'urgente'
          ? '\nAdemás, pedile que hable HOY con un adulto de confianza de la escuela o de su casa.'
          : ''
      }`
    : '';

  // El historial sale de la base, no del cliente: así nadie puede
  // fabricar turnos de Migue que no existieron (por ejemplo, uno donde
  // "prometió" no avisarle a la escuela).
  // Pregunta y respuesta se guardan juntas (mismo created_at): a igual hora,
  // 'assistant' < 'user' en el orden descendente deja la pregunta primero.
  const { data: guardados } = await admin
    .from('migue_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .order('role', { ascending: true })
    .limit(HISTORY_LIMIT);

  const historial = (guardados ?? [])
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: seudo.tapar(m.content) }));
  // Tiene que empezar por quien pregunta
  while (historial[0]?.role === 'assistant') historial.shift();

  // Caché de prompts sobre la parte fija (identidad y reglas): lo que se
  // repite en cada mensaje de la conversación se cobra al 10%. La normativa
  // de esta pregunta y el aviso van después, sin caché.
  const orBody = {
    model: MODEL_CHAT,
    max_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
    // Que el último chunk traiga también el costo (Consumo de IA)
    usage: { include: true },
    // Solo endpoints sin retención de datos (Bedrock / Vertex)
    provider: proveedorPrivado(),
    // Escuchar y orientar no necesita el razonamiento largo que Sonnet 5 trae
    // por defecto (se cobra como salida). Medio y no bajo: es el canal donde
    // un chico cuenta lo que le pasa.
    reasoning: { effort: 'medium' },
    messages: [
      {
        role: 'system',
        content: [
          { type: 'text', text: promptFijo, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: promptNormativa + avisoDerivacion + pantallaActual(profile.role, body.pantalla) + extraDocente },
        ],
      },
      ...historial,
      { role: 'user', content: seudo.tapar(ultimo.content) },
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
      // Lo que mandó el proveedor, con los nombres tapados: de acá salen los botones
      let crudo = '';
      // Las marcas [N1]… vuelven a ser nombres antes de llegar al usuario
      const nombresDeVuelta = seudo.flujo();
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
              crudo += delta;
              const texto = nombresDeVuelta.empujar(delta);
              if (texto) {
                fullContent += texto;
                controller.enqueue(encoder.encode(sseEvent('token', { text: texto })));
              }
            }
            if (ev?.usage) {
              tokensIn = ev.usage.prompt_tokens ?? 0;
              tokensOut = ev.usage.completion_tokens ?? 0;
              costUsd = costoDe(ev.usage);
            }
          }
        }
        const resto = nombresDeVuelta.cerrar();
        if (resto) {
          fullContent += resto;
          controller.enqueue(encoder.encode(sseEvent('token', { text: resto })));
        }

        // Los botones salen de las marcas; lo que se guarda va sin ellas
        const acciones = profile.role === 'docente' ? accionesDe(crudo, ctx) : [];
        const respuesta = sinMarcas(fullContent);

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
            session_id: sessionId, role: 'assistant', content: respuesta,
            cited_policy_ids: citadas,
          },
        ]);
        if (errMsgs) console.error('migue_messages insert:', JSON.stringify(errMsgs));

        const { error: errSes } = await admin.from('migue_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId);
        if (errSes) console.error('migue_sessions update:', JSON.stringify(errSes));

        const { error: errUso } = await admin.from('ia_usage').upsert({
          teacher_id: user.id,
          usage_date: hoy,
          ...(sinColumnaPropia
            ? { message_count: (usage?.migue_mensajes ?? 0) + 1 }
            : { migue_mensajes: (usage?.migue_mensajes ?? 0) + 1 }),
          token_count_in: (usage?.token_count_in ?? 0) + tokensIn,
          token_count_out: (usage?.token_count_out ?? 0) + tokensOut,
        }, { onConflict: 'teacher_id,usage_date' });
        if (errUso) console.error('ia_usage upsert:', errUso.message);

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
          citedReferencias: refHits.map((h) => ({
            id: h.referencia_id, titulo: h.titulo, numero: h.numero, seccion: h.seccion, url: h.fuente_url,
          })),
          // El cliente lo usa para mostrarle al chico, en la interfaz y no
          // solo dentro del texto de la IA, que esto se compartió.
          derivada,
          // Docente: los botones de esta respuesta y sobre qué se habló
          acciones,
          contexto: ctx ? {
            tipo: ctx.tipo, id: ctx.id, titulo: ctx.titulo, temaId: ctx.temaId,
            subjectId: ctx.subjectId, courseId: ctx.courseId, materia: ctx.materia, curso: ctx.curso,
          } : null,
        })));
      } catch (err) {
        console.error('stream error', err);
        controller.enqueue(encoder.encode(sseEvent('error', {
          code: 'STREAM_ERROR', message: 'Se cortó la respuesta. Probá de nuevo.',
          // Si la escuela ya fue avisada, el chico se entera igual
          derivada,
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
