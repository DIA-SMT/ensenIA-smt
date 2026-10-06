/**
 * SMT EstudIA — Database Seed Script
 *
 * Run with:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/seed.ts
 *
 * Dos escuelas reales que están probando el sistema, cada una con sus
 * tres materias reales (Matemática, Físico-Química, Lengua):
 *   - Escuela Municipal Gabriela Mistral Secundaria — 3° A
 *   - Escuela Municipal Alfonsina Storni Secundaria — 2° A
 *
 * Las 6 materias quedan sin planificación precargada a propósito: se
 * completan en vivo subiendo los programas reales con "Importar
 * programa desde PDF". Los alumnos son placeholders ficticios (no hay
 * nómina real todavía) para poder probar asistencia/notas/alertas.
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
  console.log('🌱 Seeding SMT EstudIA database...\n');

  // ═══ 1. Schools ═══
  console.log('📍 Creating schools...');
  const schoolsData = [
    { name: 'Escuela Municipal Gabriela Mistral Secundaria', shortName: 'E.M. Gabriela Mistral', key: 'gm' },
    { name: 'Escuela Municipal Alfonsina Storni Secundaria', shortName: 'E.M. Alfonsina Storni', key: 'as' },
  ];
  for (const s of schoolsData) {
    const { data, error } = await supabase
      .from('schools')
      .insert({
        name: s.name,
        short_name: s.shortName,
        address: 'San Miguel de Tucumán',
        district: 'Capital',
      })
      .select()
      .single();
    if (error) throw error;
    ids[`school_${s.key}`] = data.id;
    console.log(`  ✓ ${s.name}`);
  }

  // ═══ 2. Staff auth users ═══
  console.log('\n👤 Creating staff users...');
  const staff = [
    { email: 'ana.martinez@ensenia.edu.ar', firstName: 'Ana', lastName: 'Martínez', role: 'director', initials: 'AM', key: 'director', school: 'school_gm' },
    { email: 'marco.rossi@ensenia.edu.ar', firstName: 'Marco', lastName: 'Rossi', role: 'docente', initials: 'MR', key: 'marco', school: 'school_gm' },
    { email: 'vera.rodriguez@ensenia.edu.ar', firstName: 'Vera', lastName: 'Rodríguez', role: 'docente', initials: 'VR', key: 'vera', school: 'school_gm' },
    { email: 'elizabeth.roldan@ensenia.edu.ar', firstName: 'Elizabeth', lastName: 'Roldán', role: 'docente', initials: 'ER', key: 'eli', school: 'school_gm' },
    { email: 'ariel.chavez@ensenia.edu.ar', firstName: 'Ariel', lastName: 'Chávez', role: 'docente', initials: 'AC', key: 'ariel', school: 'school_gm' },
  ];

  for (const u of staff) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      // Rol y escuela van en app_metadata: solo la service role puede
      // escribirlo, y es lo único que lee handle_new_user (migración 017).
      app_metadata: { role: u.role, school_id: ids[u.school] },
      user_metadata: {
        first_name: u.firstName,
        last_name: u.lastName,
        avatar_initials: u.initials,
      },
    });
    if (error) throw new Error(`Failed to create user ${u.email}: ${error.message}`);
    ids[`user_${u.key}`] = data.user.id;
    console.log(`  ✓ ${u.firstName} ${u.lastName} (${u.role})`);
  }

  // ═══ 3. Courses ═══
  console.log('\n🏫 Creating courses...');
  const coursesData = [
    { name: '3° A', year: 3, division: 'A', studentCount: 8, school: 'school_gm', key: 'gm_3a' },
    { name: '2° A', year: 2, division: 'A', studentCount: 8, school: 'school_as', key: 'as_2a' },
  ];
  for (const c of coursesData) {
    const { data, error } = await supabase
      .from('courses')
      .insert({ name: c.name, year: c.year, division: c.division, student_count: c.studentCount, school_id: ids[c.school] })
      .select()
      .single();
    if (error) throw error;
    ids[`course_${c.key}`] = data.id;
    console.log(`  ✓ ${c.name} (${c.school === 'school_gm' ? 'Gabriela Mistral' : 'Alfonsina Storni'})`);
  }

  // ═══ 4. Subjects (Matemática, Físico-Química, Lengua × 2 escuelas) ═══
  console.log('\n📚 Creating subjects...');
  const subjectsData = [
    { name: 'Matemática', color: 'blue', school: 'school_gm', key: 'gm_mat' },
    { name: 'Físico-Química', color: 'purple', school: 'school_gm', key: 'gm_fq' },
    { name: 'Lengua', color: 'green', school: 'school_gm', key: 'gm_len' },
    { name: 'Matemática', color: 'blue', school: 'school_as', key: 'as_mat' },
    { name: 'Físico-Química', color: 'purple', school: 'school_as', key: 'as_fq' },
    { name: 'Lengua', color: 'green', school: 'school_as', key: 'as_len' },
  ];
  for (const s of subjectsData) {
    const { data, error } = await supabase
      .from('subjects')
      .insert({ name: s.name, color: s.color, school_id: ids[s.school] })
      .select()
      .single();
    if (error) throw error;
    ids[`sub_${s.key}`] = data.id;
    console.log(`  ✓ ${s.name} (${s.school === 'school_gm' ? 'Gabriela Mistral' : 'Alfonsina Storni'})`);
  }

  // ═══ 5. Teacher assignments ═══
  console.log('\n🔗 Creating teacher assignments...');
  const assignments = [
    // Marco prueba las 6 materias reales
    { teacher: 'user_marco', subject: 'sub_gm_mat', course: 'course_gm_3a' },
    { teacher: 'user_marco', subject: 'sub_gm_fq', course: 'course_gm_3a' },
    { teacher: 'user_marco', subject: 'sub_gm_len', course: 'course_gm_3a' },
    { teacher: 'user_marco', subject: 'sub_as_mat', course: 'course_as_2a' },
    { teacher: 'user_marco', subject: 'sub_as_fq', course: 'course_as_2a' },
    { teacher: 'user_marco', subject: 'sub_as_len', course: 'course_as_2a' },
    // Docentes por materia, en ambas escuelas
    { teacher: 'user_vera', subject: 'sub_gm_mat', course: 'course_gm_3a' },
    { teacher: 'user_vera', subject: 'sub_as_mat', course: 'course_as_2a' },
    { teacher: 'user_eli', subject: 'sub_gm_fq', course: 'course_gm_3a' },
    { teacher: 'user_eli', subject: 'sub_as_fq', course: 'course_as_2a' },
    { teacher: 'user_ariel', subject: 'sub_gm_len', course: 'course_gm_3a' },
    { teacher: 'user_ariel', subject: 'sub_as_len', course: 'course_as_2a' },
  ];
  for (const a of assignments) {
    const { error } = await supabase
      .from('teacher_assignments')
      .insert({ teacher_id: ids[a.teacher], subject_id: ids[a.subject], course_id: ids[a.course] });
    if (error) throw error;
  }
  console.log(`  ✓ ${assignments.length} assignments`);

  // Desde la 039 dar clases en una escuela requiere ser miembro de ella:
  // los docentes de la Mistral que también dan en la Storni la suman.
  const { error: membershipError } = await supabase.from('school_memberships').upsert(
    assignments.map(a => ({
      user_id: ids[a.teacher],
      school_id: ids[a.course === 'course_gm_3a' ? 'school_gm' : 'school_as'],
      role: 'docente',
    })),
    { onConflict: 'user_id,school_id', ignoreDuplicates: true },
  );
  if (membershipError) throw membershipError;

  // ═══ 6. Students (con cuenta de usuario) — placeholders ficticios ═══
  console.log('\n🧑‍🎓 Creating students with accounts...');
  type SeedStudent = {
    firstName: string; lastName: string; initials: string; course: string;
    status: string; alerts: number; progress: number; attendance: number; average: number; key: string;
  };
  const studentsData: SeedStudent[] = [
    // 3° A — Gabriela Mistral
    { firstName: 'Martina', lastName: 'Silva', initials: 'MS', course: 'course_gm_3a', status: 'excellent', alerts: 0, progress: 95, attendance: 97, average: 9.2, key: 'st1' },
    { firstName: 'Juan', lastName: 'Pérez', initials: 'JP', course: 'course_gm_3a', status: 'critical', alerts: 3, progress: 45, attendance: 62, average: 4.8, key: 'st2' },
    { firstName: 'Lucía', lastName: 'Gómez', initials: 'LG', course: 'course_gm_3a', status: 'good', alerts: 0, progress: 80, attendance: 88, average: 7.5, key: 'st3' },
    { firstName: 'Tomás', lastName: 'Rodríguez', initials: 'TR', course: 'course_gm_3a', status: 'warning', alerts: 1, progress: 65, attendance: 75, average: 6.1, key: 'st4' },
    { firstName: 'Valentina', lastName: 'López', initials: 'VL', course: 'course_gm_3a', status: 'excellent', alerts: 0, progress: 92, attendance: 95, average: 8.8, key: 'st5' },
    { firstName: 'Agustín', lastName: 'Fernández', initials: 'AF', course: 'course_gm_3a', status: 'good', alerts: 0, progress: 78, attendance: 90, average: 7.2, key: 'st6' },
    { firstName: 'Camila', lastName: 'Torres', initials: 'CT', course: 'course_gm_3a', status: 'excellent', alerts: 0, progress: 91, attendance: 96, average: 9.0, key: 'st7' },
    { firstName: 'Mateo', lastName: 'Díaz', initials: 'MD', course: 'course_gm_3a', status: 'warning', alerts: 2, progress: 55, attendance: 70, average: 5.5, key: 'st8' },
    // 2° A — Alfonsina Storni
    { firstName: 'Sofía', lastName: 'Ramírez', initials: 'SR', course: 'course_as_2a', status: 'excellent', alerts: 0, progress: 94, attendance: 98, average: 9.5, key: 'st9' },
    { firstName: 'Nicolás', lastName: 'Moreno', initials: 'NM', course: 'course_as_2a', status: 'good', alerts: 0, progress: 82, attendance: 85, average: 7.8, key: 'st10' },
    { firstName: 'María', lastName: 'López', initials: 'ML', course: 'course_as_2a', status: 'critical', alerts: 2, progress: 40, attendance: 58, average: 4.2, key: 'st11' },
    { firstName: 'Diego', lastName: 'Álvarez', initials: 'DA', course: 'course_as_2a', status: 'good', alerts: 0, progress: 76, attendance: 87, average: 7.0, key: 'st12' },
    { firstName: 'Carolina', lastName: 'Benítez', initials: 'CB', course: 'course_as_2a', status: 'excellent', alerts: 0, progress: 89, attendance: 93, average: 8.5, key: 'st13' },
    { firstName: 'Facundo', lastName: 'Giménez', initials: 'FG', course: 'course_as_2a', status: 'good', alerts: 0, progress: 74, attendance: 82, average: 7.1, key: 'st14' },
    { firstName: 'Abril', lastName: 'Sosa', initials: 'AS', course: 'course_as_2a', status: 'warning', alerts: 1, progress: 60, attendance: 72, average: 5.8, key: 'st15' },
    { firstName: 'Lautaro', lastName: 'Medina', initials: 'LM', course: 'course_as_2a', status: 'excellent', alerts: 0, progress: 88, attendance: 94, average: 8.6, key: 'st16' },
  ];

  const courseSchool: Record<string, string> = { course_gm_3a: 'school_gm', course_as_2a: 'school_as' };

  for (const s of studentsData) {
    const email = slugEmail(s.firstName, s.lastName, 'estudiante.ensenia.edu.ar');
    const schoolKey = courseSchool[s.course];
    // 1. cuenta auth con rol estudiante
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { role: 'estudiante', school_id: ids[schoolKey] },
      user_metadata: {
        first_name: s.firstName,
        last_name: s.lastName,
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
        school_id: ids[schoolKey],
        user_id: authUser.user.id,
        email,
      })
      .select()
      .single();
    if (error) throw error;
    ids[s.key] = data.id;
  }
  console.log(`  ✓ ${studentsData.length} students + accounts (password: ${PASSWORD})`);

  // ═══ 7. Enrollments — cada alumno se anota en las 3 materias de su curso ═══
  console.log('\n🎫 Creating enrollments...');
  const courseSubjects: Record<string, { subject: string; prefix: string }[]> = {
    course_gm_3a: [
      { subject: 'sub_gm_mat', prefix: 'MAT3A' },
      { subject: 'sub_gm_fq', prefix: 'FQ3A' },
      { subject: 'sub_gm_len', prefix: 'LEN3A' },
    ],
    course_as_2a: [
      { subject: 'sub_as_mat', prefix: 'MAT2A' },
      { subject: 'sub_as_fq', prefix: 'FQ2A' },
      { subject: 'sub_as_len', prefix: 'LEN2A' },
    ],
  };
  const counters: Record<string, number> = {};
  let enrollmentCount = 0;
  for (const s of studentsData) {
    const schoolKey = courseSchool[s.course];
    for (const cfg of courseSubjects[s.course]) {
      counters[cfg.prefix] = (counters[cfg.prefix] ?? 0) + 1;
      const code = `${cfg.prefix}-${String(counters[cfg.prefix]).padStart(2, '0')}`;
      // Desde la 039 el trigger de students ya anota al alumno en las
      // materias de su curso: acá solo se fijan los códigos de siempre.
      const { error } = await supabase.from('enrollments').upsert({
        student_id: ids[s.key],
        subject_id: ids[cfg.subject],
        course_id: ids[s.course],
        enrollment_code: code,
        school_id: ids[schoolKey],
      }, { onConflict: 'student_id,subject_id,course_id' });
      if (error) throw error;
      enrollmentCount++;
    }
  }
  console.log(`  ✓ ${enrollmentCount} enrollments`);

  // ═══ 8. Schedule (Marco) ═══
  console.log('\n📅 Creating schedule...');
  const scheduleData = [
    { subject: 'sub_gm_mat', course: 'course_gm_3a', school: 'school_gm', subjectName: 'Matemática', courseName: '3° A', day: 'lunes', dayIdx: 0, hour: 8, room: 'Aula 5', color: 'blue' },
    { subject: 'sub_as_mat', course: 'course_as_2a', school: 'school_as', subjectName: 'Matemática', courseName: '2° A', day: 'lunes', dayIdx: 0, hour: 10, room: 'Aula 2', color: 'blue' },
    { subject: 'sub_gm_fq', course: 'course_gm_3a', school: 'school_gm', subjectName: 'Físico-Química', courseName: '3° A', day: 'martes', dayIdx: 1, hour: 8, room: 'Laboratorio', color: 'purple' },
    { subject: 'sub_gm_len', course: 'course_gm_3a', school: 'school_gm', subjectName: 'Lengua', courseName: '3° A', day: 'miercoles', dayIdx: 2, hour: 10, room: 'Aula 5', color: 'green' },
    { subject: 'sub_as_fq', course: 'course_as_2a', school: 'school_as', subjectName: 'Físico-Química', courseName: '2° A', day: 'jueves', dayIdx: 3, hour: 8, room: 'Laboratorio', color: 'purple' },
    { subject: 'sub_as_len', course: 'course_as_2a', school: 'school_as', subjectName: 'Lengua', courseName: '2° A', day: 'viernes', dayIdx: 4, hour: 10, room: 'Aula 2', color: 'green' },
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
      student_count: 8,
      school_id: ids[s.school],
    });
    if (error) throw error;
  }
  console.log(`  ✓ ${scheduleData.length} blocks`);

  // ═══ 9. Alerts + notification ═══
  // Las 6 materias quedan sin planificación ni actividades precargadas:
  // se prueban en vivo con "Importar programa desde PDF" usando los
  // programas reales de cada escuela.
  console.log('\n🚨 Creating alerts...');
  const alertsData = [
    { type: 'danger', category: 'attendance', title: 'Inasistencias consecutivas', message: 'Juan Pérez (3° A) tiene 5 inasistencias consecutivas.', dateLabel: 'Hoy', studentKeys: ['st2'] },
    { type: 'warning', category: 'academic', title: 'Bajo rendimiento sostenido', message: 'María López (2° A) viene con bajo rendimiento en Matemática este mes.', dateLabel: 'Hoy', studentKeys: ['st11'] },
    { type: 'success', category: 'academic', title: 'Progreso destacado', message: 'Sofía Ramírez (2° A) mejoró notablemente su promedio este trimestre.', dateLabel: 'Ayer', studentKeys: ['st9'], isRead: true },
  ];
  for (const a of alertsData) {
    const { data: alert, error } = await supabase
      .from('alerts')
      .insert({
        type: a.type, category: a.category, title: a.title, message: a.message,
        date_label: a.dateLabel, teacher_id: ids.user_marco, school_id: ids.school_gm,
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
    title: 'Bienvenidos a EstudIA',
    message: 'Ya está disponible la nueva plataforma con biblioteca digital, generación de contenido con IA y actividades para estudiantes.',
    priority: 'medium',
    school_id: ids.school_gm,
  });
  console.log('  ✓ Alerts + notification');

  console.log('\n✅ Seed completo.\n');
  console.log('── Cuentas de prueba (password: demo123) ──');
  console.log('  Directora:  ana.martinez@ensenia.edu.ar');
  console.log('  Docente:    marco.rossi@ensenia.edu.ar  (Matemática, Físico-Química y Lengua en 3°A Gabriela Mistral y 2°A Alfonsina Storni)');
  console.log('  Estudiante: martina.silva@estudiante.ensenia.edu.ar  (3° A — Gabriela Mistral)');
  console.log('  Estudiante: sofia.ramirez@estudiante.ensenia.edu.ar  (2° A — Alfonsina Storni)');
  console.log('\n  Las 6 materias están vacías a propósito: subí los programas reales desde');
  console.log('  "Importar programa desde PDF" en cada una para cargar el contenido real.');
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
