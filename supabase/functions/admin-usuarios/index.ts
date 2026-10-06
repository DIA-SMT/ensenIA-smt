/**
 * SMT EstudIA — Admin Usuarios Edge Function
 *
 * POST /functions/v1/admin-usuarios
 *
 * Crear cuentas y resetear claves necesita la service role, que no puede
 * estar en el navegador. Esta función es la única puerta:
 *
 *  - create:          { action, schoolId, role, firstName, lastName, dni?, email?, courseId? }
 *                     → { userId, login, password? , existing }
 *                     Si la persona ya tiene cuenta (un docente que suma una
 *                     segunda escuela), solo se le agrega la membresía.
 *                     Si es estudiante, también crea su ficha en `students`
 *                     (y la base lo inscribe solo en las materias del curso).
 *  - reset_password:  { action, userId } → { login, password }
 *
 * Quién puede qué lo deciden admin_can_create / admin_can_manage_user
 * (migración 039), llamadas con el JWT de quien pide: la regla vive en la
 * base y está probada junto con el resto de las policies.
 *
 * Los alumnos entran con su DNI: por dentro su cuenta es
 * <dni>@ALUMNOS_EMAIL_DOMAIN (el login de la app hace la misma cuenta).
 * La clave inicial se muestra una sola vez y se cambia al primer ingreso.
 *
 * Secrets: ALUMNOS_EMAIL_DOMAIN (opcional, ver DEFAULT_DNI_DOMAIN).
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Tiene que coincidir con VITE_DNI_EMAIL_DOMAIN del frontend (src/lib/dni.ts)
const DEFAULT_DNI_DOMAIN = 'alumnos.estudia.smt.gob.ar';
const ROLES = ['director', 'docente', 'estudiante', 'padre'] as const;
type Role = typeof ROLES[number];

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

/** Clave inicial legible para dictar o imprimir: "mkrt-4821". Sin l/i/o/0/1. */
function genPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const l = Array.from(bytes.slice(0, 4), b => letters[b % letters.length]).join('');
  const d = Array.from(bytes.slice(4), b => digits[b % digits.length]).join('');
  return `${l}-${d}`;
}

const initials = (first: string, last: string) =>
  `${first.trim()[0] ?? ''}${last.trim()[0] ?? ''}`.toUpperCase();

const cleanDni = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/**
 * Con qué entra la persona: el DNI si su cuenta es por DNI y, si se dio de
 * alta con email, el email (aunque tenga el DNI cargado). Igual que
 * loginLabel en src/lib/dni.ts.
 */
const loginDe = (email: string | null | undefined, dni: string | null | undefined, dniDomain: string) =>
  email && !email.endsWith(`@${dniDomain}`) ? email : (dni || (email ?? '').split('@')[0]);

