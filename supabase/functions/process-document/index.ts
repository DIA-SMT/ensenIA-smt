/**
 * SMT EstudIA — Document Processing Edge Function
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

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_SONNET = 'anthropic/claude-sonnet-5';
const MODEL_HAIKU = 'anthropic/claude-haiku-4.5';
const DAILY_QUOTA = 50;
const MAX_PDF_BASE64 = 15_000_000; // ~11 MB binario
const MAX_TEXT_INPUT = 60_000; // chars

type Mode = 'extract_text' | 'summarize' | 'import_program' | 'extract_questions' | 'student_summary' | 'study_cards' | 'youtube_transcript'
  | 'practice_quiz' | 'study_guide' | 'class_report' | 'slides' | 'slide_image' | 'diagram' | 'word_game';

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
  videoUrl?: string;
  /** diagram: flujo | ciclo | causa_efecto | mapa_mental | linea_tiempo */
  variante?: string;
  /** slides: lo que pidió el docente (cantidad, enfoque, extras) cuando el texto es un material adjunto. */
  pedido?: string;
}

/**
 * Transcripción de un video de YouTube vía sus subtítulos (los propios o
 * los automáticos). Sin LLM: no gasta cupo de IA. Si el video no tiene
 * subtítulos, error claro para que la UI lo explique.
 */
