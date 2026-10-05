/**
 * consumo-ia — cuánto va gastado en OpenRouter, para la pantalla
 * "Consumo de IA" del superadmin.
 *
 * La clave de OpenRouter es un secreto del servidor: esta función la usa
 * para preguntar y al navegador le devuelve solo los números. Con la clave
 * normal OpenRouter informa lo gastado por ESA clave hoy, en la semana, en
 * el mes y en total (fechas en UTC), y su tope si lo tiene. El detalle por
 * función y por modelo sale de ia_events (migración 040).
 *
 *  - POST {} → { usd: { hoy, semana, mes, total }, limite, restante, reinicio, consultado }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';

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

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) return json({ error: 'Falta la clave de OpenRouter en el servidor.' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Falta autenticación' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return json({ error: 'Sesión inválida' }, 401);

  // Solo el superadmin: lo que se gasta es de toda la plataforma
  const { data: perfil } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (perfil?.role !== 'superadmin') return json({ error: 'Solo el superadmin puede ver el gasto.' }, 403);

  let resp: Response;
  try {
    resp = await fetch(OPENROUTER_KEY_URL, { headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` } });
  } catch (_e) {
    return json({ error: 'No se pudo consultar a OpenRouter. Probá de nuevo en un rato.' }, 502);
  }
  if (!resp.ok) {
    console.error('OpenRouter /key:', resp.status, (await resp.text()).slice(0, 300));
    return json({ error: `OpenRouter respondió ${resp.status} al pedir el gasto.` }, 502);
  }

  const d = (await resp.json().catch(() => ({})))?.data ?? {};
  return json({
    usd: {
      hoy: numero(d.usage_daily),
      semana: numero(d.usage_weekly),
      mes: numero(d.usage_monthly),
      total: numero(d.usage),
    },
    limite: numero(d.limit),
    restante: numero(d.limit_remaining),
    reinicio: typeof d.limit_reset === 'string' ? d.limit_reset : null,
    consultado: new Date().toISOString(),
  });
});
