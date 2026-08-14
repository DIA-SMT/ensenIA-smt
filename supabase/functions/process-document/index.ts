/**
 * ENSEÑIA SMT — Document Processing Edge Function
 *
 * POST /functions/v1/process-document
 *
 * Modos (JSON in → JSON out, sin streaming):
 *  - extract_text:      PDF base64 → texto plano (visión: funciona con escaneos)
 *  - summarize:         texto o PDF → resumen pedagógico en Markdown
 *  - import_program:    programa anual (PDF/texto) → { subject_name, course_name, units[] } (structured output)
 *  - extract_questions: consigna en Markdown → { questions[] } autocorregibles (structured output)
 *  - practice_quiz:     materialId → quiz pedagógico para estudiantes, CACHEADO en el material (1 sola generación)
 *  - study_guide:       materialId → guía de estudio para estudiantes, CACHEADA en el material
 *
 * Nota: llamamos a Claude vía OpenRouter (chat completions) con fetch crudo,
 * mismo estilo que ia-chat, sin dependencias npm en el bundle de Deno.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_SONNET = 'anthropic/claude-sonnet-5';
const MODEL_HAIKU = 'anthropic/claude-haiku-4.5';
const DAILY_QUOTA = 50;
const MAX_PDF_BASE64 = 15_000_000; // ~11 MB binario
const MAX_TEXT_INPUT = 60_000; // chars

type Mode = 'extract_text' | 'summarize' | 'import_program' | 'extract_questions' | 'student_summary' | 'study_cards'
  | 'practice_quiz' | 'study_guide';

/** Modos habilitados para el rol estudiante (siempre cacheados por material). */
const STUDENT_MODES: Mode[] = ['practice_quiz', 'study_guide'];
/** Modos que se cachean en library_materials y reciben materialId. */
const CACHED_MODES: Mode[] = ['practice_quiz', 'study_guide'];

interface ProcessRequest {
  mode: Mode;
  pdfBase64?: string;
  text?: string;
  title?: string;
  materialId?: string;
  context?: { subjectName?: string; courseName?: string };
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

// ── Structured output schemas ──

const PROGRAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject_name', 'course_name', 'school_year', 'teacher_name', 'units'],
  properties: {
    subject_name: { type: 'string', description: 'Nombre del espacio curricular / materia' },
    course_name: { type: 'string', description: 'Curso, ej: "4° A"' },
    school_year: { type: 'string', description: 'Año lectivo, ej: "2026". Vacío si no figura.' },
    teacher_name: { type: 'string', description: 'Docente. Vacío si no figura.' },
    units: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'classes'],
        properties: {
          title: { type: 'string', description: 'Título de la unidad tal como figura en el programa' },
          classes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'objectives'],
              properties: {
                title: { type: 'string', description: 'Título concreto de una clase dictable' },
                objectives: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
};

const STUDY_CARDS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['emoji', 'title', 'body'],
        properties: {
          emoji: { type: 'string', description: 'Un solo emoji representativo del concepto' },
          title: { type: 'string', description: 'Título corto y potente (máx. 6 palabras)' },
          body: { type: 'string', description: 'Explicación clara en 2-4 oraciones cortas, lenguaje de secundaria' },
        },
      },
    },
  },
};

const PRACTICE_QUIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt', 'options', 'correct_index', 'explanation', 'hint'],
        properties: {
          prompt: { type: 'string', description: 'La pregunta, clara y autocontenida' },
          options: { type: 'array', items: { type: 'string' }, description: 'Exactamente 4 opciones plausibles' },
          correct_index: { type: 'integer', description: 'Índice (0-based) de la opción correcta' },
          explanation: { type: 'string', description: 'Por qué la correcta es correcta, en 1-3 oraciones formativas' },
          hint: { type: 'string', description: 'Pista corta que orienta sin revelar la respuesta. Vacía si no aplica.' },
        },
      },
    },
  },
};

const QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'prompt', 'options', 'correct_index'],
        properties: {
          type: { type: 'string', enum: ['multiple_choice', 'open'] },
          prompt: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Opciones para multiple_choice. Array vacío para preguntas abiertas.',
          },
          correct_index: {
            type: 'integer',
            description: 'Índice (0-based) de la opción correcta. 0 para preguntas abiertas.',
          },
        },
      },
    },
  },
};

// ── Prompts ──

