/**
 * SMT EstudIA — Guardar una foto de licencia libre para una diapositiva
 *
 * POST /functions/v1/guardar-imagen   { id: "<id de Openverse>" }
 *
 * El docente busca fotos en Openverse (Wikimedia Commons, Flickr y otros
 * acervos con licencias Creative Commons) desde el navegador y elige una. Acá
 * se guarda una copia en el bucket "library", en su carpeta, con el crédito
 * que pide la licencia. Una copia propia, y no el link original, porque:
 *  - la clase tiene que andar sin internet (la guarda el service worker);
 *  - el PowerPoint la lleva embebida;
 *  - el link original puede desaparecer.
 *
 * Seguridad: el cliente manda SOLO el id. La dirección de la imagen, el autor
 * y la licencia se le piden a Openverse acá: así nadie puede hacer que el
 * servidor baje una dirección cualquiera ni inventar un crédito. Lo marcado
 * como contenido adulto se rechaza. No usa IA: no gasta cupo.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENVERSE = 'https://api.openverse.org/v1/images/';
const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

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

/** "by-sa" + "4.0" → "CC BY-SA 4.0"; "cc0" → "CC0"; "pdm" → "Dominio público" */
function nombreLicencia(licencia: string, version: string): string {
  const l = (licencia || '').toLowerCase();
  if (l === 'pdm') return 'Dominio público';
  if (l === 'cc0') return 'CC0';
  return `CC ${l.toUpperCase()}${version ? ` ${version}` : ''}`.trim();
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  const id = String(body.id ?? '');
  // Los ids de Openverse son UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return json({ error: 'ID_INVALIDO', message: 'Esa imagen no se puede usar.' }, 400);
  }

  // ── Auth: solo docentes y dirección (los chicos no suben fotos a mazos) ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'UNAUTHORIZED' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return json({ error: 'AUTH_INVALID', message: 'Sesión expirada. Volvé a iniciar sesión.' }, 401);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'docente' && profile?.role !== 'director') {
    return json({ error: 'FORBIDDEN_ROLE', message: 'Tu cuenta no puede usar esta función.' }, 403);
  }

  // ── Los datos de la foto, de Openverse (no del cliente) ──
  let info: Record<string, unknown>;
  try {
    const r = await fetch(`${OPENVERSE}${id}/`, { headers: { 'User-Agent': 'SMT-EstudIA/1.0 (escuelas municipales de San Miguel de Tucuman)' } });
    if (!r.ok) return json({ error: 'NO_ENCONTRADA', message: 'Esa imagen ya no está disponible. Elegí otra.' }, 404);
    info = await r.json();
  } catch {
    return json({ error: 'OPENVERSE', message: 'No se pudo consultar el buscador de imágenes. Probá de nuevo.' }, 502);
  }
  if (info.mature === true) return json({ error: 'NO_APTA', message: 'Esa imagen no se puede usar en la escuela.' }, 422);

  const url = texto(info.url, 2000);
  if (!/^https:\/\//.test(url)) return json({ error: 'SIN_URL', message: 'Esa imagen no se puede bajar. Elegí otra.' }, 422);

  // ── Bajar la imagen, con tope de tamaño ──
  let bytes: Uint8Array;
  let tipo: string;
  try {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), 20000);
    const r = await fetch(url, { signal: control.signal, headers: { 'User-Agent': 'SMT-EstudIA/1.0' } });
    clearTimeout(reloj);
    if (!r.ok || !r.body) return json({ error: 'DESCARGA', message: 'No se pudo bajar esa imagen. Elegí otra.' }, 502);
    tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!TIPOS[tipo]) return json({ error: 'FORMATO', message: 'Esa imagen está en un formato que no se puede usar. Elegí otra.' }, 422);
    const largo = Number(r.headers.get('content-length') ?? 0);
    if (largo > MAX_BYTES) return json({ error: 'MUY_PESADA', message: 'Esa imagen es muy pesada. Elegí otra.' }, 413);

    // Se cuenta mientras llega: el content-length puede faltar o mentir
    const partes: Uint8Array[] = [];
    let total = 0;
    const lector = r.body.getReader();
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await lector.cancel();
        return json({ error: 'MUY_PESADA', message: 'Esa imagen es muy pesada. Elegí otra.' }, 413);
      }
      partes.push(value);
    }
    bytes = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) { bytes.set(p, pos); pos += p.length; }
  } catch {
    return json({ error: 'DESCARGA', message: 'No se pudo bajar esa imagen. Elegí otra.' }, 502);
  }

  // ── Guardarla en la carpeta del docente ──
  const ruta = `${user.id}/img/${crypto.randomUUID()}.${TIPOS[tipo]}`;
  const { error: upErr } = await supabase.storage.from('library').upload(ruta, bytes, { contentType: tipo, upsert: false });
  if (upErr) {
    console.error('guardar-imagen storage:', upErr.message);
    return json({ error: 'STORAGE_ERROR', message: 'Se bajó la imagen pero no se pudo guardar.' }, 500);
  }

  const fuente = texto(info.foreign_landing_url, 400);
  return json({
    ruta,
    alt: texto(info.title, 200),
    credito: {
      autor: texto(info.creator, 120) || 'Autor desconocido',
      licencia: nombreLicencia(texto(info.license, 20), texto(info.license_version, 10)),
      fuente: /^https:\/\//.test(fuente) ? fuente : '',
    },
  });
});
