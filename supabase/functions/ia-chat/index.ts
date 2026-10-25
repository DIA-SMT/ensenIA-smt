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
 * Cuando del otro lado hay un estudiante, el navegador no decide nada (ver
 * _estudiante.ts): el historial sale de la base, el material se lee con su
 * sesión, cada mensaje pasa por el clasificador de riesgo, y su memoria de
 * estudio (061) entra solo con la autorización de la familia y la suya.
 *
 * Lo que se manda al proveedor: sin el nombre del estudiante ni de la
 * escuela y sin datos de contacto, y solo a endpoints sin retención. Los
 * nombres del padrón se tapan en el clasificador y en la memoria; en el chat
 * de estudio no, porque romperían contenidos (próceres, autores, lugares con
 * apellidos de la escuela).
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildSystemPrompt, type PromptContext, type RefHit } from './_system-prompt.ts';
import { padronDeEscuela, proveedorPrivado, Seudonimos, taparContacto } from './_datos-personales.ts';
import {
  CHARLA_TERMINADA_MS, clasificarRiesgo, consolidarPendiente, leerMaterial, memoriaActivaDesde,
  memoriaParaPrompt, type Anotar,
} from './_estudiante.ts';
import { consolidarDocente, memoriaDocenteDesde, memoriaDocenteParaPrompt } from './_memoria-docente.ts';

// ── Config ──
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_SONNET = 'anthropic/claude-sonnet-5';
const MODEL_HAIKU = 'anthropic/claude-haiku-4.5';
// Usos de IA por día, compartidos entre ia-chat y process-document (misma
// tabla ia_usage). El personal tiene 15 y los estudiantes 50: decidido el
// 23/10/2026 para cuidar el gasto en el piloto (antes eran 50 para todos).
// El número que ve el docente sale de src/lib/usoIA.ts: cambiarlos juntos.
const CUPO_DIARIO_EQUIPO = 15;
const CUPO_DIARIO_ESTUDIANTE = 50;
// Sonnet 5 razona por defecto y eso cuenta dentro de max_tokens:
// margen para razonamiento + respuesta larga (streaming, sin timeout).
const MAX_TOKENS = 12000;
const SUMMARY_INPUT_LIMIT = 8000; // chars
// Estudiante: el historial es la charla en curso (más el final de la
// anterior), con un tope; y cuánto puede medir un mensaje
const HISTORY_LIMIT = 40;
const HISTORIAL_PREVIO = 4;
const MAX_MSG_ESTUDIANTE = 4000;
const REASON_SIN_CLASIFICAR =
  'EstudIA no pudo evaluar un mensaje (falló el clasificador). Conviene mirarlo a mano.';

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
    documentText?: string;
    /** Estudiante: el material que eligió. Su texto lo lee el servidor. */
    materialId?: string;
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
    tokens_cache_leidos?: number; tokens_cache_escritos?: number;
  },
): Promise<void> {
  try {
    let { error } = await db.from('ia_events').insert(ev);
    // Sin la 077 todavía: se anota igual, sin el caché
    if (error && /tokens_cache/.test(error.message)) {
      const { tokens_cache_leidos: _l, tokens_cache_escritos: _e, ...sinCache } = ev;
      ({ error } = await db.from('ia_events').insert(sinCache));
    }
    if (error) console.error('ia_events insert:', error.message);
  } catch (e) {
    console.error('ia_events insert:', String(e));
  }
}

/** Cuánto de la entrada se leyó del caché y cuánto se escribió (OpenRouter: usage.prompt_tokens_details) */
function cacheDe(usage: unknown): { tokens_cache_leidos: number; tokens_cache_escritos: number } {
  const d = (usage as { prompt_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown } } | null | undefined)
    ?.prompt_tokens_details;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  return { tokens_cache_leidos: n(d?.cached_tokens), tokens_cache_escritos: n(d?.cache_write_tokens) };
}