const PROMPTS: Record<Mode, string> = {
  extract_text: `Transcribí el texto completo del documento en orden de lectura natural.
Reglas:
- Devolvé SOLO el texto transcripto, sin comentarios ni introducciones.
- Conservá títulos, listas y estructura con Markdown simple.
- Si hay partes ilegibles, marcalas como [ilegible].`,

  summarize: `Sos ENSEÑIA, asistente pedagógico para docentes de secundaria argentina.
Creá un resumen pedagógico claro y visual del documento en Markdown:

**Ideas principales** (viñetas, máximo 5-7)
**Conceptos clave** (en negrita, con definición breve)
**Glosario** de términos importantes (si aplica)
**Preguntas de comprensión** (3-5)
**Sugerencia de uso en clase** (1-2 líneas)

Sé conciso pero completo. Respondé en español rioplatense.`,

  import_program: `Sos un asistente que digitaliza programas anuales de escuelas secundarias argentinas para convertirlos en una planificación de clases.

Analizá el documento y extraé su estructura REAL (no inventes contenido que no esté):
- subject_name, course_name, school_year, teacher_name: tal como figuran en el encabezado.
- units: una entrada por cada unidad/eje temático del programa, con su título textual (podés abreviar títulos larguísimos manteniendo el sentido).
- Para cada unidad, agrupá sus contenidos en CLASES dictables (2 a 5 por unidad). Cada clase:
  - title: concreto y dictable (ej: "Suma gráfica de vectores y equilibrio estático").
  - objectives: 1 a 3 objetivos, derivados de los objetivos/contenidos del programa, empezando con verbo en infinitivo.
- Mantené el idioma y la terminología del documento.
- Si el documento NO es un programa educativo, devolvé units como array vacío.`,

  study_cards: `Sos ENSEÑIA, asistente pedagógico. Convertí el material de estudio en PLACAS: tarjetas visuales tipo "slides" para que estudiantes de secundaria repasen desde el celular.

Reglas:
- Entre 6 y 10 placas. La primera presenta el tema; la última es un mini-repaso o dato para recordar.
- Cada placa = UN concepto. Título corto y potente + explicación en 2-4 oraciones simples.
- Lenguaje claro de secundaria, español rioplatense. Ejemplos concretos cuando ayuden.
- Un emoji distinto y representativo por placa.
- Fiel al material: no inventes contenido que no esté.`,

  student_summary: `Sos ENSEÑIA, asistente pedagógico de secundaria argentina. Vas a recibir la ficha de un estudiante: métricas, check-ins emocionales, observaciones del equipo docente y desempeño.

Escribí una síntesis profesional y humana del estudiante (máx. 220 palabras) en Markdown:

**En una frase** — cómo está el estudiante hoy.
**Fortalezas** (1-3 viñetas concretas)
**Necesita** (1-3 viñetas: apoyos específicos y accionables)
**Sugerencia para la próxima semana** — UNA acción concreta para el docente.

Reglas:
- Basate SOLO en los datos provistos; no inventes.
- Tono constructivo y respetuoso: es material para hablar con la familia o el equipo.
- Español rioplatense. Nada de tecnicismos psicológicos ni diagnósticos.`,

  practice_quiz: `Sos ENSEÑIA, un tutor amigable para estudiantes de secundaria argentina. Creá un quiz de práctica a partir del material de estudio.

Reglas:
- Entre 5 y 8 preguntas multiple choice, cada una con exactamente 4 opciones plausibles (los distractores reflejan confusiones típicas, no opciones absurdas).
- Cubrí las ideas centrales del material, ordenadas de lo más básico a lo más desafiante.
- En "explanation" explicá POR QUÉ la respuesta correcta es correcta, en 1-3 oraciones, como un profe copado; si sirve, aclará por qué las otras confunden. Es feedback para APRENDER, no solo corregir.
- En "hint" da una pista corta que oriente el razonamiento sin regalar la respuesta.
- Voseo, lenguaje claro de secundaria, español rioplatense.
- Fiel al material: no inventes contenido que no esté.`,

  study_guide: `Sos ENSEÑIA, un tutor que ayuda a estudiantes de secundaria argentina a ESTUDIAR un material (no solo leerlo). Escribí una guía de estudio en Markdown dirigida al estudiante (voseo):

**¿De qué se trata?** — 2-3 oraciones que sitúan el tema.
**Ideas clave** — 4-6, cada una con explicación breve y un ejemplo cotidiano si ayuda.
**Ojo con esto** — 2-3 confusiones típicas o errores comunes al estudiar este tema.
**Preguntate esto** — 4-5 preguntas para auto-evaluarte (sin las respuestas: la idea es que vuelvas al material si no las sabés).
**Truco para recordarlo** — una mnemotecnia, analogía o regla práctica.

Lenguaje cercano y motivador, español rioplatense. Fiel al material: no inventes contenido que no esté.`,

  extract_questions: `Sos un asistente pedagógico. A partir de la consigna/actividad dada, extraé o generá preguntas para un cuestionario autocorregible para estudiantes de secundaria.

Reglas:
- Si la actividad ya contiene preguntas, extraelas fielmente.
- Si contiene consignas de opción múltiple, convertilas en multiple_choice con sus opciones y la correcta.
- Preguntas de desarrollo → type "open" (options: [], correct_index: 0).
- Si la actividad no tiene preguntas explícitas, generá 3-5 preguntas de comprensión sobre su contenido (mayoría multiple_choice con 4 opciones plausibles).
- Redactá en español rioplatense, nivel secundaria.`,
};

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    return json({ error: 'CONFIG_ERROR', message: 'API key de IA no configurada (OPENROUTER_API_KEY).' }, 500);
  }

  // ── Parse ──
  let body: ProcessRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  const { mode, pdfBase64, materialId, context } = body;
  let { text, title } = body;

  if (!mode || !PROMPTS[mode]) return json({ error: 'INVALID_MODE' }, 400);
  const isCached = CACHED_MODES.includes(mode);
  if (isCached) {
    // Los modos cacheados trabajan SOLO desde el material en DB (nunca texto del cliente)
    if (!materialId) return json({ error: 'MISSING_INPUT', message: 'Falta materialId.' }, 400);
  } else if (!pdfBase64 && !text) {
    return json({ error: 'MISSING_INPUT', message: 'Falta pdfBase64 o text.' }, 400);
  }
  if (pdfBase64 && pdfBase64.length > MAX_PDF_BASE64) {
    return json({ error: 'FILE_TOO_LARGE', message: 'El PDF supera el tamaño máximo (11 MB).' }, 400);
  }

  // ── Auth ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'UNAUTHORIZED' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ error: 'AUTH_INVALID', message: 'Sesión expirada. Volvé a iniciar sesión.' }, 401);
  }

  // ── Guard de rol: estudiantes solo acceden a los modos de estudio ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'estudiante' && !STUDENT_MODES.includes(mode)) {
    return json({ error: 'FORBIDDEN_MODE', message: 'Este modo no está disponible para estudiantes.' }, 403);
  }

  // ── Modos cacheados: cargar material, autorizar y devolver cache si existe ──
  // (el cache-hit va ANTES del chequeo de cuota: releer no gasta usos de IA)
  let cacheMaterial: {
    id: string; title: string; subject_name: string; subject_id: string;
    teacher_id: string; school_id: string; is_shared_with_students: boolean;
    extracted_text: string | null; ai_summary: string | null;
    study_cards: { title: string; body: string }[] | null;
    practice_quiz: unknown | null; study_guide: string | null;
  } | null = null;

  if (isCached) {
    const { data: mat } = await supabase
      .from('library_materials')
      .select('id, title, subject_name, subject_id, teacher_id, school_id, is_shared_with_students, extracted_text, ai_summary, study_cards, practice_quiz, study_guide')
      .eq('id', materialId)
      .maybeSingle();

    if (!mat) return json({ error: 'NOT_FOUND', message: 'El material no existe.' }, 404);

    // Autorización por rol
    if (profile?.role === 'estudiante') {
      if (!mat.is_shared_with_students) {
        return json({ error: 'FORBIDDEN', message: 'Este material no está compartido con estudiantes.' }, 403);
      }
      const { data: student } = await supabase
        .from('students').select('id').eq('user_id', user.id).maybeSingle();
      if (!student) return json({ error: 'FORBIDDEN', message: 'No encontramos tu ficha de estudiante.' }, 403);
      const { data: enrollment } = await supabase
        .from('enrollments').select('id')
        .eq('student_id', student.id).eq('subject_id', mat.subject_id)
        .limit(1).maybeSingle();
      if (!enrollment) {
        return json({ error: 'FORBIDDEN', message: 'No estás inscripto/a en esta materia.' }, 403);
      }
    } else if (profile?.role === 'docente') {
      if (mat.teacher_id !== user.id) {
        return json({ error: 'FORBIDDEN', message: 'El material pertenece a otro docente.' }, 403);
      }
    } else if (profile?.role === 'director') {
      if (mat.school_id !== profile.school_id) {
        return json({ error: 'FORBIDDEN', message: 'El material pertenece a otra escuela.' }, 403);
      }
    } else {
      return json({ error: 'FORBIDDEN' }, 403);
    }

    // Cache hit: no gasta cuota ni llama a la IA
    if (mode === 'practice_quiz' && mat.practice_quiz) {
      return json({ questions: mat.practice_quiz, cached: true });
    }
    if (mode === 'study_guide' && mat.study_guide) {
      return json({ guide: mat.study_guide, cached: true });
    }

    // Fuente de texto: extracted_text, o resumen + placas como fallback
    const fallback = [
      mat.ai_summary ?? '',
      (mat.study_cards ?? []).map(c => `${c.title}: ${c.body}`).join('\n'),
    ].filter(Boolean).join('\n\n');
    const source = mat.extracted_text || fallback;
    if (!source.trim()) {
      return json({
        error: 'NO_TEXT',
        message: 'Este material todavía no tiene texto procesado. Pedile a tu docente que lo procese en la Biblioteca.',
      }, 422);
    }

    cacheMaterial = mat;
    text = source;
    title = mat.title;
  }

  // ── Quota (compartida con el chat IA) ──
  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabase
    .from('ia_usage')
    .select('message_count, token_count_in, token_count_out')
    .eq('teacher_id', user.id)
    .eq('usage_date', today)
    .maybeSingle();

  if (usage && usage.message_count >= DAILY_QUOTA) {
    return json({ error: 'QUOTA_EXCEEDED', message: `Alcanzaste el límite de ${DAILY_QUOTA} usos de IA por hoy.` }, 429);
  }

  // ── Build OpenRouter request ──
  const isStructured = mode === 'import_program' || mode === 'extract_questions' || mode === 'study_cards' || mode === 'practice_quiz';
  const model = (isStructured || mode === 'student_summary') ? MODEL_SONNET : MODEL_HAIKU;
  const maxTokens = mode === 'extract_text' ? 10000 : mode === 'import_program' ? 12000 : mode === 'student_summary' ? 3000 : 6000;

  const userContent: unknown[] = [];
  if (pdfBase64) {
    userContent.push({
      type: 'file',
      file: {
        filename: (title || 'documento').replace(/[^\w.\- ]/g, '') + '.pdf',
        file_data: `data:application/pdf;base64,${pdfBase64}`,
      },
    });
  }
  const hints: string[] = [];
  if (title) hints.push(`Título del documento: ${title}`);
  if (cacheMaterial?.subject_name) hints.push(`Materia: ${cacheMaterial.subject_name}`);
  if (context?.subjectName) hints.push(`Materia esperada: ${context.subjectName}`);
  if (context?.courseName) hints.push(`Curso esperado: ${context.courseName}`);

  const textInput = text
    ? (text.length > MAX_TEXT_INPUT ? text.substring(0, MAX_TEXT_INPUT) + '\n[...truncado...]' : text)
    : '';

  userContent.push({
    type: 'text',
    text: [
      hints.join('\n'),
      textInput ? `<documento>\n${textInput}\n</documento>` : '',
      mode === 'extract_text' ? 'Transcribí el documento.'
        : mode === 'summarize' ? 'Resumí el documento.'
        : mode === 'import_program' ? 'Extraé la planificación del programa.'
        : mode === 'student_summary' ? 'Escribí la síntesis del estudiante.'
        : mode === 'study_cards' ? 'Generá las placas de estudio.'
        : mode === 'practice_quiz' ? 'Generá el quiz de práctica.'
        : mode === 'study_guide' ? 'Escribí la guía de estudio.'
        : 'Extraé las preguntas del cuestionario.',
    ].filter(Boolean).join('\n\n'),
  });

  const orBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: PROMPTS[mode] },
      { role: 'user', content: userContent },
    ],
  };
  if (pdfBase64) {
    // "native": el PDF lo procesa el propio modelo (visión de Claude, sirve para escaneos)
    orBody.plugins = [{ id: 'file-parser', pdf: { engine: 'native' } }];
  }
  if (isStructured) {
    const schemas: Record<string, { name: string; schema: unknown }> = {
      import_program: { name: 'programa', schema: PROGRAM_SCHEMA },
      extract_questions: { name: 'preguntas', schema: QUESTIONS_SCHEMA },
      study_cards: { name: 'placas', schema: STUDY_CARDS_SCHEMA },
      practice_quiz: { name: 'quiz_practica', schema: PRACTICE_QUIZ_SCHEMA },
    };
    orBody.response_format = {
      type: 'json_schema',
      json_schema: { ...schemas[mode], strict: true },
    };
  }

  let resp: Response;
  try {
    resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://ensenia-aula.vercel.app',
        'X-Title': 'ENSENIA SMT',
      },
      body: JSON.stringify(orBody),
    });
  } catch (_err) {
    return json({ error: 'API_ERROR', message: 'No se pudo conectar con el servicio de IA.' }, 502);
  }

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('OpenRouter error:', resp.status, errText.substring(0, 500));
    return json({
      error: 'API_ERROR',
      message: resp.status === 429
        ? 'El servicio de IA está sobrecargado. Intentá de nuevo en unos segundos.'
        : resp.status === 402
          ? 'La cuenta de IA se quedó sin crédito. Avisale al administrador.'
          : 'Error del servicio de IA. Intentá de nuevo.',
    }, 502);
  }

  const result = await resp.json();
  const choice = result.choices?.[0];
  const outputText: string = choice?.message?.content ?? '';

  if (!outputText) {
    console.error('OpenRouter sin contenido:', JSON.stringify(result).substring(0, 400));
    return json({ error: 'API_ERROR', message: 'La IA no devolvió contenido. Intentá de nuevo.' }, 502);
  }

  const tokensIn = result.usage?.prompt_tokens ?? 0;
  const tokensOut = result.usage?.completion_tokens ?? 0;

  // ── Update usage ──
  await supabase.from('ia_usage').upsert(
    {
      teacher_id: user.id,
      usage_date: today,
      message_count: (usage?.message_count ?? 0) + 1,
      token_count_in: (usage?.token_count_in ?? 0) + tokensIn,
      token_count_out: (usage?.token_count_out ?? 0) + tokensOut,
    },
    { onConflict: 'teacher_id,usage_date' },
  );

  const truncated = choice?.finish_reason === 'length';

  // ── Shape response by mode ──
  if (mode === 'extract_text') return json({ text: outputText, truncated });
  if (mode === 'summarize' || mode === 'student_summary') return json({ summary: outputText, truncated });

  // ── Guía de estudio: validar y cachear (anti-race: solo si sigue NULL) ──
  if (mode === 'study_guide') {
    if (truncated || !outputText.trim()) {
      return json({ error: 'API_ERROR', message: 'La guía salió incompleta. Intentá de nuevo.' }, 502);
    }
    const { data: won } = await supabase
      .from('library_materials')
      .update({ study_guide: outputText })
      .eq('id', cacheMaterial!.id)
      .is('study_guide', null)
      .select('id');
    if (!won || won.length === 0) {
      // Otro request generó primero: devolvemos el del ganador (mismo contenido para todos)
      const { data: fresh } = await supabase
        .from('library_materials').select('study_guide').eq('id', cacheMaterial!.id).single();
      if (fresh?.study_guide) return json({ guide: fresh.study_guide, cached: true });
    }
    return json({ guide: outputText, cached: false });
  }

  try {
    const parsed = JSON.parse(outputText);
    if (mode === 'import_program') return json({ program: parsed, truncated });
    if (mode === 'study_cards') return json({ cards: parsed.cards ?? [], truncated });

    // ── Quiz de práctica: validar antes de cachear (nunca cachear basura) ──
    if (mode === 'practice_quiz') {
      const questions = (parsed.questions ?? []).filter((q: {
        prompt?: string; options?: string[]; correct_index?: number; explanation?: string;
      }) =>
        q.prompt && Array.isArray(q.options) && q.options.length >= 2 &&
        typeof q.correct_index === 'number' && q.correct_index >= 0 && q.correct_index < q.options.length &&
        q.explanation,
      );
      if (truncated || questions.length < 3) {
        return json({ error: 'API_ERROR', message: 'El quiz salió incompleto. Intentá de nuevo.' }, 502);
      }
      const { data: won } = await supabase
        .from('library_materials')
        .update({ practice_quiz: questions })
        .eq('id', cacheMaterial!.id)
        .is('practice_quiz', null)
        .select('id');
      if (!won || won.length === 0) {
        const { data: fresh } = await supabase
          .from('library_materials').select('practice_quiz').eq('id', cacheMaterial!.id).single();
        if (fresh?.practice_quiz) return json({ questions: fresh.practice_quiz, cached: true });
      }
      return json({ questions, cached: false });
    }

    return json({ questions: parsed.questions ?? [], truncated });
  } catch {
    console.error('Structured output parse failed:', outputText.substring(0, 300));
    return json({ error: 'PARSE_ERROR', message: 'La IA devolvió un formato inesperado. Intentá de nuevo.' }, 502);
  }
});