async function allowed(userDb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await userDb.rpc(fn, args);
  if (error) {
    console.error(`${fn}:`, error.message);
    return false;
  }
  return data === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Falta autenticación' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const dniDomain = Deno.env.get('ALUMNOS_EMAIL_DOMAIN') || DEFAULT_DNI_DOMAIN;

  // Dos clientes: uno con el JWT de quien pide (para preguntar si puede)
  // y otro con la service role (para hacerlo).
  const userDb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return json({ error: 'Sesión inválida' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  try {
    // ── Resetear clave ──
    if (body.action === 'reset_password') {
      const userId = String(body.userId ?? '');
      if (!userId) return json({ error: 'Falta userId' }, 400);
      if (!(await allowed(userDb, 'admin_can_manage_user', { p_user: userId }))) {
        return json({ error: 'No podés resetear la clave de esta persona.' }, 403);
      }
      const password = genPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
      const { data: p } = await admin.from('profiles').select('email, dni').eq('id', userId).single();
      return json({ login: loginDe(p?.email, p?.dni, dniDomain), password });
    }

    if (body.action !== 'create') return json({ error: 'Acción desconocida' }, 400);

    // ── Crear cuenta (o sumar a la escuela si ya existe) ──
    const schoolId = String(body.schoolId ?? '');
    const role = String(body.role ?? '') as Role;
    const firstName = String(body.firstName ?? '').trim();
    const lastName = String(body.lastName ?? '').trim();
    const dni = cleanDni(body.dni);
    const email = String(body.email ?? '').trim().toLowerCase();
    const courseId = body.courseId ? String(body.courseId) : null;

    if (!schoolId || !ROLES.includes(role)) return json({ error: 'Escuela o rol inválido' }, 400);
    if (!firstName || !lastName) return json({ error: 'Falta el nombre o el apellido' }, 400);
    if (dni && (dni.length < 6 || dni.length > 9)) return json({ error: 'El DNI tiene que tener entre 6 y 9 números' }, 400);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'El email no es válido' }, 400);
    if (!dni && !email) return json({ error: 'Hace falta el DNI o el email' }, 400);
    if (role === 'estudiante' && (!dni || !courseId)) {
      return json({ error: 'Para un estudiante hacen falta el DNI y el curso' }, 400);
    }

    if (!(await allowed(userDb, 'admin_can_create', { p_school: schoolId, p_role: role }))) {
      return json({ error: 'No podés crear cuentas con ese rol en esta escuela.' }, 403);
    }

    if (courseId) {
      const { data: course } = await admin.from('courses').select('school_id').eq('id', courseId).maybeSingle();
      if (!course || course.school_id !== schoolId) return json({ error: 'El curso no es de esta escuela' }, 400);
    }

    const loginEmail = email || `${dni}@${dniDomain}`;
    const login = loginDe(loginEmail, dni, dniDomain);

    // ¿Ya tiene cuenta? Por email y por DNI, en dos consultas: armar un
    // .or() con el email metería texto del usuario en el filtro, y esta
    // consulta corre con la service role.
    const { data: byEmail } = await admin.from('profiles').select('id, role, email, dni').eq('email', loginEmail).maybeSingle();
    const { data: byDni } = dni && !byEmail
      ? await admin.from('profiles').select('id, role, email, dni').eq('dni', dni).maybeSingle()
      : { data: null };
    const existing = byEmail ?? byDni;

    if (existing) {
      if (existing.role === 'superadmin') return json({ error: 'Esa cuenta es de un superadmin' }, 400);
      if (role === 'estudiante') {
        return json({ error: 'Ya hay una cuenta con ese DNI. Un estudiante no puede estar en dos escuelas.' }, 409);
      }
      const { error } = await admin.from('school_memberships')
        .insert({ user_id: existing.id, school_id: schoolId, role });
      if (error) {
        if (error.code === '23505') return json({ error: 'Esa persona ya es parte de esta escuela.' }, 409);
        throw error;
      }
      // Sigue entrando con su cuenta de siempre, no con lo que se escribió ahora
      return json({ userId: existing.id, login: loginDe(existing.email, existing.dni, dniDomain), existing: true });
    }

    const password = genPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      // Rol, escuela y DNI en app_metadata: solo la service role lo escribe
      // y handle_new_user arma perfil + membresía con eso (039).
      app_metadata: { role, school_id: schoolId, dni: dni || null, must_change_password: true },
      user_metadata: { first_name: firstName, last_name: lastName, avatar_initials: initials(firstName, lastName) },
    });
    if (createError || !created.user) throw createError ?? new Error('No se pudo crear la cuenta');

    if (role === 'estudiante') {
      const { error } = await admin.from('students').insert({
        first_name: firstName,
        last_name: lastName,
        avatar_initials: initials(firstName, lastName),
        course_id: courseId,
        school_id: schoolId,
        user_id: created.user.id,
      });
      if (error) {
        // Sin ficha, la cuenta no sirve: se deshace para poder reintentar
        await admin.auth.admin.deleteUser(created.user.id);
        throw error;
      }
    }

    return json({ userId: created.user.id, login, password, existing: false });
  } catch (err) {
    console.error('admin-usuarios:', err);
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return json({ error: message.includes('already been registered') ? 'Ya hay una cuenta con ese email o DNI.' : message }, 500);
  }
});
