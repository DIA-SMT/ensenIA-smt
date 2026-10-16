/**
 * SMT EstudIA — sesión para el ingreso con CiDiTuc
 *
 * POST /functions/v1/cidituc-sesion   { dni }   (+ encabezado x-cidituc-puente)
 *   → { ok: true, sesion, perfil }  |  { ok: false, motivo }
 *
 * La llama SOLO la función de Vercel del callback (api/_cidituc.ts), después
 * de validar a la persona contra CiDiTuc. Acá se busca la cuenta de EstudIA
 * con ese DNI y se le crea una sesión normal (la misma que con usuario y
 * clave), sin su contraseña y sin mandar ningún mail: generateLink da un
 * token de un solo uso y verifyOtp lo canjea por la sesión.
 *
 * Por qué acá y no en Vercel: hace falta la clave maestra (service role) y
 * esa clave no sale de este servidor. Vercel solo tiene la clave compartida
 * CIDITUC_PUENTE_SECRET, que no sirve para nada más que esto.
 *
 * Reglas (16/10/2026): solo cuentas que ya existen; nunca el superadmin;
 * quien entra así no tiene que elegir clave de EstudIA (deja de figurar
 * "todavía no entró").
 *
 * Secrets: CIDITUC_PUENTE_SECRET (bin/poner-clave cidituc), más los de siempre.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (cuerpo: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Comparación en tiempo constante (que el tiempo de respuesta no delate la clave) */
function iguales(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, motivo: 'metodo' }, 405);

  const secreto = Deno.env.get('CIDITUC_PUENTE_SECRET') ?? '';
  // Sin configurar no hay ingreso con CiDiTuc (nunca "abierto por las dudas")
  if (secreto.length < 32) return json({ ok: false, motivo: 'servidor' }, 503);
  if (!iguales(req.headers.get('x-cidituc-puente') ?? '', secreto)) return json({ ok: false, motivo: 'prohibido' }, 403);

  let dni = '';
  try {
    const cuerpo = await req.json();
    dni = String(cuerpo?.dni ?? '').replace(/\D/g, '').replace(/^0+/, '');
  } catch {
    return json({ ok: false, motivo: 'servidor' }, 400);
  }
  if (dni.length < 6 || dni.length > 9) return json({ ok: false, motivo: 'no_existe' }, 404);

  const url = Deno.env.get('SUPABASE_URL')!;
  const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, opciones);
  const publico = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, opciones);

  try {
    const { data: perfil, error } = await admin.from('profiles')
      .select('id, email, role, first_name, last_name, must_change_password')
      .eq('dni', dni)
      .maybeSingle();
    if (error) throw error;
    if (!perfil) return json({ ok: false, motivo: 'no_existe' }, 404);
    // La cuenta maestra entra solo con su clave
    if (perfil.role === 'superadmin') return json({ ok: false, motivo: 'superadmin' }, 403);

    // Token de un solo uso (no manda mail) y su canje por una sesión normal
    const { data: link, error: e1 } = await admin.auth.admin.generateLink({ type: 'magiclink', email: perfil.email });
    const tokenHash = link?.properties?.hashed_token;
    if (e1 || !tokenHash) throw e1 ?? new Error('generateLink sin token');
    const { data: v, error: e2 } = await publico.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
    if (e2 || !v.session) throw e2 ?? new Error('verifyOtp sin sesión');

    // Ya se identificó con CiDiTuc: no se le pide elegir clave de EstudIA
    if (perfil.must_change_password) {
      await admin.from('profiles').update({ must_change_password: false }).eq('id', perfil.id);
    }

    // Sin DNI completo ni tokens en el registro
    console.log(`cidituc-sesion: ingreso de ${perfil.role} (DNI …${dni.slice(-3)})`);
    const s = v.session;
    return json({
      ok: true,
      sesion: {
        access_token: s.access_token, refresh_token: s.refresh_token,
        expires_at: s.expires_at, expires_in: s.expires_in, token_type: s.token_type,
      },
      perfil: { id: perfil.id, nombre: perfil.first_name, apellido: perfil.last_name, rol: perfil.role },
    });
  } catch (err) {
    console.error('cidituc-sesion:', err instanceof Error ? err.message : err);
    return json({ ok: false, motivo: 'servidor' }, 500);
  }
});
