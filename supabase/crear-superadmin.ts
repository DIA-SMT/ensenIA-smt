/**
 * Crea una cuenta de superadmin (o convierte una existente).
 *
 * Desde la migración 017 el rol solo sale de app_metadata, que solo se
 * escribe con la service role: el botón "Add user" del dashboard crea
 * usuarios sin rol ni escuela y falla. Este script es la forma de dar de
 * alta al primer superadmin; los demás usuarios se crean desde la app.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/crear-superadmin.ts email@smt.gob.ar Nombre Apellido
 *
 * La clave inicial se genera y se muestra una vez; se cambia al primer ingreso.
 */

import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

const [email, firstName = 'Admin', lastName = 'SMT'] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !url || !serviceKey) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/crear-superadmin.ts <email> [nombre] [apellido]');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

function genPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const l = Array.from({ length: 5 }, () => letters[randomInt(letters.length)]).join('');
  const d = Array.from({ length: 4 }, () => digits[randomInt(digits.length)]).join('');
  return `${l}-${d}`;
}

const { data: existing } = await db.from('profiles').select('id').eq('email', email.toLowerCase()).maybeSingle();

if (existing) {
  // Cuenta existente: pasa a superadmin. Sus membresías quedan (si era
  // docente en una escuela, lo sigue siendo), pero sin escuela activa.
  const { error: authError } = await db.auth.admin.updateUserById(existing.id, { app_metadata: { role: 'superadmin' } });
  if (authError) throw authError;
  const { error } = await db.from('profiles').update({ role: 'superadmin', school_id: null }).eq('id', existing.id);
  if (error) throw error;
  console.log(`✓ ${email} ahora es superadmin (sigue con su clave de siempre).`);
} else {
  const password = genPassword();
  const { error } = await db.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    app_metadata: { role: 'superadmin', must_change_password: true },
    user_metadata: { first_name: firstName, last_name: lastName, avatar_initials: `${firstName[0]}${lastName[0]}`.toUpperCase() },
  });
  if (error) throw error;
  console.log(`✓ Superadmin creado: ${email}`);
  console.log(`  Clave inicial: ${password}  (se cambia al primer ingreso; no se vuelve a mostrar)`);
}
