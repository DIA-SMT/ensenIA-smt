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
 *  - armar_actividad:   tema de la planificación → { titulo, consigna, partes[] con puntos } (063)
 *  - practice_quiz:     materialId → quiz pedagógico para estudiantes, CACHEADO en el material (1 sola generación)
 *  - study_guide:       materialId → guía de estudio para estudiantes, CACHEADA en el material
 *  - juegos:            materialId → banco de los juegos para repasar (072), CACHEADO en el material
 *  - slides / study_cards: material (o solo el tema) → mazo de diapositivas / placas de repaso
 *
 * Las opciones de toda pregunta generada se mezclan de este lado (_ordenar.ts).
 *
 * Nota: llamamos a Claude vía OpenRouter (chat completions) con fetch crudo,
 * mismo estilo que ia-chat, sin dependencias npm en el bundle de Deno.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { padronDeEscuela, Seudonimos } from '../migue/_datos-personales.ts';
import { acomodarPlacas, mezclarOpciones } from './_ordenar.ts';
import { bancoAlcanza, limpiarBanco } from './_juegos.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_SONNET = 'anthropic/claude-sonnet-5';
const MODEL_HAIKU = 'anthropic/claude-haiku-4.5';
// Usos de IA por día, compartidos entre ia-chat y process-document (misma
// tabla ia_usage). El personal tiene 15 y los estudiantes 50: decidido el
// 23/10/2026 para cuidar el gasto en el piloto (antes eran 50 para todos).
// El número que ve el docente sale de src/lib/usoIA.ts: cambiarlos juntos.
const CUPO_DIARIO_EQUIPO = 15;
const CUPO_DIARIO_ESTUDIANTE = 50;
const cupoDiario = (rol: string | null | undefined) =>
  rol === 'estudiante' ? CUPO_DIARIO_ESTUDIANTE : CUPO_DIARIO_EQUIPO;
const MAX_PDF_BASE64 = 15_000_000; // ~11 MB binario
const MAX_TEXT_INPUT = 60_000; // chars

type Mode = 'extract_text' | 'summarize' | 'import_program' | 'extract_questions' | 'student_summary' | 'study_cards' | 'youtube_transcript'
  | 'practice_quiz' | 'study_guide' | 'class_report' | 'slides' | 'slide_image' | 'diagram' | 'word_game'
  | 'armar_actividad' | 'juegos';

/** Modos habilitados para el rol estudiante (siempre cacheados por material). */
const STUDENT_MODES: Mode[] = ['practice_quiz', 'study_guide', 'juegos'];
/** Modos que se cachean en library_materials y reciben materialId. */
const CACHED_MODES: Mode[] = ['practice_quiz', 'study_guide', 'juegos'];

interface ProcessRequest {
  mode: Mode;
  pdfBase64?: string;
  text?: string;
  title?: string;
  materialId?: string;
  context?: { subjectName?: string; courseName?: string };
  videoUrl?: string;
  /** diagram: flujo | ciclo | causa_efecto | mapa_mental | linea_tiempo · armar_actividad: actividad | tp | evaluacion */
  variante?: string;
  /** slides y armar_actividad: lo que pidió el docente (cantidad, enfoque, extras). */
  pedido?: string;
  /** slides y study_cards: el tema de la planificación, para que el resultado apunte a sus objetivos */
  tema?: { titulo?: string; unidad?: string; objetivos?: string[] };
  /** slides: 'tema' si no hay material (el texto es solo el tema y la IA puede usar lo que sabe) */
  fuente?: 'material' | 'tema';
  /** extract_text de a tandas: el mismo id en todas las partes de un documento, y el número de parte (1, 2…) */
  documento?: string;
  parte?: number;
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
          body: { type: 'string', description: "concept: 2 o 3 oraciones cortas, hasta 280 caracteres. Otros tipos: ''" },
          question: { type: 'string', description: "flashcard/quiz: la pregunta. concept: ''" },
          answer: { type: 'string', description: "flashcard: respuesta en 1 o 2 oraciones. Otros: ''" },
          options: { type: 'array', items: { type: 'string' }, description: 'quiz: exactamente 4 opciones plausibles, del mismo largo. Otros: []' },
          correct_index: { type: 'integer', description: 'quiz: índice 0-3 de la correcta. Otros: 0' },
          explanation: { type: 'string', description: "quiz: por qué es la correcta y qué confunde de la incorrecta más tentadora, sin nombrar letras ni posiciones. Otros: ''" },
        },
      },
    },
  },
};

