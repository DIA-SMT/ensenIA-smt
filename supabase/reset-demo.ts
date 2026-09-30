/**
 * ENSEÑIA SMT — Reset seguro de datos demo
 *
 * Borra TODO lo creado por seed.ts / seed-familias.ts (escuelas, cursos,
 * materias, alumnos, docentes, actividades, etc.) para poder resembrar
 * limpio con datos reales. Antes de borrar nada:
 *   1. Muestra un conteo de filas y usuarios que se van a eliminar.
 *   2. Escribe un backup JSON local (fuera del repo) de las tablas clave.
 *
 * Modo dry-run (default) — solo diagnostica, no borra nada:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/reset-demo.ts
 *
 * Modo ejecución — borra de verdad:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/reset-demo.ts --execute
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Nunca por defecto dentro del repo: el backup contiene PII (emails, nombres).
const BACKUP_DIR = process.env.RESET_BACKUP_DIR || tmpdir();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const EXECUTE = process.argv.includes('--execute');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Orden hoja → raíz: cada tabla se borra solo cuando ya no queda nada
// que la referencie, sin depender de qué ON DELETE tenga cada FK.
const TABLES_BY_ID: string[] = [
  'chat_messages',
  'chat_sessions',
  'ia_usage',
  'guardian_notices', // guardian_notice_receipts cae por FK cascade al borrar esto
  'student_guardians',
  'student_observations',
  'student_checkins',
  'alerts', // alert_students cae por FK cascade al borrar esto
  'activity_events',
  'activity_submissions',
  'activities',
  'planning_classes',
  'planning_units',
  'library_materials',
  'schedule_blocks',
  'enrollments',
  'teacher_assignments',
  'students',
  'notifications', // notification_reads cae por FK cascade al borrar esto
  'communications', // communication_recipients/reads caen por FK cascade al borrar esto
  'quick_notes',
  'live_sessions', // no está en supabase/migrations/, existe solo en la DB real
  'school_policies', // ídem
  'audit_log', // ídem
  'courses',
  'subjects',
  // 'schools' se borra al final, después de los auth.users: profiles.school_id
  // referencia a schools sin cascade, y profiles solo cae al borrar el auth.user.
];

async function countRows(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function deleteAll(table: string) {
  const { error } = await supabase.from(table).delete().not('id', 'is', null);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
}

async function backupTable(table: string): Promise<unknown[]> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw new Error(`backup ${table}: ${error.message}`);
  return data ?? [];
}

async function listAllAuthUsers() {
  const users: { id: string; email: string | undefined }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    users.push(...data.users.map(u => ({ id: u.id, email: u.email })));
    if (data.users.length < 200) break;
    page++;
  }
  return users;
}

async function main() {
  console.log(EXECUTE ? '⚠️  MODO EJECUCIÓN — se va a borrar de verdad\n' : '🔎 Modo dry-run — solo diagnóstico, no se borra nada\n');

  console.log('📊 Conteo actual:');
  const counts: Record<string, number> = {};
  for (const t of TABLES_BY_ID) {
    counts[t] = await countRows(t);
    console.log(`  ${t.padEnd(22)} ${counts[t]}`);
  }
  const schoolsCount = await countRows('schools');
  console.log(`  ${'schools'.padEnd(22)} ${schoolsCount}`);
  const authUsers = await listAllAuthUsers();
  console.log(`  ${'auth.users'.padEnd(22)} ${authUsers.length}`);
  for (const u of authUsers) console.log(`    - ${u.email}`);

  console.log('\n💾 Backup de seguridad (schools, courses, subjects, students, profiles)...');
  mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = {
    exported_at: new Date().toISOString(),
    schools: await backupTable('schools'),
    courses: await backupTable('courses'),
    subjects: await backupTable('subjects'),
    students: await backupTable('students'),
    profiles: await backupTable('profiles'),
    auth_users: authUsers,
  };
  const backupPath = `${BACKUP_DIR}/ensenia-backup-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
  console.log(`  ✓ Backup guardado en ${backupPath}`);

  if (!EXECUTE) {
    console.log('\n✋ Dry-run: no se borró nada. Corré de nuevo con --execute para borrar de verdad.');
    return;
  }

  console.log('\n🗑️  Borrando tablas...');
  for (const t of TABLES_BY_ID) {
    await deleteAll(t);
    console.log(`  ✓ ${t}`);
  }

  console.log('\n🗑️  Borrando usuarios de auth (cascada a profiles)...');
  for (const u of authUsers) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser ${u.email}: ${error.message}`);
    console.log(`  ✓ ${u.email}`);
  }

  console.log('\n🗑️  Borrando escuelas...');
  await deleteAll('schools');
  console.log('  ✓ schools');

  console.log('\n✅ Reset completo. Corré seed.ts y seed-familias.ts para recargar datos reales.');
}

main().catch(err => {
  console.error('\n❌ Reset failed:', err);
  process.exit(1);
});