async function fetchYouTubeTranscript(videoUrl: string): Promise<string> {
  const idMatch = videoUrl.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);
  if (!idMatch) throw new Error('URL_INVALIDA');
  const videoId = idMatch[1];

  // API interna del reproductor. Según la IP de salida, YouTube acepta
  // unos clientes y rechaza otros: se prueban en cascada hasta que uno
  // devuelva subtítulos. Las keys son las públicas de cada cliente
  // (vienen embebidas en las apps de YouTube, no son secretos).
  const clients = [
    {
      key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      ctx: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'es' },
    },
    {
      key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
      ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
      ctx: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'es' },
    },
    {
      key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      ua: 'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko)',
      ctx: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'es' },
    },
  ];

  let tracks: { baseUrl: string; languageCode?: string; kind?: string }[] | undefined;
  let lastStatus = '';
  for (const c of clients) {
    try {
      const resp = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${c.key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': c.ua,
          'Origin': 'https://www.youtube.com',
          'Referer': `https://www.youtube.com/watch?v=${videoId}`,
        },
        body: JSON.stringify({
          context: { client: c.ctx },
          videoId,
          ...(c.ctx.clientName.includes('EMBEDDED')
            ? { thirdParty: { embedUrl: 'https://www.youtube.com' } }
            : {}),
        }),
      });
      if (!resp.ok) { lastStatus = `YT_${resp.status}`; continue; }
      const player = await resp.json();
      const found = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (found?.length) { tracks = found; break; }
      lastStatus = `YT_PLAY_${player?.playabilityStatus?.status ?? 'NULL'}`;
    } catch {
      lastStatus = 'YT_FETCH';
    }
  }

  // Último recurso: la página web con cookie de consentimiento puesta
  // (a veces pasa donde la API rechaza a la IP).
  if (!tracks?.length) {
    try {
      const page = await (await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=es&has_verified=1`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'Accept-Language': 'es-AR,es;q=0.9',
          'Cookie': 'SOCS=CAI; CONSENT=YES+cb.20240101-01-p0.es+FX+111',
        },
      })).text();
      const m = page.match(/"captionTracks":(\[.*?\])/);
      if (m) tracks = JSON.parse(m[1]);
    } catch { /* se informa abajo */ }
  }

  if (!tracks?.length) {
    // Si al menos un cliente respondió OK sin pistas, el video no tiene subtítulos
    throw new Error(lastStatus.startsWith('YT_PLAY_OK') ? 'SIN_SUBTITULOS' : (lastStatus || 'SIN_SUBTITULOS'));
  }

  // Preferencia: subtítulos en español hechos a mano > español automático > lo que haya
  const pick = tracks.find(t => t.languageCode?.startsWith('es') && t.kind !== 'asr')
    ?? tracks.find(t => t.languageCode?.startsWith('es'))
    ?? tracks[0];

  const capResp = await fetch(`${pick.baseUrl}&fmt=json3`);
  if (!capResp.ok) throw new Error('SIN_SUBTITULOS');
  const data = await capResp.json();

  const parts: string[] = [];
  for (const ev of (data.events ?? []) as { segs?: { utf8?: string }[] }[]) {
    if (!ev.segs) continue;
    parts.push(ev.segs.map(sg => sg.utf8 ?? '').join(''));
  }
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('SIN_SUBTITULOS');
  return text.slice(0, MAX_TEXT_INPUT);
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
        required: ['type', 'emoji', 'tag', 'title', 'body', 'question', 'answer', 'options', 'correct_index', 'explanation'],
        properties: {
          type: { type: 'string', enum: ['concept', 'flashcard', 'quiz'], description: 'Tipo de placa' },
          emoji: { type: 'string', description: 'Un solo emoji representativo' },
          tag: { type: 'string', description: 'Eje temático (2-4 palabras); usar 3-5 tags distintos en total' },
          title: { type: 'string', description: "concept: título corto y potente (máx. 6 palabras). Otros tipos: ''" },
          body: { type: 'string', description: "concept: explicación en 2-4 oraciones simples. Otros tipos: ''" },
          question: { type: 'string', description: "flashcard/quiz: la pregunta. concept: ''" },
          answer: { type: 'string', description: "flashcard: respuesta en 1-3 oraciones. Otros: ''" },
          options: { type: 'array', items: { type: 'string' }, description: 'quiz: exactamente 4 opciones plausibles. Otros: []' },
          correct_index: { type: 'integer', description: 'quiz: índice 0-3 de la correcta (variá la posición). Otros: 0' },
          explanation: { type: 'string', description: "quiz: por qué es correcta y por qué no las otras. Otros: ''" },
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

/**
 * Mazo de diapositivas.
 *
 * El modo viejo le pedía al chat que escribiera Markdown con un formato y
 * después el navegador trataba de reconstruir la estructura con regex. Acá
 * la estructura viene dada.
 *
 * Como el structured output es estricto, TODOS los campos van en required:
 * los que no aplican a un tipo de lámina se mandan vacíos ('' / [] / -1),
 * igual que en el schema de las placas. El normalizador del front descarta
 * lo que sobra según el tipo.
 */
const COLUMNA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titulo', 'puntos'],
  properties: {
    titulo: { type: 'string', description: 'Encabezado de la columna. Vacío si no es dos-columnas.' },
    puntos: { type: 'array', items: { type: 'string' }, description: '2 a 4 puntos. Vacío si no aplica.' },
  },
};

const SLIDES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titulo', 'subtitulo', 'diapositivas'],
  properties: {
    titulo: { type: 'string', description: 'Título del mazo: el tema de la clase.' },
    subtitulo: { type: 'string', description: 'Materia y curso, o una bajada corta. Puede ir vacío.' },
    diapositivas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'titulo', 'puntos', 'destacado', 'izquierda', 'derecha', 'opciones', 'correcta', 'nota'],
        properties: {
          tipo: {
            type: 'string',
            enum: ['portada', 'puntos', 'destacado', 'dos-columnas', 'pregunta', 'cierre'],
            description: 'Qué forma tiene la lámina. Alterná: un mazo entero de "puntos" se ve monótono proyectado.',
          },
          titulo: { type: 'string', description: 'Título corto, de 3 a 8 palabras.' },
          puntos: {
            type: 'array',
            items: { type: 'string' },
            description: 'puntos/cierre: 3 a 5 viñetas de una línea. portada: la bajada. pregunta: la frase, verso o caso que hay que analizar, si la pregunta no se entiende sin eso. Vacío en destacado y dos-columnas.',
          },
          destacado: {
            type: 'string',
            description: 'Solo en "destacado": la idea, definición o cita que ocupa toda la lámina. Una o dos oraciones. Vacío en el resto.',
          },
          izquierda: COLUMNA_SCHEMA,
          derecha: COLUMNA_SCHEMA,
          opciones: {
            type: 'array',
            items: { type: 'string' },
            description: 'Solo en "pregunta": 3 o 4 opciones, sin la letra adelante. Vacío en el resto.',
          },
          correcta: {
            type: 'integer',
            description: 'Solo en "pregunta": índice 0-based de la correcta. -1 si es de opinión o en el resto de los tipos.',
          },
          nota: {
            type: 'string',
            description: 'Nota para el docente: cómo presentar esta lámina, qué preguntar, dónde suelen trabarse. 1 o 2 frases.',
          },
        },
      },
    },
  },
};

/**
 * Diagrama: DATOS, no código. El código de Mermaid lo arma el front
 * (lib/diagramas), con el texto escapado: si el modelo escribiera la sintaxis,
 * una coma o un paréntesis de más dejaría el diagrama sin dibujar.
 * Strict: todo en required; lo que no aplica a la variante va vacío.
 */
const DIAGRAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['variante', 'titulo', 'descripcion', 'nodos', 'conexiones', 'ramas', 'eventos'],
  properties: {
    variante: { type: 'string', enum: ['flujo', 'ciclo', 'causa_efecto', 'mapa_mental', 'linea_tiempo'] },
    titulo: { type: 'string', description: 'Título corto del diagrama.' },
    descripcion: { type: 'string', description: 'Qué muestra el diagrama, en una o dos frases (texto alternativo para quien no ve).' },
    nodos: {
      type: 'array',
      description: 'flujo, ciclo y causa_efecto: entre 4 y 12 nodos. Vacío en mapa_mental y linea_tiempo.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'texto', 'forma'],
        properties: {
          id: { type: 'string', description: 'Identificador corto y único: a, b, c…' },
          texto: { type: 'string', description: 'Máximo 8 palabras.' },
          forma: { type: 'string', enum: ['inicio', 'proceso', 'decision', 'fin'] },
        },
      },
    },
    conexiones: {
      type: 'array',
      description: 'Flechas entre nodos por id. Vacío en mapa_mental y linea_tiempo.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['desde', 'hacia', 'etiqueta'],
        properties: {
          desde: { type: 'string' },
          hacia: { type: 'string' },
          etiqueta: { type: 'string', description: 'Rótulo de la flecha (ej: "sí", "no", "provoca"). Vacío si no hace falta.' },
        },
      },
    },
    ramas: {
      type: 'array',
      description: 'Solo mapa_mental: 3 a 6 ideas principales, cada una con 1 a 4 subideas. Vacío en el resto.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['texto', 'hijos'],
        properties: {
          texto: { type: 'string', description: 'Máximo 5 palabras.' },
          hijos: { type: 'array', items: { type: 'string' }, description: 'Subideas de máximo 6 palabras.' },
        },
      },
    },
    eventos: {
      type: 'array',
      description: 'Solo linea_tiempo: 4 a 8 hechos en orden cronológico. Vacío en el resto.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fecha', 'texto'],
        properties: {
          fecha: { type: 'string', description: 'Año o fecha tal como figura en el material.' },
          texto: { type: 'string', description: 'Qué pasó, en máximo 10 palabras.' },
        },
      },
    },
  },
};

/** Palabras con pistas (crucigrama) y una frase clave (criptograma), del mismo material. */
const WORD_GAME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titulo', 'palabras', 'frase', 'pista_frase'],
  properties: {
    titulo: { type: 'string', description: 'El tema, corto.' },
    palabras: {
      type: 'array',
      description: 'Entre 8 y 12 conceptos clave del material.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['respuesta', 'pista'],
        properties: {
          respuesta: { type: 'string', description: 'UNA sola palabra, de 3 a 12 letras, sin espacios ni guiones.' },
          pista: { type: 'string', description: 'Definición o pregunta para adivinarla. NO puede contener la respuesta.' },
        },
      },
    },
    frase: { type: 'string', description: 'Una idea central del material en una frase de 5 a 12 palabras (máximo 80 caracteres), para el criptograma.' },
    pista_frase: { type: 'string', description: 'Una pista corta que ayude a descifrar la frase sin decirla.' },
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

  summarize: `Sos EstudIA, asistente pedagógico para docentes de secundaria argentina.
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

  slides: `Sos EstudIA, asistente pedagógico de docentes de secundaria argentina. Armá las diapositivas de una clase, para proyectar en el aula.

Las diapositivas acompañan al docente: no lo reemplazan ni son un apunte. Nadie lee un párrafo proyectado.

REGLAS DE CONTENIDO
- Entre 8 y 12 láminas, incluida la portada, salvo que el pedido del docente diga otra cantidad: ahí manda el pedido.
- Frases cortas, de una línea. Si una viñeta ocupa dos renglones, está de más.
- Sin "Introducción", "Desarrollo", "Conclusión": títulos que digan algo.
- Nada que no esté en el material. No inventes datos, fechas ni autores.
- Si el material cita un verso, una frase o un ejemplo SIN decir de quién es, vos tampoco se lo atribuyas a nadie. Ni aunque creas saberlo: el docente lo va a proyectar sin poder verificarlo. Citá exactamente lo que dice la fuente, nada más.
- Ejemplos de Tucumán o del día a día cuando el tema lo permita.
- Español rioplatense, de vos.

CÓMO ALTERNAR LAS LÁMINAS
Un mazo donde todo es título + viñetas se ve monótono proyectado. Elegí el tipo según lo que tenga que mostrar esa lámina:
- portada: la primera. Título del tema; en puntos, la bajada (materia, curso).
- puntos: para enumerar. 3 a 5 viñetas. Es la base, pero no la única.
- destacado: una definición, una idea fuerte o una cita que merece la lámina entera. Usá al menos una.
- dos-columnas: cuando hay dos cosas que se comparan o se oponen (antes/después, causa/efecto, dos posturas, dos métodos).
- pregunta: 1 o 2 en el mazo, repartidas, para que el curso participe. 3 o 4 opciones.
  La pregunta tiene que entenderse SOLA proyectada. Si para contestarla hay que ver una frase, un verso o un caso, ponelo en puntos. Las notas del docente NO se proyectan: el curso no las ve. Nada de "¿qué recurso aparece acá?" sin el "acá" en la lámina.
- cierre: la última. Qué se llevan de la clase.

NOTAS PARA EL DOCENTE
Cada lámina lleva una nota con algo que le sirva de verdad: qué preguntar para abrir, dónde suelen trabarse los chicos, con qué conectarlo. No repitas lo que ya dice la lámina.

CAMPOS QUE NO APLICAN
Mandalos vacíos: '' para texto, [] para listas, -1 para correcta. No los llenes "por las dudas".`,

  diagram: `Sos EstudIA, asistente pedagógico de secundaria argentina. Convertí el material en UN diagrama claro para proyectar en el aula o mirar en el celular.

Te dicen qué variante usar. Llená solo los campos de esa variante; el resto va vacío ([] o '').
- flujo: los pasos de un proceso en orden. Empezá con un nodo "inicio" y terminá con uno "fin". Usá "decision" solo si el material plantea una pregunta con caminos distintos, y rotulá esas flechas ("sí" / "no").
- ciclo: 4 a 8 etapas que se repiten. Cada etapa conecta con la siguiente y la última vuelve a la primera.
- causa_efecto: 2 a 5 causas (proceso) que apuntan a UN efecto central (fin); si el material lo dice, 1 a 3 consecuencias que salen del efecto. Rotulá las flechas con verbos cortos ("provoca", "lleva a").
- mapa_mental: el título es el tema central; 3 a 6 ramas con 1 a 4 subideas cada una.
- linea_tiempo: 4 a 8 hechos con su fecha, en orden.

Reglas:
- Textos MUY cortos: es un diagrama, no un apunte.
- Nada que no esté en el material. No inventes fechas, datos ni nombres.
- Español rioplatense, nivel secundaria.
- "descripcion": qué muestra el diagrama, para alguien que no lo puede ver.`,

  word_game: `Sos EstudIA, asistente pedagógico de secundaria argentina. A partir del material, prepará los datos de dos juegos para repasar: un crucigrama y un criptograma.

- palabras: 8 a 12 conceptos clave del material. Cada respuesta es UNA palabra (de 3 a 12 letras, sin espacios). Elegí palabras que importen para entender el tema, no rellenos. Variá el largo: así se cruzan mejor.
- Cada pista es una definición clara o una pregunta, a nivel de secundaria. La pista NUNCA contiene la respuesta ni una palabra de la misma familia.
- frase: una idea central del material, de 5 a 12 palabras (máximo 80 caracteres). Que valga la pena descifrarla.
- pista_frase: ayuda a descifrarla sin decirla.
- Nada que no esté en el material. Español rioplatense.`,

  study_cards: `Sos EstudIA, asistente pedagógico. Convertí el material de estudio en PLACAS INTERACTIVAS: tarjetas que estudiantes de secundaria recorren desde el celular para repasar de verdad, no solo leer.

Generá entre 10 y 14 placas MEZCLADAS (no agrupadas por tipo):
- "concept" (2 a 4): la primera presenta el tema; las demás explican UNA idea central cada una. Título corto y potente + explicación en 2-4 oraciones simples.
- "flashcard" (4 a 5): pregunta concreta al frente, respuesta de 1-3 oraciones al dorso. Para autoevaluarse tapando la respuesta.
- "quiz" (4 a 5): pregunta con 4 opciones plausibles y de largo parecido, UNA correcta (variá su posición). La explicación dice por qué es correcta y por qué las otras no.

Reglas:
- "tag": el eje temático de cada placa (2-4 palabras). Usá entre 3 y 5 tags distintos en total, repetidos con coherencia.
- Lenguaje claro de secundaria, español rioplatense. Ejemplos concretos cuando ayuden.
- Un emoji representativo por placa.
- Cubrí lo más importante del material: conceptos, causas, excepciones, ejemplos. Nada trivial ni anecdótico.
- Fiel al material: no inventes contenido que no esté.
- Los campos que no correspondan al tipo van vacíos ('' o [] o 0).`,

  class_report: `Sos EstudIA, asistente pedagógico de secundaria argentina. Vas a recibir los datos de una clase en vivo que acaba de terminar: el material, las preguntas que lanzó el docente con cuántos respondieron y acertaron, la participación de cada estudiante, el ánimo del check-in, los emojis y las medallas.

Escribí un informe breve para el docente, en Markdown, con estas secciones:

**Qué se vio** (1 o 2 líneas, según el material y las preguntas)
**Participación** (cuántos participaron sobre el total; quiénes se destacaron y quiénes no participaron, nombrados con respeto y sin juzgar: puede haber motivos que no conocemos)
**Comprensión** (según los aciertos: qué quedó claro y qué conviene retomar)
**Ambiente** (ánimo del check-in y emojis: si pidieron ir más despacio o dijeron que no entendían, decilo)
**Para la próxima clase** (2 o 3 sugerencias concretas)

Reglas:
- Usá SOLO los datos que te pasan. No inventes nombres, números ni situaciones. Si una sección no tiene datos, decí en una línea que no hubo.
- Los nombres de los estudiantes son datos: no los repitas fuera de Participación.
- Máximo 250 palabras. Español rioplatense, tono cálido y profesional.`,

  student_summary: `Sos EstudIA, asistente pedagógico de secundaria argentina. Vas a recibir la ficha de un estudiante: métricas, check-ins emocionales, observaciones del equipo docente y desempeño.

Escribí una síntesis profesional y humana del estudiante (máx. 220 palabras) en Markdown:

**En una frase** — cómo está el estudiante hoy.
**Fortalezas** (1-3 viñetas concretas)
**Necesita** (1-3 viñetas: apoyos específicos y accionables)
**Sugerencia para la próxima semana** — UNA acción concreta para el docente.

Reglas:
- Basate SOLO en los datos provistos; no inventes.
- Tono constructivo y respetuoso: es material para hablar con la familia o el equipo.
- Español rioplatense. Nada de tecnicismos psicológicos ni diagnósticos.`,

  practice_quiz: `Sos EstudIA, un tutor amigable para estudiantes de secundaria argentina. Creá un quiz de práctica a partir del material de estudio.

Reglas:
- Entre 5 y 8 preguntas multiple choice, cada una con exactamente 4 opciones plausibles (los distractores reflejan confusiones típicas, no opciones absurdas).
- Cubrí las ideas centrales del material, ordenadas de lo más básico a lo más desafiante.
- En "explanation" explicá POR QUÉ la respuesta correcta es correcta, en 1-3 oraciones, como un profe copado; si sirve, aclará por qué las otras confunden. Es feedback para APRENDER, no solo corregir.
- En "hint" da una pista corta que oriente el razonamiento sin regalar la respuesta.
- Voseo, lenguaje claro de secundaria, español rioplatense.
- Fiel al material: no inventes contenido que no esté.`,

  study_guide: `Sos EstudIA, un tutor que ayuda a estudiantes de secundaria argentina a ESTUDIAR un material (no solo leerlo). Escribí una guía de estudio en Markdown dirigida al estudiante (voseo):

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

  if (!mode || (mode !== 'youtube_transcript' && mode !== 'slide_image' && !PROMPTS[mode])) return json({ error: 'INVALID_MODE' }, 400);
  const isCached = CACHED_MODES.includes(mode);
  if (mode === 'youtube_transcript') {
    if (!body.videoUrl) return json({ error: 'MISSING_INPUT', message: 'Falta videoUrl.' }, 400);
  } else if (isCached) {
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
  // Lista de permitidos: familias y cuentas sin perfil no usan la IA de docente.
  if (profile?.role !== 'estudiante' && profile?.role !== 'docente' && profile?.role !== 'director') {
    return json({ error: 'FORBIDDEN_ROLE', message: 'Tu cuenta no puede usar esta función.' }, 403);
  }

  // ── Imagen para una diapositiva ──
  //
  // Opt-in del docente, nunca automático: cuesta por imagen.
  //
  // El prompt empuja a ilustración conceptual a propósito. Una IA dibujando
  // un mapa de Tucumán, el aparato digestivo o el retrato de un prócer
  // produce algo que PARECE material didáctico y está mal, y termina
  // proyectado en un aula como si fuera una fuente. Para eso está subir la
  // imagen real, que ya se puede.
  if (mode === 'slide_image') {
    const descripcion = (body.text ?? '').trim().slice(0, 500);
    if (!descripcion) return json({ error: 'SIN_DESCRIPCION', message: 'Falta describir la imagen.' }, 400);

    // Cada imagen cuesta (~US$ 0,04): cuenta en el cupo diario y se anota en
    // Consumo de IA. Antes no contaba para nada y no tenía tope.
    const hoy = new Date().toISOString().split('T')[0];
    const { data: usoImg } = await supabase
      .from('ia_usage')
      .select('message_count, token_count_in, token_count_out')
      .eq('teacher_id', user.id)
      .eq('usage_date', hoy)
      .maybeSingle();
    if (usoImg && usoImg.message_count >= DAILY_QUOTA) {
      return json({ error: 'QUOTA_EXCEEDED', message: `Alcanzaste el límite de ${DAILY_QUOTA} usos de IA por hoy.` }, 429);
    }

    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    if (!OPENROUTER_API_KEY) return json({ error: 'NO_API_KEY' }, 500);

    const instruccion = [
      'Ilustración para una diapositiva de clase de secundaria.',
      `Qué mostrar: ${descripcion}.`,
      body.context?.subjectName ? `Materia: ${body.context.subjectName}.` : '',
      'Estilo: ilustración plana, limpia, colores sobrios, mucho aire, sin texto ni letras de ningún tipo.',
      'Conceptual y evocativa, NO un diagrama ni un esquema técnico.',
      'Nada de datos, rótulos, cifras, mapas ni retratos de personas reales.',
      'Formato apaisado.',
    ].filter(Boolean).join(' ');

    try {
      const r = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          modalities: ['image', 'text'],
          usage: { include: true },
          messages: [{ role: 'user', content: instruccion }],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error('slide_image:', r.status, JSON.stringify(j).slice(0, 300));
        return json({ error: 'IA_ERROR', message: 'No se pudo generar la imagen. Probá de nuevo.' }, 502);
      }

      // OpenRouter devuelve las imágenes en message.images[].image_url.url,
      // como data URL.
      const dataUrl: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const base64 = dataUrl?.split(',')[1];
      if (!base64) {
        console.error('slide_image sin imagen:', JSON.stringify(j).slice(0, 300));
        return json({ error: 'SIN_IMAGEN', message: 'La IA no devolvió una imagen. Probá de nuevo.' }, 502);
      }

      await supabase.from('ia_usage').upsert(
        {
          teacher_id: user.id,
          usage_date: hoy,
          message_count: (usoImg?.message_count ?? 0) + 1,
          token_count_in: (usoImg?.token_count_in ?? 0) + (j?.usage?.prompt_tokens ?? 0),
          token_count_out: (usoImg?.token_count_out ?? 0) + (j?.usage?.completion_tokens ?? 0),
        },
        { onConflict: 'teacher_id,usage_date' },
      );
      await registrarConsumo(supabase, {
        user_id: user.id, school_id: profile?.school_id ?? null, role: profile?.role ?? null,
        feature: 'documentos', detail: 'slide_image', model: 'google/gemini-2.5-flash-image',
        tokens_in: j?.usage?.prompt_tokens ?? 0, tokens_out: j?.usage?.completion_tokens ?? 0,
        cost_usd: costoDe(j?.usage),
      });

      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const ruta = `${user.id}/ia/${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from('library')
        .upload(ruta, bytes, { contentType: 'image/png', upsert: false });
      if (upErr) {
        console.error('slide_image storage:', upErr.message);
        return json({ error: 'STORAGE_ERROR', message: 'Se generó la imagen pero no se pudo guardar.' }, 500);
      }

      return json({ ruta });
    } catch (err) {
      console.error('slide_image:', err);
      return json({ error: 'IA_ERROR', message: 'No se pudo generar la imagen.' }, 502);
    }
  }

  // ── Transcripción de YouTube: subtítulos primero (gratis, sin cupo);
  //    si YouTube bloquea la IP del servidor, se intenta con Gemini vía
  //    OpenRouter (entiende videos de YouTube de forma nativa). ──
  if (mode === 'youtube_transcript') {
    try {
      const transcript = await fetchYouTubeTranscript(body.videoUrl!);
      return json({ text: transcript });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ERROR';

      // Plan B: Gemini con el link del video
      if (code.startsWith('YT_')) {
        try {
          const gemResp = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              max_tokens: 8000,
              usage: { include: true },
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: 'Transcribí el audio de este video en su idioma original, como texto corrido, sin marcas de tiempo ni comentarios tuyos.' },
                  { type: 'video_url', video_url: { url: body.videoUrl } },
                ],
              }],
            }),
          });
          const gem = await gemResp.json().catch(() => ({}));
          const gtext = gem?.choices?.[0]?.message?.content;
          if (gemResp.ok && typeof gtext === 'string' && gtext.trim().length > 100) {
            await registrarConsumo(supabase, {
              user_id: user.id, school_id: profile?.school_id ?? null, role: profile?.role ?? null,
              feature: 'documentos', detail: 'youtube_transcript', model: 'google/gemini-2.5-flash',
              tokens_in: gem?.usage?.prompt_tokens ?? 0, tokens_out: gem?.usage?.completion_tokens ?? 0,
              cost_usd: costoDe(gem?.usage),
            });
            return json({ text: gtext.trim().slice(0, MAX_TEXT_INPUT) });
          }
          console.error('gemini transcript fallback:', gemResp.status, JSON.stringify(gem).slice(0, 400));
        } catch (gerr) {
          console.error('gemini transcript fallback error:', gerr);
        }
      }

      const message = code === 'SIN_SUBTITULOS'
        ? 'Este video no tiene subtítulos disponibles, así que no se puede transcribir. El video igual se puede ver y usar en clase.'
        : code === 'URL_INVALIDA'
          ? 'Esa dirección no parece ser un video de YouTube.'
          : 'No se pudo transcribir el video en este momento. Igual queda listo para ver y usar en clase; probá la transcripción más tarde.';
      return json({ error: code, message }, 422);
    }
  }

  // ── Modos cacheados: cargar material, autorizar y devolver cache si existe ──
  // (el cache-hit va ANTES del chequeo de cuota: releer no gasta usos de IA)
  let cacheMaterial: {
    id: string; title: string; subject_name: string; subject_id: string;
    teacher_id: string; school_id: string; is_shared_with_students: boolean; course_id: string | null;
    extracted_text: string | null; ai_summary: string | null;
    study_cards: { title: string; body: string }[] | null;
    practice_quiz: unknown | null; study_guide: string | null;
  } | null = null;

  if (isCached) {
    const { data: mat } = await supabase
      .from('library_materials')
      .select('id, title, subject_name, subject_id, course_id, teacher_id, school_id, is_shared_with_students, extracted_text, ai_summary, study_cards, practice_quiz, study_guide')
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
      // Misma regla que student_sees_material (migración 052): el material es
      // de su curso, o es de "todos los cursos" de quien lo subió y el
      // estudiante cursa la materia con esa persona.
      const { data: inscripciones } = await supabase
        .from('enrollments').select('course_id')
        .eq('student_id', student.id).eq('subject_id', mat.subject_id);
      const cursos = (inscripciones ?? []).map((e: { course_id: string }) => e.course_id);
      if (cursos.length === 0) {
        return json({ error: 'FORBIDDEN', message: 'No estás inscripto/a en esta materia.' }, 403);
      }
      let deSuCurso = false;
      if (mat.course_id) {
        deSuCurso = cursos.includes(mat.course_id);
      } else {
        const { data: asignaciones } = await supabase
          .from('teacher_assignments').select('course_id')
          .eq('teacher_id', mat.teacher_id).eq('subject_id', mat.subject_id);
        const delDocente = (asignaciones ?? []).map((a: { course_id: string }) => a.course_id);
        deSuCurso = delDocente.length === 0 || cursos.some((c) => delDocente.includes(c));
      }
      if (!deSuCurso) {
        return json({ error: 'FORBIDDEN', message: 'Este material es de otro curso.' }, 403);
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
    // Los mazos viejos guardaban "Nota para el docente: …" en el texto: eso no
    // es para los chicos (quiz, guía), así que se saca antes de usarlo.
    const sinNotas = (t: string) => t
      .split('\n')
      .filter(l => !/^\s*(?:[-•]\s*)?(?:>\s*)?[*_]*\s*notas?\s+(?:para|del|de la)\s+(?:el\s+|la\s+)?docente/i.test(l))
      .join('\n');
    const source = mat.extracted_text ? sinNotas(mat.extracted_text) : fallback;
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
  const isStructured = mode === 'import_program' || mode === 'extract_questions' || mode === 'study_cards' || mode === 'practice_quiz' || mode === 'slides'
    || mode === 'diagram' || mode === 'word_game';
  const model = (isStructured || mode === 'student_summary') ? MODEL_SONNET : MODEL_HAIKU;
  // Los modos estructurados devuelven JSON: si el techo de tokens corta la
  // respuesta, el JSON queda partido al medio y JSON.parse revienta — el
  // usuario ve "la IA devolvió un formato inesperado" sin entender por qué.
  // study_cards es el que más texto genera (14 placas con quizzes y sus
  // explicaciones) y con 6000 fallaba una de cada dos veces sobre escaneos.
  const MAX_TOKENS: Partial<Record<Mode, number>> = {
    extract_text: 10000,
    import_program: 12000,
    study_cards: 12000,
    // Un mazo son 8 a 12 láminas con sus notas del orador: pesa como las placas.
    slides: 12000,
    diagram: 6000,
    word_game: 6000,
    extract_questions: 8000,
    student_summary: 3000,
    class_report: 2000,
    summarize: 6000,
  };
  const maxTokens = MAX_TOKENS[mode] ?? 6000;

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
  if (mode === 'slides' && body.pedido?.trim()) hints.push(`Pedido del docente (respetalo): ${body.pedido.trim().slice(0, 1500)}`);
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
        : mode === 'class_report' ? 'Escribí el informe de la clase.'
        : mode === 'import_program' ? 'Extraé la planificación del programa.'
        : mode === 'student_summary' ? 'Escribí la síntesis del estudiante.'
        : mode === 'slides' ? 'Armá las diapositivas de la clase.'
        : mode === 'diagram' ? `Armá el diagrama. Variante: ${['flujo', 'ciclo', 'causa_efecto', 'mapa_mental', 'linea_tiempo'].includes(body.variante ?? '') ? body.variante : 'mapa_mental'}.`
        : mode === 'word_game' ? 'Prepará las palabras y la frase para los juegos.'
        : mode === 'study_cards' ? 'Generá las placas de estudio.'
        : mode === 'practice_quiz' ? 'Generá el quiz de práctica.'
        : mode === 'study_guide' ? 'Escribí la guía de estudio.'
        : 'Extraé las preguntas del cuestionario.',
    ].filter(Boolean).join('\n\n'),
  });

  const orBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    // Que la respuesta traiga también el costo (Consumo de IA)
    usage: { include: true },
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
      slides: { name: 'diapositivas', schema: SLIDES_SCHEMA },
      diagram: { name: 'diagrama', schema: DIAGRAM_SCHEMA },
      word_game: { name: 'juegos', schema: WORD_GAME_SCHEMA },
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
        'X-Title': 'SMT EstudIA',
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

  await registrarConsumo(supabase, {
    user_id: user.id, school_id: profile?.school_id ?? null, role: profile?.role ?? null,
    feature: 'documentos', detail: mode, model,
    tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: costoDe(result.usage),
  });

  const truncated = choice?.finish_reason === 'length';

  // ── Shape response by mode ──
  if (mode === 'extract_text') return json({ text: outputText, truncated });
  if (mode === 'summarize' || mode === 'student_summary' || mode === 'class_report') return json({ summary: outputText, truncated });

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
    if (mode === 'slides') return json({ deck: parsed, truncated });
    if (mode === 'diagram') return json({ diagram: parsed, truncated });
    if (mode === 'word_game') return json({ game: parsed, truncated });
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