/** El banco de los juegos para repasar (072). Cada lista puede ir vacía si el material no da para ese juego. */
const JUEGOS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pares', 'secuencias', 'clasificaciones', 'completar', 'verdadero_falso'],
  properties: {
    pares: {
      type: 'array',
      description: 'Unir: 6 a 8 pares.',
      items: {
        type: 'object', additionalProperties: false, required: ['termino', 'definicion'],
        properties: {
          termino: { type: 'string', description: 'Hasta 4 palabras, o una fórmula corta.' },
          definicion: { type: 'string', description: 'Hasta 90 caracteres. No repite el término.' },
        },
      },
    },
    secuencias: {
      type: 'array',
      description: 'Ordenar: 0 a 2. Vacío si el material no tiene un orden real.',
      items: {
        type: 'object', additionalProperties: false, required: ['titulo', 'pasos'],
        properties: {
          titulo: { type: 'string', description: 'Qué se ordena ("Los pasos para…").' },
          pasos: { type: 'array', items: { type: 'string' }, description: '4 a 6, en el orden correcto, hasta 70 caracteres cada uno.' },
        },
      },
    },
    clasificaciones: {
      type: 'array',
      description: 'Clasificar: 0 a 2. Vacío si el material no tiene categorías claras.',
      items: {
        type: 'object', additionalProperties: false, required: ['titulo', 'grupos'],
        properties: {
          titulo: { type: 'string', description: 'La consigna ("¿Publicidad o propaganda?").' },
          grupos: {
            type: 'array', description: '2 o 3 grupos.',
            items: {
              type: 'object', additionalProperties: false, required: ['nombre', 'elementos'],
              properties: {
                nombre: { type: 'string' },
                elementos: { type: 'array', items: { type: 'string' }, description: '3 a 5, hasta 50 caracteres.' },
              },
            },
          },
        },
      },
    },
    completar: {
      type: 'array',
      description: 'Completar: 5 o 6 frases.',
      items: {
        type: 'object', additionalProperties: false, required: ['frase', 'respuesta', 'distractores'],
        properties: {
          frase: { type: 'string', description: 'Con ___ donde va la respuesta. Hasta 140 caracteres.' },
          respuesta: { type: 'string', description: '1 a 3 palabras.' },
          distractores: { type: 'array', items: { type: 'string' }, description: 'Exactamente 3, del mismo tipo y largo que la respuesta.' },
        },
      },
    },
    verdadero_falso: {
      type: 'array',
      description: 'Contrarreloj: 10 a 12, la mitad verdaderas.',
      items: {
        type: 'object', additionalProperties: false, required: ['afirmacion', 'verdadera', 'explicacion'],
        properties: {
          afirmacion: { type: 'string', description: 'Hasta 120 caracteres.' },
          verdadera: { type: 'boolean' },
          explicacion: { type: 'string', description: 'Una oración: por qué es verdadera o falsa.' },
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
            description: 'Qué forma tiene la lámina.',
          },
          titulo: { type: 'string', description: 'De 3 a 8 palabras. En "pregunta", la pregunta entera.' },
          puntos: {
            type: 'array',
            items: { type: 'string' },
            description: 'puntos/cierre: las viñetas. portada: materia y curso. pregunta: un solo elemento con el texto, verso o caso a analizar, o vacío. Vacío en destacado y dos-columnas.',
          },
          destacado: {
            type: 'string',
            description: 'Solo en "destacado": una o dos oraciones. Vacío en el resto.',
          },
          izquierda: COLUMNA_SCHEMA,
          derecha: COLUMNA_SCHEMA,
          opciones: {
            type: 'array',
            items: { type: 'string' },
            description: 'Solo en "pregunta": 3 o 4 opciones del mismo largo, sin letra adelante. Vacío en el resto.',
          },
          correcta: {
            type: 'integer',
            description: 'Solo en "pregunta": índice desde 0 de la correcta. -1 si es de opinión o en el resto de los tipos.',
          },
          nota: {
            type: 'string',
            description: 'Para el docente (el curso no la ve). Puede ir vacía si el pedido no quiere notas.',
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

/** Una actividad, un TP o una evaluación por partes, con puntos (063). */
const ACTIVIDAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titulo', 'consigna', 'partes'],
  properties: {
    titulo: { type: 'string' },
    consigna: { type: 'string', description: 'Para el estudiante, en Markdown: qué va a hacer y cómo se califica.' },
    partes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'prompt', 'options', 'correct_index', 'points'],
        properties: {
          type: { type: 'string', enum: ['multiple_choice', 'open'] },
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, description: 'Vacío en las de desarrollo.' },
          correct_index: { type: 'integer', description: 'Posición (desde 0) de la correcta; 0 en las de desarrollo.' },
          points: { type: 'number', description: 'Puntos de la parte: entero o con medio punto.' },
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

  slides: `Sos EstudIA. Armás las diapositivas que un docente de secundaria argentina proyecta en el aula. Acompañan lo que el docente dice: no son un apunte. Nadie lee un párrafo proyectado.

DE DÓNDE SALE EL CONTENIDO
- <documento>: es el material del docente y todo sale de ahí. Si cita un verso, una frase o un ejemplo sin decir de quién es, no se lo atribuyas a nadie, aunque creas saberlo: el docente lo proyecta sin poder verificarlo. Si falta algo importante para el tema, avisalo en una nota.
- <tema> (no hay material): usá el contenido escolar estándar del tema, al nivel del curso. Si hace falta un dato que no podés asegurar, escribí [completar] en la lámina y avisalo en la nota.
- Podés inventar situaciones y ejemplos para explicar (un caso del barrio, un problema con números redondos), siempre como hipotéticos. Nunca agregues hechos: cifras, fechas, nombres, autores, citas ni datos de Tucumán que no estén en la fuente.
- Si vienen objetivos del tema, el mazo apunta a ellos.

EL RECORRIDO
1. portada: el tema; en puntos, la materia y el curso tal como te los pasan (si no vienen, vacío).
2. Para arrancar: una situación o pregunta cercana (lo que viven a esa edad) que traiga lo que ya saben. Si es de opinión, pregunta con correcta -1; si es abierta, destacado.
3. El desarrollo, una idea por lámina, de lo concreto a lo abstracto. Si el tema es un procedimiento (cálculo, análisis, resolución), un ejemplo resuelto paso a paso antes de pedirles que lo hagan.
4. Después de las ideas centrales, una pregunta para ver si se entendió: las opciones incorrectas son errores que los chicos cometen de verdad con este tema.
5. cierre: 2 o 3 ideas para llevarse y una pregunta de salida que se conteste en una línea.

TIPOS DE LÁMINA (alterná: un mazo todo de viñetas aburre proyectado)
- puntos: 3 a 5 viñetas.
- destacado: una definición, idea fuerte o cita que merece la lámina entera. Al menos una.
- dos-columnas: dos cosas que se comparan u oponen (antes/después, causa/efecto, dos posturas).
- pregunta: 1 a 3 en el mazo. El titulo es la pregunta entera y no adelanta la respuesta. Tiene que entenderse sola proyectada (las notas no se ven): si hace falta un texto, verso, caso o dato, va en puntos como un solo elemento (versos separados con " / "). 3 o 4 opciones de hasta 8 palabras, sin "todas/ninguna de las anteriores".

ESCRITURA
- Títulos que dicen la idea ("La propaganda busca cambiar conductas"), no rótulos ("Propaganda"); nada de "Introducción" o "Conclusión".
- Viñetas de una línea. Lo que necesita explicación va a la nota.
- Fórmulas en texto plano (v = d / t, x², H₂O), sin LaTeX.
- Español rioplatense, de vos, al nivel del curso.

NOTA DE CADA LÁMINA (para el docente, el curso no la ve)
Lo que le sirve para darla y no está escrito en ella: qué preguntar, dónde se traban los chicos, un ejemplo más. 1 o 2 frases. En una pregunta: cuál es la correcta y qué confusión hay detrás de la incorrecta más tentadora, nombrándolas por lo que dicen, nunca por letra ni posición (las opciones se mezclan).

El pedido del docente manda en cantidad, enfoque, cuánto texto y extras; nunca habilita inventar hechos. Sin cantidad pedida: 8 a 12 láminas con la portada. Si hay notas de cómo trabaja el docente, respetalas.`,

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

  study_cards: `Sos EstudIA. Convertís un material en PLACAS que estudiantes de secundaria argentina recorren solos en el celular para repasar. Se aprende recordando, no releyendo: la mayoría de las placas le piden que traiga la respuesta de memoria.

QUÉ ENTRA
- Lo que hay que saber del tema: conceptos, relaciones, causas, procedimientos, ejemplos que aclaran. Nada trivial ni anecdótico.
- Nada de la organización del curso aunque esté en el material: números de clase, fechas, criterios de evaluación, consignas o reflexiones para el docente, "según la unidad…". Si el material es una planificación, tomá solo los contenidos.
- Fiel al material: no agregues hechos que no estén (cifras, fechas, nombres, autores, citas). Sí podés inventar casos y ejemplos para practicar, como hipotéticos. Si vienen objetivos del tema, priorizá lo que apunta a ellos.

LAS PLACAS: 10 a 14, mezcladas (nunca tres seguidas del mismo tipo)
- concept (2 a 4): la primera presenta el tema; cada una explica UNA sola idea. title de hasta 6 palabras que diga la idea; body de 2 o 3 oraciones cortas, hasta 280 caracteres (se lee en un celular).
- flashcard (4 o 5): una pregunta que se contesta de memoria en una o dos oraciones. Mejor "¿por qué…?", "¿qué diferencia hay…?", "¿qué pasa si…?" que "¿qué es…?". Nada de "nombrá un ejemplo del material".
- quiz (4 o 5): poné a prueba la idea con un caso o ejemplo nuevo, no con la frase del texto. La pregunta (con su caso) hasta 200 caracteres.
  - 4 opciones de hasta 12 palabras; las incorrectas son errores que un estudiante comete de verdad con este tema, nunca absurdas ni de chiste.
  - Todas del mismo largo y la misma forma: si la correcta lleva "porque…", todas lo llevan. La correcta no puede ser la más larga ni la más completa.
  - Sin "todas/ninguna de las anteriores" y sin preguntas en negativo ("¿cuál NO…?").
  - explanation, hasta 2 oraciones: por qué es la correcta y qué confusión hay detrás de la incorrecta más tentadora. Sin nombrar letras ni posiciones: las opciones se muestran mezcladas.
- La pregunta sobre una idea no va pegada a la placa que la explica: dejá al menos una placa de otra idea en el medio, así se recuerda en vez de releer.

FORMA
- tag: el eje (2 a 4 palabras); 3 a 5 tags en total, repetidos con coherencia.
- Un emoji por placa que tenga que ver con lo que dice.
- Español rioplatense, de vos, claro y al nivel del curso.`,

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
- El estudiante figura con marcas como [E1] (su nombre) o [A1] (su apellido): usalas tal cual, la app pone el nombre después.
- Tono constructivo y respetuoso: es material para hablar con la familia o el equipo.
- Español rioplatense. Nada de tecnicismos psicológicos ni diagnósticos.`,

  practice_quiz: `Sos EstudIA, un tutor amigable para estudiantes de secundaria argentina. Creá un quiz de práctica a partir del material de estudio.

Reglas:
- Entre 5 y 8 preguntas multiple choice, cada una con exactamente 4 opciones plausibles (los distractores reflejan confusiones típicas, no opciones absurdas). Todas del mismo largo y forma: la correcta no puede ser la más larga ni la más completa. Sin "todas/ninguna de las anteriores".
- Cubrí las ideas centrales del material, ordenadas de lo más básico a lo más desafiante. Nada de la organización del curso (números de clase, fechas, criterios de evaluación).
- En "explanation" explicá POR QUÉ la respuesta correcta es correcta, en 1-3 oraciones, como un profe copado; si sirve, aclará por qué las otras confunden. Es feedback para APRENDER, no solo corregir. Sin nombrar letras ni posiciones: las opciones se muestran mezcladas.
- En "hint" da una pista corta que oriente el razonamiento sin regalar la respuesta.
- Voseo, lenguaje claro de secundaria, español rioplatense.
- Fiel al material: no inventes contenido que no esté.`,

  juegos: `Sos EstudIA. Armás el banco de cinco juegos cortos con los que estudiantes de secundaria argentina repasan un material desde el celular: Unir (término con definición), Ordenar, Clasificar, Completar la frase y Contrarreloj (verdadero o falso). Sirve para cualquier materia: en Matemática, Física o Química un término puede ser una fórmula o una magnitud ("v = d / t" con "velocidad media").

QUÉ ENTRA
- Lo que hay que saber del tema: conceptos, relaciones, procedimientos, ejemplos. Nada de la organización del curso (números de clase, fechas, criterios de evaluación, consignas para el docente).
- Fiel al material: no agregues hechos que no estén (cifras, fechas, nombres, autores, citas). Casos y ejemplos hipotéticos, sí.

CADA JUEGO
- pares: la definición en palabras de chico, sin repetir el término ni delatarlo con su raíz. Que ninguna definición encaje con dos términos.
- secuencias: solo si el material tiene un orden real (los pasos de un procedimiento, las etapas de un proceso, hechos en el tiempo). Los pasos no se pueden ordenar por el texto: nada de "primero", "luego" ni números. Si no hay orden real, vacío.
- clasificaciones: cada elemento va en un solo grupo, sin dudas. Si el material no tiene categorías claras, vacío.
- completar: los distractores son errores que un chico comete de verdad con este tema, del mismo tipo que la respuesta; ninguno sirve también.
- verdadero_falso: la mitad verdaderas. Las falsas son confusiones típicas, no absurdos; sin "nunca" o "siempre" como pista y sin dobles negaciones. La explicación enseña por qué.

Textos cortos (se leen en un celular). Español rioplatense, de vos, al nivel del curso.`,

  study_guide: `Sos EstudIA, un tutor que ayuda a estudiantes de secundaria argentina a ESTUDIAR un material (no solo leerlo). Escribí una guía de estudio en Markdown dirigida al estudiante (voseo):

**¿De qué se trata?** — 2-3 oraciones que sitúan el tema.
**Ideas clave** — 4-6, cada una con explicación breve y un ejemplo cotidiano si ayuda.
**Ojo con esto** — 2-3 confusiones típicas o errores comunes al estudiar este tema.
**Preguntate esto** — 4-5 preguntas para auto-evaluarte (sin las respuestas: la idea es que vuelvas al material si no las sabés).
**Truco para recordarlo** — una mnemotecnia, analogía o regla práctica.

Lenguaje cercano y motivador, español rioplatense. Fiel al material: no inventes contenido que no esté.`,

  armar_actividad: `Armás una actividad de secundaria (Argentina) para que el estudiante la haga solo, en el celular y sin conexión: tiene que entenderse sin que el docente la explique.

Recibís el tema de la planificación (unidad, tema, objetivos, contenido), el tipo y a veces un pedido del docente.

Tipo:
- actividad: práctica corta, 3 a 5 partes, casi todas de opción múltiple.
- tp (trabajo práctico): 3 a 6 partes de lo simple a lo integrador; combiná opción múltiple y desarrollo; al menos una aplica el tema a un caso o situación concreta.
- evaluacion: 5 a 10 partes que cubran los objetivos; mayoría de opción múltiple y 1 a 3 de desarrollo.

Reglas:
- titulo: corto, nombra el tema (sin "TP N°").
- consigna: para el estudiante, 2 a 5 líneas en Markdown: qué va a hacer y cómo se califica. Si una parte necesita un texto, un caso o datos, ponelos en su enunciado.
- Cada parte se entiende sola. Opción múltiple: 3 o 4 opciones plausibles y del mismo largo (la correcta no puede ser la más larga), una sola correcta, sin "todas/ninguna de las anteriores"; correct_index es su posición desde 0, y el enunciado no nombra letras ni posiciones (las opciones se mezclan). Desarrollo: type "open", options vacío, correct_index 0.
- points: enteros o con medio punto; en total suman 10 salvo que el pedido diga otro total. Más puntos a lo que más cuesta.
- Fiel al tema; no inventes datos dudosos. Español rioplatense, al nivel del curso.
- Si hay notas de cómo trabaja el docente, respetalas. Si el pedido contradice algo de esto, vale el pedido.`,

  extract_questions: `Sos un asistente pedagógico. A partir de la consigna/actividad dada, extraé o generá preguntas para un cuestionario autocorregible para estudiantes de secundaria.

Reglas:
- Si la actividad ya contiene preguntas, extraelas fielmente.
- Si contiene consignas de opción múltiple, convertilas en multiple_choice con sus opciones y la correcta.
- Preguntas de desarrollo → type "open" (options: [], correct_index: 0).
- Si la actividad no tiene preguntas explícitas, generá 3-5 preguntas de comprensión sobre su contenido (mayoría multiple_choice con 4 opciones plausibles).
- Redactá en español rioplatense, nivel secundaria.`,
};

/**
 * Las notas de la memoria del docente (062) que sirven para armar una
 * actividad: formato, preferencias, lo que corrige y cómo es el curso.
 * Si apagó la memoria, no hay filas (apagarla las borra).
 */
async function notasDelDocente(db: SupabaseClient, teacherId: string, materia?: string, curso?: string): Promise<string> {
  const { data, error } = await db
    .from('memoria_docente')
    .select('materia, curso, tipo, texto')
    .eq('teacher_id', teacherId)
    .in('tipo', ['formato', 'prefiere', 'evita', 'grupo'])
    .order('ultima_vez', { ascending: false })
    .limit(20);
  if (error || !data) return '';
  const plegar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const m = plegar(materia ?? '');
  const c = plegar(curso ?? '');
  return (data as { materia: string | null; curso: string | null; tipo: string; texto: string }[])
    .filter(n => (!n.materia || !m || plegar(n.materia) === m) && (!n.curso || !c || plegar(n.curso) === c))
    // Lo del grupo es de un curso: sin curso no se sabe de cuál
    .filter(n => n.tipo !== 'grupo' || n.curso)
    .slice(0, 8)
    .map(n => `- ${n.texto}`)
    .join('\n');
}

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
    if (usoImg && usoImg.message_count >= cupoDiario(profile?.role)) {
      return json({ error: 'QUOTA_EXCEEDED', message: `Alcanzaste el límite de ${cupoDiario(profile?.role)} usos de IA por hoy.` }, 429);
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
    practice_quiz: unknown | null; study_guide: string | null; juegos: unknown | null;
  } | null = null;

  if (isCached) {
    const { data: mat } = await supabase
      .from('library_materials')
      .select('id, title, subject_name, subject_id, course_id, teacher_id, school_id, is_shared_with_students, extracted_text, ai_summary, study_cards, practice_quiz, study_guide, juegos')
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
    if (mode === 'juegos' && mat.juegos) {
      return json({ juegos: mat.juegos, cached: true });
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
  // Un escaneo largo se lee de a tandas de páginas: todo el documento cuenta
  // UN uso (el de la parte 1). Las partes que siguen no gastan cupo ni se
  // frenan por él a mitad de camino; su consumo igual se anota (Consumo de IA).
  // La parte 1 queda anotada (069) y las siguientes solo valen para esa misma
  // lectura: del mismo docente, dentro de la hora y hasta 40 partes. Si no,
  // mandar "parte 2" con cualquier id salteaba el cupo.
  const lectura = mode === 'extract_text'
    && typeof body.documento === 'string' && /^[0-9a-f-]{36}$/i.test(body.documento)
    && Number.isInteger(body.parte) && (body.parte as number) >= 1
    ? { documento: body.documento, parte: body.parte as number } : null;
  let parteSiguiente = false;
  if (lectura && lectura.parte > 1) {
    const { data: reg, error: regError } = await supabase
      .from('lecturas_por_partes')
      .select('user_id, partes, created_at')
      .eq('documento', lectura.documento)
      .maybeSingle();
    if (!regError) {
      const vale = reg && reg.user_id === user.id && reg.partes < 40
        && Date.now() - new Date(reg.created_at).getTime() < 3_600_000;
      if (!vale) {
        return json({ error: 'LECTURA_VENCIDA', message: 'Esa lectura por partes ya no vale. Volvé a tocar "Leer texto".' }, 400);
      }
      // Una tanda son 5 páginas: más que esto no es una tanda
      if (pdfBase64 && pdfBase64.length > 8_000_000) {
        return json({ error: 'FILE_TOO_LARGE', message: 'Esa parte es demasiado grande.' }, 400);
      }
      await supabase.from('lecturas_por_partes').update({ partes: reg.partes + 1 }).eq('documento', lectura.documento);
      parteSiguiente = true;
    }
    // Sin la tabla (falta la 069): cada parte cuenta como un uso, como antes
  }
  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabase
    .from('ia_usage')
    .select('message_count, token_count_in, token_count_out')
    .eq('teacher_id', user.id)
    .eq('usage_date', today)
    .maybeSingle();

  if (!parteSiguiente && usage && usage.message_count >= cupoDiario(profile?.role)) {
    return json({ error: 'QUOTA_EXCEEDED', message: `Alcanzaste el límite de ${cupoDiario(profile?.role)} usos de IA por hoy.` }, 429);
  }
  // La parte 1 de una lectura de a tandas: se anota para validar las que siguen
  if (lectura && lectura.parte === 1) {
    await supabase.from('lecturas_por_partes')
      .upsert({ documento: lectura.documento, user_id: user.id }, { onConflict: 'documento', ignoreDuplicates: true });
  }

  // ── Build OpenRouter request ──
  const isStructured = mode === 'import_program' || mode === 'extract_questions' || mode === 'study_cards' || mode === 'practice_quiz' || mode === 'slides'
    || mode === 'diagram' || mode === 'word_game' || mode === 'armar_actividad' || mode === 'juegos';
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
    // Cinco listas cortas: menos que las tarjetas
    juegos: 7000,
    extract_questions: 8000,
    // Hasta 10 partes con sus opciones: alcanza con holgura
    armar_actividad: 5000,
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
  if ((mode === 'slides' || mode === 'armar_actividad') && body.pedido?.trim()) hints.push(`Pedido del docente (respetalo): ${body.pedido.trim().slice(0, 1500)}`);
  // El tema de la planificación: el mazo y las placas apuntan a sus objetivos
  if ((mode === 'slides' || mode === 'study_cards') && body.tema && typeof body.tema === 'object') {
    const linea = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const tituloTema = linea(body.tema.titulo, 200);
    const unidad = linea(body.tema.unidad, 200);
    const objetivos = Array.isArray(body.tema.objetivos)
      ? body.tema.objetivos.map(o => linea(o, 200)).filter(Boolean).slice(0, 6)
      : [];
    if (tituloTema) hints.push(`Tema de la planificación: ${tituloTema}${unidad ? ` (unidad: ${unidad})` : ''}`);
    if (objetivos.length) hints.push(`Objetivos del tema:\n${objetivos.map(o => `- ${o}`).join('\n')}`);
  }
  if ((mode === 'armar_actividad' || mode === 'slides') && profile?.role === 'docente') {
    const notas = await notasDelDocente(supabase, user.id, context?.subjectName, context?.courseName);
    if (notas) hints.push(`Cómo trabaja este docente (lo fue pidiendo en otras charlas):\n${notas}`);
  }
  if (cacheMaterial?.subject_name) hints.push(`Materia: ${cacheMaterial.subject_name}`);
  if (context?.subjectName) hints.push(`Materia esperada: ${context.subjectName}`);
  if (context?.courseName) hints.push(`Curso esperado: ${context.courseName}`);

  // La ficha de un chico: él ya viene como [E]; los demás nombres de la escuela
  // (compañeros, familias, docentes) también se tapan, y vuelven en la respuesta
  const seudo = mode === 'student_summary' ? new Seudonimos(await padronDeEscuela(supabase, profile?.school_id)) : null;
  const textoCrudo = text
    ? (text.length > MAX_TEXT_INPUT ? text.substring(0, MAX_TEXT_INPUT) + '\n[...truncado...]' : text)
    : '';
  const textInput = seudo ? seudo.tapar(textoCrudo) : textoCrudo;

  userContent.push({
    type: 'text',
    text: [
      hints.join('\n'),
      // Diapositivas sin material: lo que llega es solo el tema (el prompt dice qué cambia)
      textInput
        ? (mode === 'slides' && body.fuente === 'tema' ? `<tema>\n${textInput}\n</tema>` : `<documento>\n${textInput}\n</documento>`)
        : '',
      mode === 'extract_text' ? 'Transcribí el documento.'
        : mode === 'summarize' ? 'Resumí el documento.'
        : mode === 'class_report' ? 'Escribí el informe de la clase.'
        : mode === 'import_program' ? 'Extraé la planificación del programa.'
        : mode === 'student_summary' ? 'Escribí la síntesis del estudiante.'
        : mode === 'slides' ? 'Armá las diapositivas de la clase.'
        : mode === 'diagram' ? `Armá el diagrama. Variante: ${['flujo', 'ciclo', 'causa_efecto', 'mapa_mental', 'linea_tiempo'].includes(body.variante ?? '') ? body.variante : 'mapa_mental'}.`
        : mode === 'word_game' ? 'Prepará las palabras y la frase para los juegos.'
        : mode === 'armar_actividad' ? `Armá: ${['actividad', 'tp', 'evaluacion'].includes(body.variante ?? '') ? body.variante : 'tp'}.`
        : mode === 'study_cards' ? 'Generá las placas de estudio.'
        : mode === 'practice_quiz' ? 'Generá el quiz de práctica.'
        : mode === 'juegos' ? 'Armá el banco de los juegos.'
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
  // Lo que habla de chicos (la ficha de uno, el informe de la clase) va solo a
  // proveedores que no guardan los pedidos, como Migue y el chat
  if (mode === 'student_summary' || mode === 'class_report') {
    const zdr = Deno.env.get('OPENROUTER_SOLO_ZDR') === 'no' ? undefined : { zdr: true };
    if (zdr) orBody.provider = zdr;
  }
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
      armar_actividad: { name: 'actividad', schema: ACTIVIDAD_SCHEMA },
      practice_quiz: { name: 'quiz_practica', schema: PRACTICE_QUIZ_SCHEMA },
      juegos: { name: 'juegos', schema: JUEGOS_SCHEMA },
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
      message_count: (usage?.message_count ?? 0) + (parteSiguiente ? 0 : 1),
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
  if (mode === 'summarize' || mode === 'student_summary' || mode === 'class_report') {
    return json({ summary: seudo ? seudo.destapar(outputText) : outputText, truncated });
  }

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
    // Las opciones de las preguntas se mezclan acá (_ordenar.ts): el modelo
    // pone la correcta casi siempre en el mismo lugar
    if (mode === 'slides') {
      const diapositivas = Array.isArray(parsed.diapositivas)
        ? parsed.diapositivas.map((d: { tipo?: string; opciones?: string[]; correcta?: number }) => {
          if (d?.tipo !== 'pregunta' || !Array.isArray(d.opciones)) return d;
          const { opciones, correcta } = mezclarOpciones(d.opciones, d.correcta ?? -1);
          return { ...d, opciones, correcta };
        })
        : parsed.diapositivas;
      return json({ deck: { ...parsed, diapositivas }, truncated });
    }
    if (mode === 'diagram') return json({ diagram: parsed, truncated });
    if (mode === 'word_game') return json({ game: parsed, truncated });
    if (mode === 'armar_actividad') {
      if (truncated) return json({ error: 'API_ERROR', message: 'Salió incompleta. Probá de nuevo o pedí menos partes.' }, 502);
      const partes = (parsed.partes ?? []).map((p: { type?: string; options?: string[]; correct_index?: number }) => {
        if (p?.type !== 'multiple_choice' || !Array.isArray(p.options)) return p;
        const { opciones, correcta } = mezclarOpciones(p.options, p.correct_index ?? -1);
        return { ...p, options: opciones, correct_index: correcta };
      });
      return json({ titulo: parsed.titulo ?? '', consigna: parsed.consigna ?? '', partes });
    }
    if (mode === 'study_cards') return json({ cards: Array.isArray(parsed.cards) ? acomodarPlacas(parsed.cards) : [], truncated });

    // ── Juegos para repasar: limpiar y validar antes de cachear (072) ──
    if (mode === 'juegos') {
      const banco = limpiarBanco(parsed);
      if (truncated || !bancoAlcanza(banco)) {
        return json({ error: 'API_ERROR', message: 'No salieron suficientes juegos con este material. Probá de nuevo.' }, 502);
      }
      const { data: won } = await supabase
        .from('library_materials')
        .update({ juegos: banco })
        .eq('id', cacheMaterial!.id)
        .is('juegos', null)
        .select('id');
      if (!won || won.length === 0) {
        // Otro pedido lo armó primero: todos juegan con el mismo
        const { data: fresh } = await supabase
          .from('library_materials').select('juegos').eq('id', cacheMaterial!.id).single();
        if (fresh?.juegos) return json({ juegos: fresh.juegos, cached: true });
      }
      return json({ juegos: banco, cached: false });
    }

    // ── Quiz de práctica: validar antes de cachear (nunca cachear basura) ──
    if (mode === 'practice_quiz') {
      const questions = (parsed.questions ?? []).filter((q: {
        prompt?: string; options?: string[]; correct_index?: number; explanation?: string;
      }) =>
        q.prompt && Array.isArray(q.options) && q.options.length >= 2 &&
        typeof q.correct_index === 'number' && q.correct_index >= 0 && q.correct_index < q.options.length &&
        q.explanation,
      ).map((q: { options: string[]; correct_index: number }) => {
        const { opciones, correcta } = mezclarOpciones(q.options, q.correct_index);
        return { ...q, options: opciones, correct_index: correcta };
      });
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
