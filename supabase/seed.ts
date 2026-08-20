/**
 * ENSEÑIA SMT — Database Seed Script
 *
 * Run with:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/seed.ts
 *
 * Datos basados en los programas reales de la Escuela Municipal
 * Gabriela Mistral (Física I 4°A 2026, Historia 2°B, Geografía 5°B).
 * Crea usuarios docentes Y estudiantes (con cuenta propia), enrollments
 * con ID por materia, planificación de Historia, y una actividad de
 * demostración con huella digital.
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

const ids: Record<string, string> = {};

const PASSWORD = 'demo123';

function slugEmail(first: string, last: string, domain: string): string {
  const clean = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  return `${clean(first)}.${clean(last)}@${domain}`;
}

async function main() {
  console.log('🌱 Seeding ENSEÑIA SMT (EstudIA) database...\n');

  // ═══ 1. School ═══
  console.log('📍 Creating school...');
  const { data: school, error: schoolErr } = await supabase
    .from('schools')
    .insert({
      name: 'Escuela Municipal Gabriela Mistral Secundaria',
      short_name: 'E.M. Gabriela Mistral',
      address: 'San Miguel de Tucumán',
      district: 'Capital',
    })
    .select()
    .single();
  if (schoolErr) throw schoolErr;
  ids.school = school.id;
  console.log(`  ✓ School: ${school.id}`);

  // ═══ 2. Staff auth users ═══
  console.log('\n👤 Creating staff users...');
  const staff = [
    { email: 'ana.martinez@ensenia.edu.ar', firstName: 'Ana', lastName: 'Martínez', role: 'director', initials: 'AM', key: 'director' },
    { email: 'marco.rossi@ensenia.edu.ar', firstName: 'Marco', lastName: 'Rossi', role: 'docente', initials: 'MR', key: 'marco' },
    { email: 'vera.rodriguez@ensenia.edu.ar', firstName: 'Vera', lastName: 'Rodríguez', role: 'docente', initials: 'VR', key: 'vera' },
    { email: 'elizabeth.roldan@ensenia.edu.ar', firstName: 'Elizabeth', lastName: 'Roldán', role: 'docente', initials: 'ER', key: 'eli' },
    { email: 'ariel.chavez@ensenia.edu.ar', firstName: 'Ariel', lastName: 'Chávez', role: 'docente', initials: 'AC', key: 'ariel' },
  ];

  for (const u of staff) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: u.firstName,
        last_name: u.lastName,
        role: u.role,
        school_id: ids.school,
        avatar_initials: u.initials,
      },
    });
    if (error) throw new Error(`Failed to create user ${u.email}: ${error.message}`);
    ids[`user_${u.key}`] = data.user.id;
    console.log(`  ✓ ${u.firstName} ${u.lastName} (${u.role})`);
  }

  // ═══ 3. Subjects ═══
  console.log('\n📚 Creating subjects...');
  const subjectsData = [
    { name: 'Física I', color: 'blue', key: 'fis' },
    { name: 'Historia', color: 'amber', key: 'his' },
    { name: 'Geografía', color: 'green', key: 'geo' },
  ];
  for (const s of subjectsData) {
    const { data, error } = await supabase
      .from('subjects')
      .insert({ name: s.name, color: s.color, school_id: ids.school })
      .select()
      .single();
    if (error) throw error;
    ids[`sub_${s.key}`] = data.id;
    console.log(`  ✓ ${s.name}`);
  }

  // ═══ 4. Courses ═══
  console.log('\n🏫 Creating courses...');
  const coursesData = [
    { name: '4° A', year: 4, division: 'A', studentCount: 8, key: '4a' },
    { name: '2° B', year: 2, division: 'B', studentCount: 6, key: '2b' },
    { name: '5° B', year: 5, division: 'B', studentCount: 6, key: '5b' },
  ];
  for (const c of coursesData) {
    const { data, error } = await supabase
      .from('courses')
      .insert({ name: c.name, year: c.year, division: c.division, student_count: c.studentCount, school_id: ids.school })
      .select()
      .single();
    if (error) throw error;
    ids[`course_${c.key}`] = data.id;
    console.log(`  ✓ ${c.name}`);
  }

  // ═══ 5. Teacher assignments ═══
  console.log('\n🔗 Creating teacher assignments...');
  const assignments = [
    // Marco prueba las tres materias reales
    { teacher: 'user_marco', subject: 'sub_fis', course: 'course_4a' },
    { teacher: 'user_marco', subject: 'sub_his', course: 'course_2b' },
    { teacher: 'user_marco', subject: 'sub_geo', course: 'course_5b' },
    // Docentes reales de los programas
    { teacher: 'user_vera', subject: 'sub_fis', course: 'course_4a' },
    { teacher: 'user_eli', subject: 'sub_his', course: 'course_2b' },
    { teacher: 'user_ariel', subject: 'sub_geo', course: 'course_5b' },
  ];
  for (const a of assignments) {
    const { error } = await supabase
      .from('teacher_assignments')
      .insert({ teacher_id: ids[a.teacher], subject_id: ids[a.subject], course_id: ids[a.course] });
    if (error) throw error;
  }
  console.log(`  ✓ ${assignments.length} assignments`);

  // ═══ 6. Students (con cuenta de usuario) ═══
  console.log('\n🧑‍🎓 Creating students with accounts...');
  type SeedStudent = {
    firstName: string; lastName: string; initials: string; course: string;
    status: string; alerts: number; progress: number; attendance: number; average: number; key: string;
  };
  const studentsData: SeedStudent[] = [
    // 4° A (Física I)
    { firstName: 'Martina', lastName: 'Silva', initials: 'MS', course: 'course_4a', status: 'excellent', alerts: 0, progress: 95, attendance: 97, average: 9.2, key: 'st1' },
    { firstName: 'Juan', lastName: 'Pérez', initials: 'JP', course: 'course_4a', status: 'critical', alerts: 3, progress: 45, attendance: 62, average: 4.8, key: 'st2' },
    { firstName: 'Lucía', lastName: 'Gómez', initials: 'LG', course: 'course_4a', status: 'good', alerts: 0, progress: 80, attendance: 88, average: 7.5, key: 'st3' },
    { firstName: 'Tomás', lastName: 'Rodríguez', initials: 'TR', course: 'course_4a', status: 'warning', alerts: 1, progress: 65, attendance: 75, average: 6.1, key: 'st4' },
    { firstName: 'Valentina', lastName: 'López', initials: 'VL', course: 'course_4a', status: 'excellent', alerts: 0, progress: 92, attendance: 95, average: 8.8, key: 'st5' },
    { firstName: 'Agustín', lastName: 'Fernández', initials: 'AF', course: 'course_4a', status: 'good', alerts: 0, progress: 78, attendance: 90, average: 7.2, key: 'st6' },
    { firstName: 'Camila', lastName: 'Torres', initials: 'CT', course: 'course_4a', status: 'excellent', alerts: 0, progress: 91, attendance: 96, average: 9.0, key: 'st7' },
    { firstName: 'Mateo', lastName: 'Díaz', initials: 'MD', course: 'course_4a', status: 'warning', alerts: 2, progress: 55, attendance: 70, average: 5.5, key: 'st8' },
    // 2° B (Historia)
    { firstName: 'Sofía', lastName: 'Ramírez', initials: 'SR', course: 'course_2b', status: 'excellent', alerts: 0, progress: 94, attendance: 98, average: 9.5, key: 'st9' },
    { firstName: 'Nicolás', lastName: 'Moreno', initials: 'NM', course: 'course_2b', status: 'good', alerts: 0, progress: 82, attendance: 85, average: 7.8, key: 'st10' },
    { firstName: 'María', lastName: 'López', initials: 'ML', course: 'course_2b', status: 'critical', alerts: 2, progress: 40, attendance: 58, average: 4.2, key: 'st11' },
    { firstName: 'Diego', lastName: 'Álvarez', initials: 'DA', course: 'course_2b', status: 'good', alerts: 0, progress: 76, attendance: 87, average: 7.0, key: 'st12' },
    { firstName: 'Carolina', lastName: 'Benítez', initials: 'CB', course: 'course_2b', status: 'excellent', alerts: 0, progress: 89, attendance: 93, average: 8.5, key: 'st13' },
    { firstName: 'Facundo', lastName: 'Giménez', initials: 'FG', course: 'course_2b', status: 'good', alerts: 0, progress: 74, attendance: 82, average: 7.1, key: 'st14' },
    // 5° B (Geografía)
    { firstName: 'Abril', lastName: 'Sosa', initials: 'AS', course: 'course_5b', status: 'warning', alerts: 1, progress: 60, attendance: 72, average: 5.8, key: 'st15' },
    { firstName: 'Lautaro', lastName: 'Medina', initials: 'LM', course: 'course_5b', status: 'excellent', alerts: 0, progress: 88, attendance: 94, average: 8.6, key: 'st16' },
    { firstName: 'Julieta', lastName: 'Herrera', initials: 'JH', course: 'course_5b', status: 'good', alerts: 0, progress: 79, attendance: 88, average: 7.4, key: 'st17' },
    { firstName: 'Sebastián', lastName: 'Castro', initials: 'SC', course: 'course_5b', status: 'critical', alerts: 3, progress: 38, attendance: 55, average: 3.9, key: 'st18' },
    { firstName: 'Renata', lastName: 'Núñez', initials: 'RN', course: 'course_5b', status: 'excellent', alerts: 0, progress: 96, attendance: 99, average: 9.7, key: 'st19' },
    { firstName: 'Ignacio', lastName: 'Vera', initials: 'IV', course: 'course_5b', status: 'good', alerts: 0, progress: 81, attendance: 86, average: 7.6, key: 'st20' },
  ];

  for (const s of studentsData) {
    const email = slugEmail(s.firstName, s.lastName, 'estudiante.ensenia.edu.ar');
    // 1. cuenta auth con rol estudiante
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: s.firstName,
        last_name: s.lastName,
        role: 'estudiante',
        school_id: ids.school,
        avatar_initials: s.initials,
      },
    });
    if (authErr) throw new Error(`auth ${email}: ${authErr.message}`);
    ids[`auth_${s.key}`] = authUser.user.id;

    // 2. ficha de estudiante vinculada
    const { data, error } = await supabase
      .from('students')
      .insert({
        first_name: s.firstName,
        last_name: s.lastName,
        avatar_initials: s.initials,
        course_id: ids[s.course],
        status: s.status,
        alerts_count: s.alerts,
        progress: s.progress,
        attendance: s.attendance,
        average: s.average,
        school_id: ids.school,
        user_id: authUser.user.id,
        email,
      })
      .select()
      .single();
    if (error) throw error;
    ids[s.key] = data.id;
  }
  console.log(`  ✓ ${studentsData.length} students + accounts (password: ${PASSWORD})`);

  // ═══ 7. Enrollments (ID por materia) ═══
  console.log('\n🎫 Creating enrollments...');
  const courseSubject: Record<string, { subject: string; prefix: string }> = {
    course_4a: { subject: 'sub_fis', prefix: 'FIS4A' },
    course_2b: { subject: 'sub_his', prefix: 'HIS2B' },
    course_5b: { subject: 'sub_geo', prefix: 'GEO5B' },
  };
  const counters: Record<string, number> = {};
  for (const s of studentsData) {
    const cfg = courseSubject[s.course];
    counters[cfg.prefix] = (counters[cfg.prefix] ?? 0) + 1;
    const code = `${cfg.prefix}-${String(counters[cfg.prefix]).padStart(2, '0')}`;
    const { error } = await supabase.from('enrollments').insert({
      student_id: ids[s.key],
      subject_id: ids[cfg.subject],
      course_id: ids[s.course],
      enrollment_code: code,
      school_id: ids.school,
    });
    if (error) throw error;
  }
  console.log(`  ✓ ${studentsData.length} enrollments`);

  // ═══ 8. Schedule (Marco) ═══
  console.log('\n📅 Creating schedule...');
  const scheduleData = [
    { subject: 'sub_fis', course: 'course_4a', subjectName: 'Física I', courseName: '4° A', day: 'lunes', dayIdx: 0, hour: 8, room: 'Laboratorio', color: 'blue', students: 8 },
    { subject: 'sub_his', course: 'course_2b', subjectName: 'Historia', courseName: '2° B', day: 'martes', dayIdx: 1, hour: 10, room: 'Aula 3', color: 'amber', students: 6 },
    { subject: 'sub_fis', course: 'course_4a', subjectName: 'Física I', courseName: '4° A', day: 'miercoles', dayIdx: 2, hour: 8, room: 'Aula 14', color: 'blue', students: 8 },
    { subject: 'sub_his', course: 'course_2b', subjectName: 'Historia', courseName: '2° B', day: 'jueves', dayIdx: 3, hour: 8, room: 'Aula 3', color: 'amber', students: 6 },
    { subject: 'sub_geo', course: 'course_5b', subjectName: 'Geografía', courseName: '5° B', day: 'viernes', dayIdx: 4, hour: 10, room: 'Aula 7', color: 'green', students: 6 },
  ];
  for (const s of scheduleData) {
    const { error } = await supabase.from('schedule_blocks').insert({
      teacher_id: ids.user_marco,
      subject_id: ids[s.subject],
      course_id: ids[s.course],
      subject_name: s.subjectName,
      course_name: s.courseName,
      day_of_week: s.day,
      day_index: s.dayIdx,
      start_hour: s.hour,
      duration: 1.5,
      room: s.room,
      color_class: s.color,
      student_count: s.students,
      school_id: ids.school,
    });
    if (error) throw error;
  }
  console.log(`  ✓ ${scheduleData.length} blocks`);

  // ═══ 9. Planificación: Historia 2°B (del programa real 2025) ═══
  // Física I 4°A queda VACÍA a propósito: se carga con "Importar programa" desde el PDF.
  console.log('\n📖 Creating Historia planning (programa real)...');
  const historiaUnits = [
    {
      title: 'Unidad 1: Desde los inicios del mundo moderno',
      classes: [
        { title: 'La caída del Imperio Romano y el mundo feudal', objectives: ['Identificar las características generales del feudalismo', 'Ubicar temporalmente la transición hacia la modernidad'] },
        { title: 'La crisis del Siglo XIV y la recuperación del Siglo XV', objectives: ['Analizar los cambios hacia una economía moderna', 'Reconocer el ascenso de la burguesía'] },
        { title: 'Humanismo y Renacimiento', objectives: ['Comprender los movimientos culturales de la modernidad'] },
        { title: 'La Reforma Protestante y Católica', objectives: ['Comparar las posturas religiosas del período'] },
      ],
    },
    {
      title: 'Unidad 2: La conquista de América',
      classes: [
        { title: 'América antes de la conquista: Mayas, Aztecas e Incas', objectives: ['Caracterizar las civilizaciones precolombinas'] },
        { title: 'La expansión europea y la conquista', objectives: ['Identificar los factores que favorecieron la expansión', 'Contrastar la postura indigenista y la hispanista'] },
        { title: 'La colonización: sociedad colonial y mestizaje', objectives: ['Describir los grupos de la sociedad colonial', 'Analizar el rol de la Iglesia y las instituciones de gobierno'] },
      ],
    },
    {
      title: 'Unidad 3: El siglo XVIII, un siglo de cambios',
      classes: [
        { title: 'El absolutismo monárquico y el Iluminismo', objectives: ['Explicar la crisis del absolutismo'] },
        { title: 'La Revolución Industrial y la Revolución Francesa', objectives: ['Analizar causas, cambios y consecuencias de ambas revoluciones'] },
      ],
    },
  ];

  let unitOrder = 1;
  for (const u of historiaUnits) {
    const { data: unit, error } = await supabase
      .from('planning_units')
      .insert({
        title: u.title,
        subject_id: ids.sub_his,
        course_id: ids.course_2b,
        teacher_id: ids.user_marco,
        sort_order: unitOrder++,
      })
      .select()
      .single();
    if (error) throw error;
    let clsOrder = 1;
    for (const c of u.classes) {
      const { data: cls, error: clsErr } = await supabase
        .from('planning_classes')
        .insert({
          unit_id: unit.id,
          title: c.title,
          sort_order: clsOrder++,
          objectives: c.objectives,
          is_complete: false,
        })
        .select()
        .single();
      if (clsErr) throw clsErr;
      if (c.title.includes('Mayas')) ids.class_conquista = cls.id;
    }
    if (u.title.startsWith('Unidad 2')) ids.unit_conquista = unit.id;
  }
  console.log('  ✓ 3 unidades / 9 clases de Historia');

  // ═══ 10. Actividad demo con huella digital ═══
  console.log('\n📝 Creating demo activity + digital footprint...');
  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .insert({
      title: 'Cuestionario: América antes de la conquista',
      description: 'Actividad de diagnóstico sobre las civilizaciones precolombinas.',
      content_md: [
        '## 📚 América antes de la conquista',
        '',
        'Antes de la llegada de los europeos, América estaba habitada por grandes civilizaciones: los **Mayas**, los **Aztecas** y los **Incas**.',
        '',
        'Leé el material visto en clase y respondé el cuestionario. Tenés una sola entrega, ¡tomate tu tiempo! 💪',
      ].join('\n'),
      questions: [
        { id: 'q1', type: 'multiple_choice', prompt: '¿Cuál de estas civilizaciones se desarrolló en la zona andina de Sudamérica?', options: ['Mayas', 'Aztecas', 'Incas', 'Olmecas'], correct_index: 2 },
        { id: 'q2', type: 'multiple_choice', prompt: 'La capital del imperio azteca era:', options: ['Cuzco', 'Tenochtitlán', 'Chichén Itzá', 'Machu Picchu'], correct_index: 1 },
        { id: 'q3', type: 'multiple_choice', prompt: '¿Qué civilización desarrolló un sistema de escritura jeroglífica y un calendario muy preciso?', options: ['Incas', 'Guaraníes', 'Mayas', 'Diaguitas'], correct_index: 2 },
        { id: 'q4', type: 'open', prompt: 'Mencioná dos factores que favorecieron la expansión europea hacia América.' },
      ],
      subject_id: ids.sub_his,
      course_id: ids.course_2b,
      teacher_id: ids.user_marco,
      school_id: ids.school,
      unit_id: ids.unit_conquista,
      class_id: ids.class_conquista,
      source_tool: 'eval',
      status: 'published',
      points: 10,
      due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })
    .select()
    .single();
  if (actErr) throw actErr;
  ids.demo_activity = activity.id;

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

  // Sofía: entregó (huella completa)
  await supabase.from('activity_submissions').insert({
    activity_id: activity.id,
    student_id: ids.st9,
    status: 'submitted',
    answers: {
      q1: { answer: 2, correct: true },
      q2: { answer: 1, correct: true },
      q3: { answer: 2, correct: true },
      q4: { answer: 'La búsqueda de nuevas rutas comerciales hacia Oriente y los avances en navegación como la carabela y la brújula.' },
    },
    auto_score: 10,
    time_spent_seconds: 1140,
    started_at: hoursAgo(26),
    submitted_at: hoursAgo(25.7),
  });
  const sofiaEvents = [
    { type: 'viewed', at: hoursAgo(27) },
    { type: 'started', at: hoursAgo(26) },
    { type: 'answer_changed', at: hoursAgo(25.95), meta: { question: 'q1' } },
    { type: 'answer_changed', at: hoursAgo(25.9), meta: { question: 'q2' } },
    { type: 'answer_changed', at: hoursAgo(25.85), meta: { question: 'q3' } },
    { type: 'answer_changed', at: hoursAgo(25.75), meta: { question: 'q4' } },
    { type: 'submitted', at: hoursAgo(25.7) },
  ];
  for (const e of sofiaEvents) {
    await supabase.from('activity_events').insert({
      activity_id: activity.id, student_id: ids.st9, event_type: e.type,
      metadata: e.meta ?? {}, created_at: e.at,
    });
  }

  // Nicolás: en progreso
  await supabase.from('activity_submissions').insert({
    activity_id: activity.id,
    student_id: ids.st10,
    status: 'in_progress',
    answers: { q1: { answer: 2, correct: true }, q2: { answer: 0, correct: false } },
    time_spent_seconds: 420,
    started_at: hoursAgo(3),
  });
  for (const e of [
    { type: 'viewed', at: hoursAgo(20) },
    { type: 'viewed', at: hoursAgo(3.1) },
    { type: 'started', at: hoursAgo(3) },
    { type: 'answer_changed', at: hoursAgo(2.9), meta: { question: 'q1' } },
    { type: 'answer_changed', at: hoursAgo(2.85), meta: { question: 'q2' } },
    { type: 'focus_lost', at: hoursAgo(2.8) },
  ]) {
    await supabase.from('activity_events').insert({
      activity_id: activity.id, student_id: ids.st10, event_type: e.type,
      metadata: (e as any).meta ?? {}, created_at: e.at,
    });
  }

  // María: solo lo vio
  await supabase.from('activity_events').insert({
    activity_id: activity.id, student_id: ids.st11, event_type: 'viewed',
    metadata: {}, created_at: hoursAgo(6),
  });

  console.log('  ✓ Actividad demo con 3 huellas digitales distintas');

  // ═══ 11. Alerts + notification ═══
  console.log('\n🚨 Creating alerts...');
  const alertsData = [
    { type: 'danger', category: 'attendance', title: 'Inasistencias consecutivas', message: 'Juan Pérez (4° A) tiene 5 inasistencias consecutivas.', dateLabel: 'Hoy', studentKeys: ['st2'] },
    { type: 'warning', category: 'academic', title: 'Actividad sin entregar', message: 'María López (2° B) vio el cuestionario de Historia pero no lo comenzó.', dateLabel: 'Hoy', studentKeys: ['st11'] },
    { type: 'success', category: 'academic', title: 'Entrega destacada', message: 'Sofía Ramírez completó el cuestionario de Historia con 10/10.', dateLabel: 'Ayer', studentKeys: ['st9'], isRead: true },
  ];
  for (const a of alertsData) {
    const { data: alert, error } = await supabase
      .from('alerts')
      .insert({
        type: a.type, category: a.category, title: a.title, message: a.message,
        date_label: a.dateLabel, teacher_id: ids.user_marco, school_id: ids.school,
        is_read: a.isRead ?? false,
      })
      .select()
      .single();
    if (error) throw error;
    for (const sk of a.studentKeys) {
      await supabase.from('alert_students').insert({ alert_id: alert.id, student_id: ids[sk] });
    }
  }
  await supabase.from('notifications').insert({
    from_user_id: ids.user_director,
    to_user_id: null,
    title: 'Bienvenidos a ENSEÑIA',
    message: 'Ya está disponible la nueva plataforma con biblioteca digital, generación de contenido con IA y actividades para estudiantes.',
    priority: 'medium',
    school_id: ids.school,
  });
  console.log('  ✓ Alerts + notification');

  // ═══ 12. Segunda escuela: E.M. Alfonsina Storni ═══
  // Ejercita el modo multiescuela desde el día uno: RLS por escuela,
  // filtros explícitos en servicios y (a futuro) supervisión municipal.
  console.log('\n🏫 Creating second school (Alfonsina Storni)...');
  const { data: school2, error: school2Err } = await supabase
    .from('schools')
    .insert({
      name: 'Escuela Municipal Alfonsina Storni Secundaria',
      short_name: 'E.M. Alfonsina Storni',
      address: 'San Miguel de Tucumán',
      district: 'Capital',
    })
    .select()
    .single();
  if (school2Err) throw school2Err;
  ids.school2 = school2.id;
  console.log(`  ✓ School: ${school2.id}`);

  const storniStaff = [
    { email: 'silvia.aguirre@ensenia.edu.ar', firstName: 'Silvia', lastName: 'Aguirre', role: 'director', initials: 'SA', key: 'director2' },
    { email: 'pablo.leiva@ensenia.edu.ar', firstName: 'Pablo', lastName: 'Leiva', role: 'docente', initials: 'PL', key: 'pablo' },
  ];
  for (const u of storniStaff) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: u.firstName,
        last_name: u.lastName,
        role: u.role,
        school_id: ids.school2,
        avatar_initials: u.initials,
      },
    });
    if (error) throw new Error(`Failed to create user ${u.email}: ${error.message}`);
    ids[`user_${u.key}`] = data.user.id;
    console.log(`  ✓ ${u.firstName} ${u.lastName} (${u.role})`);
  }

  const { data: sub2, error: sub2Err } = await supabase
    .from('subjects')
    .insert({ name: 'Matemática', color: 'purple', school_id: ids.school2 })
    .select()
    .single();
  if (sub2Err) throw sub2Err;
  ids.sub2_mat = sub2.id;

  const { data: course2, error: course2Err } = await supabase
    .from('courses')
    .insert({ name: '3° A', year: 3, division: 'A', student_count: 4, school_id: ids.school2 })
    .select()
    .single();
  if (course2Err) throw course2Err;
  ids.course2_3a = course2.id;

  const { error: assign2Err } = await supabase
    .from('teacher_assignments')
    .insert({ teacher_id: ids.user_pablo, subject_id: ids.sub2_mat, course_id: ids.course2_3a });
  if (assign2Err) throw assign2Err;

  const storniStudents = [
    { firstName: 'Bruno', lastName: 'Ledesma', initials: 'BL', status: 'good', alerts: 0, progress: 77, attendance: 89, average: 7.3, key: 'st2_1' },
    { firstName: 'Milagros', lastName: 'Ponce', initials: 'MP', status: 'excellent', alerts: 0, progress: 93, attendance: 96, average: 9.1, key: 'st2_2' },
    { firstName: 'Thiago', lastName: 'Correa', initials: 'TC', status: 'warning', alerts: 1, progress: 58, attendance: 71, average: 5.7, key: 'st2_3' },
    { firstName: 'Zoe', lastName: 'Villagra', initials: 'ZV', status: 'good', alerts: 0, progress: 83, attendance: 91, average: 7.9, key: 'st2_4' },
  ];
  let matCounter = 0;
  for (const s of storniStudents) {
    const email = slugEmail(s.firstName, s.lastName, 'estudiante.ensenia.edu.ar');
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: s.firstName,
        last_name: s.lastName,
        role: 'estudiante',
        school_id: ids.school2,
        avatar_initials: s.initials,
      },
    });
    if (authErr) throw new Error(`auth ${email}: ${authErr.message}`);

    const { data, error } = await supabase
      .from('students')
      .insert({
        first_name: s.firstName,
        last_name: s.lastName,
        avatar_initials: s.initials,
        course_id: ids.course2_3a,
        status: s.status,
        alerts_count: s.alerts,
        progress: s.progress,
        attendance: s.attendance,
        average: s.average,
        school_id: ids.school2,
        user_id: authUser.user.id,
        email,
      })
      .select()
      .single();
    if (error) throw error;
    ids[s.key] = data.id;

    matCounter += 1;
    const { error: enrErr } = await supabase.from('enrollments').insert({
      student_id: data.id,
      subject_id: ids.sub2_mat,
      course_id: ids.course2_3a,
      enrollment_code: `MAT3A-${String(matCounter).padStart(2, '0')}`,
      school_id: ids.school2,
    });
    if (enrErr) throw enrErr;
  }
  console.log(`  ✓ ${storniStudents.length} students + accounts + enrollments`);

  const { error: sched2Err } = await supabase.from('schedule_blocks').insert({
    teacher_id: ids.user_pablo,
    subject_id: ids.sub2_mat,
    course_id: ids.course2_3a,
    subject_name: 'Matemática',
    course_name: '3° A',
    day_of_week: 'lunes',
    day_index: 0,
    start_hour: 8,
    duration: 1.5,
    room: 'Aula 2',
    color_class: 'purple',
    student_count: 4,
    school_id: ids.school2,
  });
  if (sched2Err) throw sched2Err;

  await supabase.from('notifications').insert({
    from_user_id: ids.user_director2,
    to_user_id: null,
    title: 'Bienvenidos a ENSEÑIA',
    message: 'La plataforma ya está disponible para la E.M. Alfonsina Storni.',
    priority: 'medium',
    school_id: ids.school2,
  });
  console.log('  ✓ Schedule + notification');

  console.log('\n✅ Seed completo.\n');
  console.log('── Cuentas de prueba (password: demo123) ──');
  console.log('── E.M. Gabriela Mistral ──');
  console.log('  Directora:  ana.martinez@ensenia.edu.ar');
  console.log('  Docente:    marco.rossi@ensenia.edu.ar  (Física I 4°A, Historia 2°B, Geografía 5°B)');
  console.log('  Estudiante: sofia.ramirez@estudiante.ensenia.edu.ar  (2° B, entregó la actividad)');
  console.log('  Estudiante: nicolas.moreno@estudiante.ensenia.edu.ar (2° B, actividad en progreso)');
  console.log('  Estudiante: martina.silva@estudiante.ensenia.edu.ar  (4° A, Física)');
  console.log('── E.M. Alfonsina Storni ──');
  console.log('  Directora:  silvia.aguirre@ensenia.edu.ar');
  console.log('  Docente:    pablo.leiva@ensenia.edu.ar  (Matemática 3°A)');
  console.log('  Estudiante: bruno.ledesma@estudiante.ensenia.edu.ar (3° A)');
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