/** Lo que cobró OpenRouter por la llamada (viene si se pide usage: { include: true }). */
function costoDe(usage: unknown): number | null {
  const c = (usage as { cost?: unknown } | null | undefined)?.cost;
  return typeof c === 'number' && Number.isFinite(c) ? c : null;
}

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
  if (!supabaseUrl || !supabaseServiceKey) {
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

  const teacherName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : 'Docente';
  const isStudent = profile?.role === 'estudiante';

  // ── 3b. Un estudiante solo puede usar los modos de estudio ──
  // Sin esto, bastaba con mandar tool:'act' para tener el asistente
  // completo del docente y pedirle la tarea resuelta.
  let effectiveTool = tool;
  let studentSubjects: string[] = [];
  let studentId: string | null = null;
  let studentSchoolId: string | null = null;

  if (isStudent) {
    if (tool !== 'guide' && tool !== 'simplify') {
      effectiveTool = 'guide';
    }

    // De qué puede preguntar: sus materias reales, según su inscripción.
    const { data: studentRow } = await supabase
      .from('students')
      .select('id, school_id')
      .eq('user_id', user.id)
      .maybeSingle();

    studentId = studentRow?.id ?? null;
    studentSchoolId = studentRow?.school_id ?? null;
    if (!studentRow) console.error('ia-chat: estudiante sin fila en students', user.id);

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

  // ── 3c. La conversación tiene que ser de quien pide ──
  // Con la service key la respuesta se guarda en el session_id que mande el
  // cliente: sin esto, con el id de la conversación de otra persona se le
  // podían escribir mensajes "de la IA" en su historial.
  const { data: sesion } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .maybeSingle();

  if (!sesion) {
    return new Response(
      sseEvent('error', { code: 'SESSION_INVALID', message: 'No se encontró esta conversación. Recargá la página y probá de nuevo.' }),
      { status: 403, headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
    );
  }

  // ── 4. Check daily quota ──
  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabase
    .from('ia_usage')
    .select('message_count, token_count_in, token_count_out')
    .eq('teacher_id', user.id)
    .eq('usage_date', today)
    .maybeSingle();

  const cupo = isStudent ? CUPO_DIARIO_ESTUDIANTE : CUPO_DIARIO_EQUIPO;
  if (usage && usage.message_count >= cupo) {
    return new Response(
      sseEvent('error', {
        code: 'QUOTA_EXCEEDED',
        message: `Alcanzaste el límite de ${cupo} usos de IA por hoy. ¡Volvé mañana! 💪`,
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

  // Cliente con el JWT del usuario: lo que lee pasa por su RLS
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const asUser = anonKey
    ? createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    : null;

  // ── 5a. Estudiante: lo que manda el navegador no decide nada ──
  const ultimo = messages[messages.length - 1];
  if (isStudent) {
    if (!ultimo || ultimo.role !== 'user' || typeof ultimo.content !== 'string') {
      return new Response('Last message must be from user', { status: 400, headers: corsHeaders() });
    }
    if (ultimo.content.length > MAX_MSG_ESTUDIANTE) {
      return new Response(
        sseEvent('error', {
          code: 'INPUT_TOO_LONG',
          message: `El mensaje es muy largo (máximo ${MAX_MSG_ESTUDIANTE} caracteres). Probá con una parte.`,
        }),
        { headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
      );
    }
  }

  // Material: el del estudiante se lee de la base con su sesión (si no lo
  // puede ver, no entra); el texto que mande el navegador no cuenta.
  let documentTitle = context.documentTitle;
  let documentText = context.documentText;
  if (isStudent) {
    documentTitle = undefined;
    documentText = undefined;
    // Por id; la versión anterior de la app manda el título (y su texto, que
    // no se usa: se busca el material con ese título que el chico puede ver)
    if ((context.materialId || context.documentTitle) && asUser) {
      const material = await leerMaterial(asUser, { id: context.materialId, titulo: context.documentTitle });
      if (material) {
        documentTitle = material.titulo;
        documentText = material.texto;
      }
    }
  }

  // ── 5b. Biblioteca de referencia municipal (047) ──
  // Solo para el docente. Corre con el JWT del usuario: la RLS decide qué
  // entra (publicado y vigente). Si falla, se sigue sin referencias: la
  // regla del prompt pasa a ser "no citar normativa de memoria".
  let referencias: RefHit[] = [];
  if (!isStudent && asUser) {
    try {
      const ultimoPedido = messages[messages.length - 1]?.content ?? '';
      const consulta = [context.classTitle, context.unitTitle, ultimoPedido.slice(0, 1500)]
        .filter(Boolean).join('\n');
      // "2° A" → 2; "4to Año" → 4
      const anio = Number((context.courseName.match(/\d/) ?? context.educationLevel?.match(/\d/) ?? [])[0]) || null;
      const { data } = await asUser.rpc('buscar_referencias', {
        q: consulta, p_area: context.subjectName || null, p_anio: anio, max_results: 6,
      });
      referencias = (data ?? []) as RefHit[];
    } catch (e) {
      console.error('buscar_referencias:', String(e).slice(0, 200));
      referencias = [];
    }
  }

  // ── 5b'. Docente: lo que la IA ya sabe de cómo trabaja (062) ──
  // Entra lo que ya está anotado. La última charla terminada se consolida
  // DESPUÉS de responder (en segundo plano): esperar a Haiku antes del
  // primer token demoraba segundos el primer mensaje de cada charla. Un
  // error acá no corta nada.
  let memoriaDocente = '';
  let consolidarDespues: (() => Promise<void>) | null = null;
  if (profile?.role === 'docente') {
    try {
      const desde = await memoriaDocenteDesde(supabase, user.id);
      if (desde) {
        memoriaDocente = await memoriaDocenteParaPrompt(supabase, user.id, context.subjectName, context.courseName);
        consolidarDespues = async () => {
          const { data: asignaciones } = await supabase
            .from('teacher_assignments')
            .select('subjects(name), courses(name, school_id)')
            .eq('teacher_id', user.id);
          const filas = (asignaciones ?? []) as unknown as {
            subjects: { name?: string } | null; courses: { name?: string; school_id?: string } | null;
          }[];
          const materias = [...new Set(filas.map((a) => a.subjects?.name).filter((n): n is string => Boolean(n)))];
          const cursos = [...new Set(filas.map((a) => a.courses?.name).filter((n): n is string => Boolean(n)))];
          // El padrón de TODAS sus escuelas: un chico de la otra también se tapa
          const escuelas = [...new Set([profile.school_id, ...filas.map((a) => a.courses?.school_id)].filter((s): s is string => Boolean(s)))];
          const nombres = new Set<string>();
          for (const s of escuelas) (await padronDeEscuela(supabase, s)).forEach((n) => nombres.add(n));
          const consumos: Parameters<typeof registrarConsumo>[1][] = [];
          await consolidarDocente({
            admin: supabase, apiKey: OPENROUTER_API_KEY, teacherId: user.id, desde, materias, cursos, nombres,
            anotar: (modelo, u) => consumos.push({
              user_id: user.id, school_id: profile.school_id, role: 'docente', feature: 'memoria_docente', model: modelo,
              tokens_in: u?.prompt_tokens ?? 0, tokens_out: u?.completion_tokens ?? 0, cost_usd: costoDe(u), ...cacheDe(u),
            }),
          });
          for (const c of consumos) await registrarConsumo(supabase, c);
        };
      }
    } catch (e) {
      console.error('memoria docente:', String(e).slice(0, 200));
    }
  }

  // ── 5c. Estudiante: riesgo, memoria e historial ──
  let derivada: 'seguimiento' | 'urgente' | null = null;
  let memoriaEstudio = '';
  let historial: { role: 'user' | 'assistant'; content: string }[] = [];

  if (isStudent && studentId && studentSchoolId) {
    const consumos: Parameters<typeof registrarConsumo>[1][] = [];
    const anotarCon = (feature: string): Anotar => (modelo, u) => {
      consumos.push({
        user_id: user.id, school_id: studentSchoolId, role: 'estudiante', feature, model: modelo,
        tokens_in: u?.prompt_tokens ?? 0, tokens_out: u?.completion_tokens ?? 0, cost_usd: costoDe(u), ...cacheDe(u),
      });
    };

    const [nombres, activaDesde] = await Promise.all([
      padronDeEscuela(supabase, studentSchoolId),
      memoriaActivaDesde(supabase, studentId),
    ]);
    // El clasificador no necesita nombres: van tapados y vuelven en la cita
    const seudo = new Seudonimos(nombres);

    // La alerta se decide ANTES de responder, para avisarle al chico en la
    // misma respuesta. En paralelo, si la memoria está activa, entra la
    // última charla terminada.
    const [clasif] = await Promise.all([
      clasificarRiesgo(OPENROUTER_API_KEY, seudo.tapar(ultimo.content), anotarCon('estudia_riesgo')),
      activaDesde
        ? consolidarPendiente({
          admin: supabase, apiKey: OPENROUTER_API_KEY, userId: user.id, studentId,
          schoolId: studentSchoolId, activaDesde, materias: studentSubjects, nombres,
          anotar: anotarCon('memoria_estudio'),
        })
        : Promise.resolve(),
    ]);

    if (clasif === 'error') {
      // No es "no pasa nada": una señal por día para que alguien lo mire,
      // con lo que escribió (el equipo no puede leer sus charlas). Si falla
      // de nuevo el mismo día, se suma a la misma señal: así no se inunda el
      // tablero durante una caída y ningún mensaje queda sin rastro.
      const fragmento = taparContacto(ultimo.content).slice(0, 600);
      const hoyIso = new Date().toISOString().split('T')[0];
      const { data: yaHay } = await supabase
        .from('wellbeing_signals')
        .select('id, excerpt')
        .eq('student_id', studentId)
        .eq('reason', REASON_SIN_CLASIFICAR)
        .gte('created_at', `${hoyIso}T00:00:00Z`)
        .limit(1);
      if (!yaHay || yaHay.length === 0) {
        const { error } = await supabase.from('wellbeing_signals').insert({
          student_id: studentId, school_id: studentSchoolId, level: 'seguimiento',
          reason: REASON_SIN_CLASIFICAR, excerpt: fragmento,
        });
        if (error) console.error('wellbeing_signals (sin clasificar):', JSON.stringify(error));
      } else {
        const anterior = (yaHay[0] as { excerpt: string | null }).excerpt ?? '';
        const { error } = await supabase.from('wellbeing_signals')
          .update({ excerpt: `${anterior}${anterior ? '\n— ' : ''}${fragmento}`.slice(-4000) })
          .eq('id', (yaHay[0] as { id: string }).id);
        if (error) console.error('wellbeing_signals (sin clasificar, sumar):', JSON.stringify(error));
      }
    } else if (clasif.nivel !== 'ninguno') {
      const { error } = await supabase.from('wellbeing_signals').insert({
        student_id: studentId,
        school_id: studentSchoolId,
        level: clasif.nivel,
        reason: `En EstudIA (tutor de estudio): ${seudo.destapar(clasif.motivo)}`,
        excerpt: clasif.frase ? seudo.destapar(clasif.frase) : null,
      });
      // Si no se guardó, no se le puede decir que la escuela ya sabe
      if (error) console.error('wellbeing_signals insert:', JSON.stringify(error));
      else derivada = clasif.nivel;
    }
    for (const c of consumos) await registrarConsumo(supabase, c);

    if (activaDesde) memoriaEstudio = await memoriaParaPrompt(supabase, studentId, activaDesde);
  }

  if (isStudent) {
    // El historial sale de la base, no del navegador: nadie puede fabricar
    // turnos de la IA que no existieron.
    const { data: guardados } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT + HISTORIAL_PREVIO + 1);
    let previos = ((guardados ?? []) as { role: string; content: string; created_at: string }[]).reverse();
    // Una versión vieja de la app todavía guarda desde el navegador el
    // mensaje que se está respondiendo: no se duplica.
    const ult = previos[previos.length - 1];
    const yaGuardado = !!ult && ult.role === 'user' && ult.content === ultimo.content
      && Date.now() - Date.parse(ult.created_at) < 120_000;
    if (yaGuardado) previos = previos.slice(0, -1);

    // La charla en curso: desde el último corte de 20 minutos, más los
    // últimos mensajes de la anterior. Así el historial solo crece mientras
    // dura la charla (el prefijo no cambia y el caché de prompts sirve), y lo
    // de días anteriores llega por la memoria, no releyendo todo.
    let inicioCharla = previos.length;
    let siguiente = Date.now();
    for (let i = previos.length - 1; i >= 0; i--) {
      const t = Date.parse(previos[i].created_at);
      if (siguiente - t >= CHARLA_TERMINADA_MS) break;
      inicioCharla = i;
      siguiente = t;
    }
    const desde = Math.max(inicioCharla - HISTORIAL_PREVIO, previos.length - HISTORY_LIMIT, 0);
    historial = previos
      .slice(desde)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: taparContacto(m.content) }));
    // La conversación tiene que empezar por el chico (un "Detener" o un
    // error dejan preguntas sin respuesta y el corte puede caer en la IA)
    while (historial[0]?.role === 'assistant') historial.shift();

    // Se guarda ya: si el chico toca "Detener", su mensaje no se pierde
    if (!yaGuardado) {
      const { error: errUser } = await supabase.from('chat_messages').insert({
        session_id: sessionId, role: 'user', content: ultimo.content, tool_used: effectiveTool,
      });
      if (errUser) console.error('chat_messages (estudiante):', errUser.message);
    }
  }

  // ── 6. Build system prompt ──
  const promptCtx: PromptContext = {
    audience: isStudent ? 'estudiante' : 'docente',
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
    documentTitle,
    documentText,
    referencias,
    memoriaEstudio,
    memoriaDocente,
  };
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
  const basePrompt = buildSystemPrompt(promptCtx);
  const systemPrompt = basePrompt + avisoDerivacion;

  // Al proveedor: el estudiante sin datos de contacto; el docente, como siempre
  const mensajesModelo = isStudent
    ? [...historial, { role: 'user' as const, content: taparContacto(ultimo.content) }]
    : messages.map((m) => ({ role: m.role, content: m.content }));

  // ── 7. Determine model ──
  // Resúmenes y simplificación de lenguaje van al modelo rápido.
  const useFastModel = effectiveTool === 'sum' || effectiveTool === 'simplify';
  const modelId = useFastModel ? MODEL_HAIKU : MODEL_SONNET;
  const modelLabel = useFastModel ? 'haiku' : 'sonnet';

  // ── 8. Call OpenRouter (Claude) with streaming ──
  // Estudiante: caché de prompts en dos puntos (el prompt de sistema, que no
  // cambia en toda la charla, y el último mensaje, porque el historial solo
  // crece): lo que se repite de un turno a otro se cobra al 10%. El aviso de
  // derivación va aparte, después del primer punto. Al docente no: su prompt
  // cambia en cada pedido (referencias, material) y escribir un caché que
  // nunca se lee cuesta 25% más.
  const cache = { type: 'ephemeral' as const };
  const mensajesConCache = isStudent
    ? [
      {
        role: 'system',
        content: [
          { type: 'text', text: basePrompt, cache_control: cache },
          ...(avisoDerivacion ? [{ type: 'text', text: avisoDerivacion }] : []),
        ],
      },
      ...mensajesModelo.slice(0, -1),
      {
        role: 'user',
        content: [{ type: 'text', text: mensajesModelo[mensajesModelo.length - 1].content, cache_control: cache }],
      },
    ]
    : [{ role: 'system', content: systemPrompt }, ...mensajesModelo];

  const orBody = {
    model: modelId,
    max_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
    // Que el último chunk traiga también el costo (Consumo de IA)
    usage: { include: true },
    // Solo endpoints sin retención de datos (Bedrock / Vertex)
    provider: proveedorPrivado(),
    // El tutor del estudiante responde 80 a 200 palabras: no necesita el
    // razonamiento largo que Sonnet 5 trae por defecto (se cobra como salida)
    ...(isStudent && !useFastModel ? { reasoning: { effort: 'low' } } : {}),
    messages: mensajesConCache,
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
    // Si la escuela ya fue avisada, el error tiene que llevarlo igual
    return new Response(
      sseEvent('error', { code: 'API_ERROR', message: 'No se pudo conectar con el servicio de IA.', derivada }),
      { headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
    );
  }

  if (!orResponse.ok) {
    const errText = await orResponse.text();
    console.error('OpenRouter error:', orResponse.status, errText.substring(0, 500));
    const friendly = orResponse.status === 429
      ? 'El servicio de IA está sobrecargado. Intentá de nuevo en unos segundos.'
      : orResponse.status === 402
        ? 'La cuenta de IA se quedó sin crédito. Avisale al administrador.'
        : 'Error del servicio de IA. Intentá de nuevo.';
    return new Response(
      sseEvent('error', { code: 'API_ERROR', message: friendly, derivada }),
      { headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream' } },
    );
  }

  // ── 8b. El uso se cuenta ya, no al terminar ──
  // Si el docente toca "Detener", el navegador corta y el resto de esta
  // función no corre: la generación salía gratis y no contaba para el cupo.
  // Al final se vuelve a escribir la misma fila, ya con los tokens.
  const { error: reservaErr } = await supabase
    .from('ia_usage')
    .upsert(
      {
        teacher_id: user.id,
        usage_date: today,
        message_count: (usage?.message_count ?? 0) + 1,
        token_count_in: usage?.token_count_in ?? 0,
        token_count_out: usage?.token_count_out ?? 0,
      },
      { onConflict: 'teacher_id,usage_date' },
    );
  if (reservaErr) console.error('Usage reserve error:', reservaErr);

  // ── 9. Stream response (SSE estilo OpenAI: choices[0].delta.content) ──
  const reader = orResponse.body!.getReader();
  const decoder = new TextDecoder();

  let fullContent = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = null;
  let enCache = { tokens_cache_leidos: 0, tokens_cache_escritos: 0 };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let buffer = '';

      // Primero que nada: si la escuela ya fue avisada, el chico se entera
      // aunque toque "Detener" antes de que termine la respuesta
      if (derivada) controller.enqueue(encoder.encode(sseEvent('derivada', { derivada })));

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
              enCache = cacheDe(event.usage);
            }
          }
        }

        // ── 10. Persist message & update usage ──
        // Save assistant message
        const { data: savedMsg } = await supabase.from('chat_messages').insert({
          session_id: sessionId,
          role: 'assistant',
          content: fullContent,
          tool_used: effectiveTool ?? 'free',
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

        await registrarConsumo(supabase, {
          user_id: user.id, school_id: profile?.school_id ?? null, role: profile?.role ?? null,
          feature: 'chat', detail: effectiveTool ?? 'free', model: modelId,
          tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: costUsd, ...enCache,
        });

        // Send done event
        controller.enqueue(
          encoder.encode(
            sseEvent('done', {
              messageId: savedMsg?.id ?? '',
              model: modelLabel,
              tokensIn,
              tokensOut,
              // El cliente lo muestra en la interfaz, no solo dentro del texto
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

  // Lo que se hace después de responder: la memoria del docente. En Supabase
  // EdgeRuntime.waitUntil mantiene viva la función hasta que termine.
  if (consolidarDespues) {
    const tarea = consolidarDespues().catch((e) => console.error('memoria docente (después):', String(e).slice(0, 200)));
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
    runtime?.waitUntil(tarea);
  }

  return new Response(stream, {
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
