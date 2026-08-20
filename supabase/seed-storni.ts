/**
 * Seed incremental: E.M. Alfonsina Storni sobre una base ya poblada.
 * No toca nada de la Mistral. Idempotente: si la Storni ya existe, sale.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/seed-storni.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'demo123';

function slugEmail(first: string, last: string, domain: string): string {
  const clean = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  return `${clean(first)}.${clean(last)}@${domain}`;
}

async function main() {
  console.log('🌱 Seed incremental: E.M. Alfonsina Storni...\n');

  const { data: existing } = await supabase
    .from('schools')
    .select('id')
    .eq('short_name', 'E.M. Alfonsina Storni')
    .maybeSingle();
  if (existing) {
    console.log('✋ La E.M. Alfonsina Storni ya existe. Nada que hacer.');
    return;
  }

  const { data: school, error: schoolErr } = await supabase
    .from('schools')
    .insert({
      name: 'Escuela Municipal Alfonsina Storni Secundaria',
      short_name: 'E.M. Alfonsina Storni',
      address: 'San Miguel de Tucumán',
      district: 'Capital',
    })
    .select()
    .single();
  if (schoolErr) throw schoolErr;
  console.log(`  ✓ School: ${school.id}`);

  const staff = [
    { email: 'silvia.aguirre@ensenia.edu.ar', firstName: 'Silvia', lastName: 'Aguirre', role: 'director', initials: 'SA' },
    { email: 'pablo.leiva@ensenia.edu.ar', firstName: 'Pablo', lastName: 'Leiva', role: 'docente', initials: 'PL' },
  ];
  const staffIds: Record<string, string> = {};
  for (const u of staff) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: u.firstName,
        last_name: u.lastName,
        role: u.role,
        school_id: school.id,
        avatar_initials: u.initials,
      },
    });
    if (error) throw new Error(`${u.email}: ${error.message}`);
    staffIds[u.role] = data.user.id;
    console.log(`  ✓ ${u.firstName} ${u.lastName} (${u.role})`);
  }

  const { data: subject, error: subErr } = await supabase
    .from('subjects')
    .insert({ name: 'Matemática', color: 'purple', school_id: school.id })
    .select()
    .single();
  if (subErr) throw subErr;

  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .insert({ name: '3° A', year: 3, division: 'A', student_count: 4, school_id: school.id })
    .select()
    .single();
  if (courseErr) throw courseErr;

  const { error: assignErr } = await supabase
    .from('teacher_assignments')
    .insert({ teacher_id: staffIds.docente, subject_id: subject.id, course_id: course.id });
  if (assignErr) throw assignErr;
  console.log('  ✓ Matemática 3°A asignada a Pablo');

  const students = [
    { firstName: 'Bruno', lastName: 'Ledesma', initials: 'BL', status: 'good', alerts: 0, progress: 77, attendance: 89, average: 7.3 },
    { firstName: 'Milagros', lastName: 'Ponce', initials: 'MP', status: 'excellent', alerts: 0, progress: 93, attendance: 96, average: 9.1 },
    { firstName: 'Thiago', lastName: 'Correa', initials: 'TC', status: 'warning', alerts: 1, progress: 58, attendance: 71, average: 5.7 },
    { firstName: 'Zoe', lastName: 'Villagra', initials: 'ZV', status: 'good', alerts: 0, progress: 83, attendance: 91, average: 7.9 },
  ];
  let n = 0;
  for (const s of students) {
    const email = slugEmail(s.firstName, s.lastName, 'estudiante.ensenia.edu.ar');
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: s.firstName,
        last_name: s.lastName,
        role: 'estudiante',
        school_id: school.id,
        avatar_initials: s.initials,
      },
    });
    if (authErr) throw new Error(`auth ${email}: ${authErr.message}`);

    const { data: st, error: stErr } = await supabase
      .from('students')
      .insert({
        first_name: s.firstName,
        last_name: s.lastName,
        avatar_initials: s.initials,
        course_id: course.id,
        status: s.status,
        alerts_count: s.alerts,
        progress: s.progress,
        attendance: s.attendance,
        average: s.average,
        school_id: school.id,
        user_id: authUser.user.id,
        email,
      })
      .select()
      .single();
    if (stErr) throw stErr;

    n += 1;
    const { error: enrErr } = await supabase.from('enrollments').insert({
      student_id: st.id,
      subject_id: subject.id,
      course_id: course.id,
      enrollment_code: `MAT3A-${String(n).padStart(2, '0')}`,
      school_id: school.id,
    });
    if (enrErr) throw enrErr;
  }
  console.log(`  ✓ ${students.length} estudiantes + cuentas + enrollments`);

  const { error: schedErr } = await supabase.from('schedule_blocks').insert({
    teacher_id: staffIds.docente,
    subject_id: subject.id,
    course_id: course.id,
    subject_name: 'Matemática',
    course_name: '3° A',
    day_of_week: 'lunes',
    day_index: 0,
    start_hour: 8,
    duration: 1.5,
    room: 'Aula 2',
    color_class: 'purple',
    student_count: 4,
    school_id: school.id,
  });
  if (schedErr) throw schedErr;

  await supabase.from('notifications').insert({
    from_user_id: staffIds.director,
    to_user_id: null,
    title: 'Bienvenidos a ENSEÑIA',
    message: 'La plataforma ya está disponible para la E.M. Alfonsina Storni.',
    priority: 'medium',
    school_id: school.id,
  });
  console.log('  ✓ Horario + notificación\n');

  console.log('✅ Storni lista.');
  console.log('── Cuentas (password: demo123) ──');
  console.log('  Directora:  silvia.aguirre@ensenia.edu.ar');
  console.log('  Docente:    pablo.leiva@ensenia.edu.ar (Matemática 3°A)');
  console.log('  Estudiante: bruno.ledesma@estudiante.ensenia.edu.ar (3°A)');
}

main().catch(err => { console.error('❌', err); process.exit(1); });
