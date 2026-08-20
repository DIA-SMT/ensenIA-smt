/**
 * Seed incremental: familias demo + datos de bienestar.
 * Correr DESPUÉS del seed principal:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed-familias.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('🌱 Seed familias + bienestar...\n');

  // Multiescuela: apuntar SIEMPRE a la Mistral por nombre, nunca a "la primera".
  const { data: school } = await supabase
    .from('schools')
    .select('id')
    .eq('short_name', 'E.M. Gabriela Mistral')
    .single();
  if (!school) throw new Error('No está la E.M. Gabriela Mistral; corré el seed principal primero.');

  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name, email')
    .eq('school_id', school.id);
  const byEmail = new Map((students ?? []).map(s => [s.email, s]));
  const sofia = byEmail.get('sofia.ramirez@estudiante.ensenia.edu.ar');
  const juan = byEmail.get('juan.perez@estudiante.ensenia.edu.ar');
  if (!sofia || !juan) throw new Error('Faltan estudiantes del seed principal.');

  const { data: directora } = await supabase.from('profiles').select('id').eq('email', 'ana.martinez@ensenia.edu.ar').single();
  const { data: marco } = await supabase.from('profiles').select('id').eq('email', 'marco.rossi@ensenia.edu.ar').single();
  if (!directora || !marco) throw new Error('Faltan los perfiles staff del seed principal.');

  // ── Padres/tutores ──
  const parents = [
    { email: 'laura.paz@familia.ensenia.edu.ar', firstName: 'Laura', lastName: 'Paz', initials: 'LP', child: sofia, relationship: 'madre' },
    { email: 'roberto.perez@familia.ensenia.edu.ar', firstName: 'Roberto', lastName: 'Pérez', initials: 'RP', child: juan, relationship: 'padre' },
  ];

  for (const p of parents) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: p.email,
      password: 'demo123',
      email_confirm: true,
      user_metadata: {
        first_name: p.firstName,
        last_name: p.lastName,
        role: 'padre',
        school_id: school.id,
        avatar_initials: p.initials,
      },
    });
    if (error) throw new Error(`${p.email}: ${error.message}`);
    const { error: linkErr } = await supabase.from('student_guardians').insert({
      student_id: p.child.id,
      guardian_user_id: created.user.id,
      relationship: p.relationship,
    });
    if (linkErr) throw linkErr;
    console.log(`  ✓ ${p.firstName} ${p.lastName} (${p.relationship} de ${p.child.first_name})`);
  }

  // ── Comunicados demo ──
  await supabase.from('guardian_notices').insert({
    school_id: school.id,
    student_id: null,
    from_user_id: directora!.id,
    type: 'comunicado',
    title: 'Acto por el Día de la Independencia',
    body: 'Estimadas familias: los invitamos al acto escolar el próximo viernes a las 10:00 en el patio central. Los estudiantes deben asistir con uniforme completo.',
  });

  await supabase.from('guardian_notices').insert({
    school_id: school.id,
    student_id: juan.id,
    from_user_id: marco!.id,
    type: 'citacion',
    title: 'Citación: seguimiento académico de Juan',
    body: 'Los convocamos a una reunión para conversar sobre las inasistencias recientes de Juan y armar juntos un plan de acompañamiento.',
    meeting_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    meeting_place: 'Dirección — E.M. Gabriela Mistral',
  });
  console.log('  ✓ 1 comunicado general + 1 citación');

  // ── Bienestar demo: check-ins de Sofía y Nicolás en la actividad ──
  const { data: activity } = await supabase
    .from('activities')
    .select('id')
    .eq('teacher_id', marco.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const nicolas = byEmail.get('nicolas.moreno@estudiante.ensenia.edu.ar');
  if (activity && nicolas) {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();
    await supabase.from('student_checkins').insert([
      { student_id: sofia.id, activity_id: activity.id, moment: 'inicio', feeling: 'bien', created_at: hoursAgo(27) },
      { student_id: sofia.id, activity_id: activity.id, moment: 'fin', feeling: 'genial', comment: 'Me gustó, ¡estaba fácil!', created_at: hoursAgo(25.6) },
      { student_id: nicolas.id, activity_id: activity.id, moment: 'inicio', feeling: 'confundido', comment: 'No entiendo bien lo de los incas', created_at: hoursAgo(3) },
    ]);
    console.log('  ✓ 3 check-ins emocionales');
  }

  // ── Observaciones demo del docente ──
  await supabase.from('student_observations').insert([
    { student_id: juan.id, teacher_id: marco!.id, category: 'dificultad', note: 'Le cuesta sostener la atención en clases largas. Rinde mucho mejor con actividades cortas y concretas.' },
    { student_id: juan.id, teacher_id: marco!.id, category: 'familia', note: 'La familia avisó que está pasando por una mudanza. Tener paciencia con las entregas de esta semana.' },
    { student_id: sofia.id, teacher_id: marco!.id, category: 'logro', note: 'Excelente razonamiento en la actividad de civilizaciones. Podría ayudar como tutora de pares.' },
  ]);
  console.log('  ✓ 3 observaciones docentes');

  console.log('\n✅ Listo.');
  console.log('── Cuentas familia (password: demo123) ──');
  console.log('  laura.paz@familia.ensenia.edu.ar    (madre de Sofía, 2°B)');
  console.log('  roberto.perez@familia.ensenia.edu.ar (padre de Juan, 4°A — tiene una citación)');
}

main().catch(err => { console.error('❌', err); process.exit(1); });
