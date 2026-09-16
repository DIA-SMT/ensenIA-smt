/**
 * SMT EstudIA — Generate Podcast Edge Function
 *
 * POST /functions/v1/generate-podcast  { materialId }
 *
 * Convierte un material de la biblioteca en un mini podcast (~2-3 min):
 *  1. Claude (vía OpenRouter) escribe un guion cálido en rioplatense.
 *  2. ElevenLabs lo convierte a voz (eleven_multilingual_v2).
 *  3. El MP3 queda en Storage (bucket "library") y el material se marca "ready".
 *
 * Secrets: OPENROUTER_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (opcional).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SCRIPT_MODEL = 'anthropic/claude-sonnet-5';
const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
// "Sarah": voz multilingüe clara; se puede pisar con el secret ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';
const BUCKET = 'library';
const MAX_SOURCE_CHARS = 25_000;

const SCRIPT_PROMPT = `Sos EstudIA. Escribí el guion de un MINI PODCAST educativo (2 a 3 minutos leídos, entre 320 y 420 palabras) a partir del material adjunto, para estudiantes de secundaria argentina.

Estructura:
1. Gancho (1-2 frases que conecten el tema con la vida real de un adolescente).
2. Las 3 o 4 ideas centrales del material, explicadas con palabras simples y UN ejemplo concreto.
3. Cierre: las 2 cosas que hay que recordar sí o sí + una pregunta para dejarlos pensando.

Reglas:
- Español rioplatense natural y cálido, como una profe copada contando algo interesante. Usá "vos".
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  if (!OPENROUTER_API_KEY || !ELEVENLABS_API_KEY) {
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

    // ── 2. Voz ──
    const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || DEFAULT_VOICE;
    const ttsRes = await fetch(`${ELEVEN_URL}/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.25 },
      }),
    });
    if (!ttsRes.ok) {
      const t = await ttsRes.text().catch(() => '');
      throw new Error(`ElevenLabs ${ttsRes.status}: ${t.slice(0, 150)}`);
    }
    const audio = new Uint8Array(await ttsRes.arrayBuffer());
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
