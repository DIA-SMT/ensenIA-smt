/**
 * SMT EstudIA — Generate Podcast Edge Function
 *
 * POST /functions/v1/generate-podcast  { materialId }
 *
 * Convierte un material de la biblioteca en un mini podcast (~2-3 min):
 *  1. Claude (vía OpenRouter) escribe un guion cálido, como una profe tucumana.
 *  2. Azure lo convierte a voz con una voz argentina (es-AR-ElenaNeural).
 *     Gratis hasta 500.000 caracteres por mes (unos 200 podcasts). Si Azure
 *     no está configurado o falla, y hay clave de ElevenLabs, se usa
 *     ElevenLabs de respaldo (ese sí cobra).
 *  3. El MP3 queda en Storage (bucket "library") y el material se marca "ready".
 *
 * Secrets: OPENROUTER_API_KEY; para la voz AZURE_SPEECH_KEY + AZURE_SPEECH_REGION
 * (AZURE_SPEECH_VOICE opcional) y/o ELEVENLABS_API_KEY
 * (ELEVENLABS_PODCAST_VOICE_ID opcional).
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SCRIPT_MODEL = 'anthropic/claude-sonnet-5';
const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
// Voz argentina de la Voice Library (agregada a "My voices" de la cuenta:
// sin eso la API no la encuentra). Se puede pisar con el secret
// ELEVENLABS_PODCAST_VOICE_ID. Antes era "Sarah" (EXAVITQu4vr4xnSDxMaL), que
// sonaba a español neutro aunque el guion fuera rioplatense; el secret viejo
// ELEVENLABS_VOICE_ID ya no se lee para que no la pise sin querer.
const DEFAULT_VOICE = 'LZj1dIzYRl9rc9TIXnMt';
const AZURE_DEFAULT_VOICE = 'es-AR-ElenaNeural';
// Mono a 48 kbps: para la voz alcanza y pesa la mitad que antes (los chicos
// lo bajan con datos del celular): ~1 MB por podcast en vez de ~2,4.
const AZURE_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const BUCKET = 'library';
const MAX_SOURCE_CHARS = 25_000;

const SCRIPT_PROMPT = `Sos EstudIA. Escribí el guion de un MINI PODCAST educativo (2 a 3 minutos leídos, entre 320 y 420 palabras) a partir del material adjunto, para estudiantes de secundaria argentina.

Estructura:
1. Gancho (1-2 frases que conecten el tema con la vida real de un adolescente).
2. Las 3 o 4 ideas centrales del material, explicadas con palabras simples y UN ejemplo concreto.
3. Cierre: las 2 cosas que hay que recordar sí o sí + una pregunta para dejarlos pensando.

Reglas:
- Hablás como una profe tucumana copada contando algo interesante: español rioplatense del norte, cálido y bien de acá. Voseo siempre ("mirá", "fijate", "pensalo"), "ustedes" para el grupo.
- Que se note que es de Tucumán, sin caricatura: algún "chango" o "changa", "¿vieron?", "re", "posta", "de una", y ejemplos de la vida tucumana (el colectivo, la plaza Independencia, el Parque 9 de Julio, el cerro San Javier, la zafra, el ingenio, las empanadas). Uno o dos giros por guion, no en cada frase.
- Escribí las palabras completas y bien escritas (nada de "vamo'" ni "lo' chico'"): el acento lo pone la voz.
- SOLO texto para leer en voz alta: sin markdown, sin títulos, sin viñetas, sin emojis, sin acotaciones entre corchetes.
- Oraciones cortas. Puntuación natural para que la voz respire.
- Fiel al material: no inventes contenido.`;

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

interface Voz { audio: Uint8Array; modelo: string }

/** Escapa el guion para meterlo en SSML (XML). */
const xml = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Azure: voz argentina, gratis hasta el cupo mensual del plan F0. */
async function vozAzure(texto: string, key: string, region: string): Promise<Voz> {
  const voz = Deno.env.get('AZURE_SPEECH_VOICE') || AZURE_DEFAULT_VOICE;
  // Un poco más pausada que lo normal: se entiende mejor
  const ssml = `<speak version="1.0" xml:lang="es-AR"><voice name="${voz}"><prosody rate="-6%">${xml(texto)}</prosody></voice></speak>`;
  const pedir = () => fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': AZURE_FORMAT,
      'User-Agent': 'smt-estudia',
    },
    body: ssml,
  });
  let res = await pedir();
  // 429: demasiados a la vez. Un reintento corto antes de rendirse.
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 3000));
    res = await pedir();
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Azure ${res.status}: ${t.slice(0, 150)}`);
  }
  return { audio: new Uint8Array(await res.arrayBuffer()), modelo: `azure:${voz}` };
}

/** ElevenLabs: respaldo pago. */
async function vozEleven(texto: string, key: string): Promise<Voz> {
  const voiceId = Deno.env.get('ELEVENLABS_PODCAST_VOICE_ID') || DEFAULT_VOICE;
  const res = await fetch(`${ELEVEN_URL}/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texto,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.25 },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${t.slice(0, 150)}`);
  }
  return { audio: new Uint8Array(await res.arrayBuffer()), modelo: 'eleven_multilingual_v2' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  const AZURE_SPEECH_KEY = Deno.env.get('AZURE_SPEECH_KEY');
  const AZURE_SPEECH_REGION = Deno.env.get('AZURE_SPEECH_REGION');
  const hayAzure = Boolean(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION);
  if (!OPENROUTER_API_KEY || (!hayAzure && !ELEVENLABS_API_KEY)) {
    return json({ error: 'Faltan claves de IA o de voz en el servidor.' }, 500);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceKey);

  // ── Auth ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const { data: { user }, error: authError } = await db.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return json({ error: 'Sesión expirada. Volvé a iniciar sesión.' }, 401);

  // ── Material ──
  let materialId = '';
  try {
    const body = await req.json();
    materialId = String(body.materialId ?? '');
  } catch { /* fallthrough */ }
  if (!materialId) return json({ error: 'Falta materialId' }, 400);

  const { data: mat } = await db
    .from('library_materials')
    .select('id, title, subject_name, teacher_id, extracted_text, podcast_status')
    .eq('id', materialId)
    .single();

  if (!mat) return json({ error: 'Material no encontrado' }, 404);
  if (mat.teacher_id !== user.id) return json({ error: 'Solo el docente dueño del material puede generar el podcast.' }, 403);
  if (!mat.extracted_text || mat.extracted_text.trim().length < 200) {
    return json({ error: 'El material no tiene texto suficiente. Procesalo primero desde la Biblioteca.' }, 400);
  }
  if (mat.podcast_status === 'generating') {
    return json({ error: 'Ya hay un podcast generándose para este material.' }, 409);
  }

  await db.from('library_materials').update({ podcast_status: 'generating' }).eq('id', mat.id);

  try {
    // ── 1. Guion ──
    const source = mat.extracted_text.length > MAX_SOURCE_CHARS
      ? mat.extracted_text.slice(0, MAX_SOURCE_CHARS) + '\n[...truncado...]'
      : mat.extracted_text;

    const orRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'SMT EstudIA',
      },
      body: JSON.stringify({
        model: SCRIPT_MODEL,
        max_tokens: 4000,
        usage: { include: true },
        messages: [
          { role: 'system', content: SCRIPT_PROMPT },
          { role: 'user', content: `MATERIAL: "${mat.title}" (${mat.subject_name})\n\n"""\n${source}\n"""` },
        ],
      }),
    });
    if (!orRes.ok) throw new Error(`OpenRouter ${orRes.status}`);
    const orJson = await orRes.json();
    const script: string = orJson.choices?.[0]?.message?.content?.trim() ?? '';
    if (script.length < 200) throw new Error('El guion salió vacío o demasiado corto.');

    // El podcast no cuenta para el tope diario, pero sí para el consumo
    const { data: autor } = await db.from('profiles').select('role, school_id').eq('id', user.id).maybeSingle();
    const quien = { user_id: user.id, school_id: autor?.school_id ?? null, role: autor?.role ?? null };
    await registrarConsumo(db, {
      ...quien, feature: 'podcast', detail: 'guion', model: SCRIPT_MODEL,
      tokens_in: orJson.usage?.prompt_tokens ?? 0, tokens_out: orJson.usage?.completion_tokens ?? 0,
      cost_usd: costoDe(orJson.usage),
    });

    // ── 2. Voz ──
    // Azure primero (gratis hasta el cupo); ElevenLabs solo de respaldo
    let voz: Voz | null = null;
    let errorAzure = '';
    if (hayAzure) {
      try {
        voz = await vozAzure(script, AZURE_SPEECH_KEY!, AZURE_SPEECH_REGION!);
      } catch (e) {
        errorAzure = e instanceof Error ? e.message : String(e);
        console.error('Azure TTS:', errorAzure);
      }
    }
    if (!voz && ELEVENLABS_API_KEY) voz = await vozEleven(script, ELEVENLABS_API_KEY);
    if (!voz) {
      // Sin respaldo: decirlo en criollo (429 = muchos a la vez; 401/403 = clave o cupo del mes)
      throw new Error(errorAzure.startsWith('Azure 429')
        ? 'Hay muchos podcasts generándose ahora. Probá de nuevo en un minuto.'
        : 'No se pudo generar la voz (puede que se haya terminado el cupo gratis del mes). Los podcasts ya hechos siguen andando.');
    }
    const { audio, modelo } = voz;
    // La voz se cobra (o descuenta del cupo) por caracter: se anota aunque el audio salga mal
    await registrarConsumo(db, {
      ...quien, feature: 'podcast', detail: 'voz', model: modelo, tts_chars: script.length,
    });
    if (audio.byteLength < 10_000) throw new Error('El audio salió vacío.');

    // ── 3. Storage + estado ──
    const path = `podcasts/${mat.id}.mp3`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, audio, {
      contentType: 'audio/mpeg',
      upsert: true,
    });
    if (upErr) throw new Error(`Storage: ${upErr.message}`);

    await db.from('library_materials')
      .update({ podcast_path: path, podcast_status: 'ready' })
      .eq('id', mat.id);

    return json({ ok: true, podcastPath: path, words: script.split(/\s+/).length });
  } catch (err) {
    console.error('generate-podcast error:', err);
    await db.from('library_materials').update({ podcast_status: 'error' }).eq('id', mat.id);
    return json({ error: err instanceof Error ? err.message : 'No se pudo generar el podcast.' }, 500);
  }
});
