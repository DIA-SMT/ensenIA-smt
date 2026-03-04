/**
 * ENSEÑIA SMT — Database Seed Script
 *
 * Run with: npx tsx supabase/seed.ts
 *
 * Creates auth users and populates all tables with initial data
 * matching the original mock data.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
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

// ── Deterministic IDs for referencing ──
// We'll collect created UUIDs as we go
const ids: Record<string, string> = {};

async function main() {
  console.log('🌱 Seeding ENSEÑIA SMT database...\n');

  // ═══ 1. School ═══
  console.log('📍 Creating school...');
  const { data: school, error: schoolErr } = await supabase
    .from('schools')
    .insert({
      name: 'Escuela Municipal Alfonsina Storni',
      short_name: 'E.M. Alfonsina Storni',
      address: 'Av. Sarmiento 1200, San Miguel de Tucumán',
      district: 'Capital',
    })
    .select()
    .single();

  if (schoolErr) throw schoolErr;
  ids.school = school.id;
  console.log(`  ✓ School: ${school.id}`);

  // ═══ 2. Auth Users ═══
  console.log('\n👤 Creating auth users...');

  const usersToCreate = [
    { email: 'ana.martinez@ensenia.edu.ar', password: 'demo123', firstName: 'Ana', lastName: 'Martínez', role: 'director', initials: 'AM', key: 'director' },
    { email: 'marco.rossi@ensenia.edu.ar', password: 'demo123', firstName: 'Marco', lastName: 'Rossi', role: 'docente', initials: 'MR', key: 'marco' },
    { email: 'laura.garcia@ensenia.edu.ar', password: 'demo123', firstName: 'Laura', lastName: 'García', role: 'docente', initials: 'LG', key: 'laura' },
    { email: 'carlos.mendez@ensenia.edu.ar', password: 'demo123', firstName: 'Carlos', lastName: 'Méndez', role: 'docente', initials: 'CM', key: 'carlos' },
  ];

  for (const u of usersToCreate) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
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
    console.log(`  ✓ ${u.firstName} ${u.lastName} (${u.role}): ${data.user.id}`);
  }

  // ═══ 3. Subjects ═══
  console.log('\n📚 Creating subjects...');
  const subjectsData = [
    { name: 'Biología', color: 'green', key: 'bio' },
    { name: 'Física', color: 'blue', key: 'fis' },
    { name: 'Química', color: 'purple', key: 'qui' },
    { name: 'Matemática', color: 'orange', key: 'mat' },
    { name: 'Historia', color: 'amber', key: 'his' },
    { name: 'Lengua y Literatura', color: 'teal', key: 'len' },
  ];

  for (const s of subjectsData) {
    const { data, error } = await supabase
      .from('subjects')
      .insert({ name: s.name, color: s.color, school_id: ids.school })
      .select()
      .single();
    if (error) throw error;
    ids[`sub_${s.key}`] = data.id;
    console.log(`  ✓ ${s.name}: ${data.id}`);
  }

  // ═══ 4. Courses ═══
  console.log('\n🏫 Creating courses...');
  const coursesData = [
    { name: '3er 1ra', year: 3, division: '1ra', studentCount: 28, key: '3_1' },
    { name: '3er 3ra', year: 3, division: '3ra', studentCount: 25, key: '3_3' },
    { name: '4to 1ra', year: 4, division: '1ra', studentCount: 30, key: '4_1' },
    { name: '4to 2da', year: 4, division: '2da', studentCount: 28, key: '4_2' },
    { name: '5to 1ra', year: 5, division: '1ra', studentCount: 26, key: '5_1' },
    { name: '5to 2da', year: 5, division: '2da', studentCount: 24, key: '5_2' },
    { name: '6to 1ra', year: 6, division: '1ra', studentCount: 22, key: '6_1' },
  ];

  for (const c of coursesData) {
    const { data, error } = await supabase
      .from('courses')
      .insert({ name: c.name, year: c.year, division: c.division, student_count: c.studentCount, school_id: ids.school })
      .select()
      .single();
    if (error) throw error;
    ids[`course_${c.key}`] = data.id;
    console.log(`  ✓ ${c.name}: ${data.id}`);
  }

  // ═══ 5. Teacher Assignments ═══
  console.log('\n🔗 Creating teacher assignments...');
  const assignments = [
    // Marco
    { teacher: 'user_marco', subject: 'sub_bio', course: 'course_4_2' },
    { teacher: 'user_marco', subject: 'sub_bio', course: 'course_4_1' },
    { teacher: 'user_marco', subject: 'sub_fis', course: 'course_5_1' },
    { teacher: 'user_marco', subject: 'sub_qui', course: 'course_5_2' },
    // Laura
    { teacher: 'user_laura', subject: 'sub_mat', course: 'course_3_1' },
    { teacher: 'user_laura', subject: 'sub_mat', course: 'course_4_2' },
    { teacher: 'user_laura', subject: 'sub_mat', course: 'course_5_1' },
    // Carlos
    { teacher: 'user_carlos', subject: 'sub_his', course: 'course_3_1' },
    { teacher: 'user_carlos', subject: 'sub_his', course: 'course_3_3' },
    { teacher: 'user_carlos', subject: 'sub_len', course: 'course_4_1' },
    { teacher: 'user_carlos', subject: 'sub_len', course: 'course_6_1' },
  ];

  for (const a of assignments) {
    const { error } = await supabase
      .from('teacher_assignments')
      .insert({ teacher_id: ids[a.teacher], subject_id: ids[a.subject], course_id: ids[a.course] });
    if (error) throw error;
  }
  console.log(`  ✓ ${assignments.length} assignments created`);

  // ═══ 6. Students ═══
  console.log('\n🧑‍🎓 Creating students...');
  const studentsData = [
    // 4to 2da
    { firstName: 'Martina', lastName: 'Silva', initials: 'MS', course: 'course_4_2', status: 'excellent', alerts: 0, progress: 95, attendance: 97, average: 9.2, key: 'st1' },
    { firstName: 'Juan', lastName: 'Pérez', initials: 'JP', course: 'course_4_2', status: 'critical', alerts: 3, progress: 45, attendance: 62, average: 4.8, key: 'st2' },
    { firstName: 'Lucía', lastName: 'Gómez', initials: 'LG', course: 'course_4_2', status: 'good', alerts: 0, progress: 80, attendance: 88, average: 7.5, key: 'st3' },
    { firstName: 'Tomás', lastName: 'Rodríguez', initials: 'TR', course: 'course_4_2', status: 'warning', alerts: 1, progress: 65, attendance: 75, average: 6.1, key: 'st4' },
    { firstName: 'Valentina', lastName: 'López', initials: 'VL', course: 'course_4_2', status: 'excellent', alerts: 0, progress: 92, attendance: 95, average: 8.8, key: 'st5' },
    // 4to 1ra
    { firstName: 'Agustín', lastName: 'Fernández', initials: 'AF', course: 'course_4_1', status: 'good', alerts: 0, progress: 78, attendance: 90, average: 7.2, key: 'st6' },
    { firstName: 'Camila', lastName: 'Torres', initials: 'CT', course: 'course_4_1', status: 'excellent', alerts: 0, progress: 91, attendance: 96, average: 9.0, key: 'st7' },
    { firstName: 'Mateo', lastName: 'Díaz', initials: 'MD', course: 'course_4_1', status: 'warning', alerts: 2, progress: 55, attendance: 70, average: 5.5, key: 'st8' },
    // 5to 1ra
    { firstName: 'Sofía', lastName: 'Ramírez', initials: 'SR', course: 'course_5_1', status: 'excellent', alerts: 0, progress: 94, attendance: 98, average: 9.5, key: 'st9' },
    { firstName: 'Nicolás', lastName: 'Moreno', initials: 'NM', course: 'course_5_1', status: 'good', alerts: 0, progress: 82, attendance: 85, average: 7.8, key: 'st10' },
    { firstName: 'María', lastName: 'López', initials: 'ML', course: 'course_5_1', status: 'critical', alerts: 2, progress: 40, attendance: 58, average: 4.2, key: 'st11' },
    // 5to 2da
    { firstName: 'Diego', lastName: 'Álvarez', initials: 'DA', course: 'course_5_2', status: 'good', alerts: 0, progress: 76, attendance: 87, average: 7.0, key: 'st12' },
    { firstName: 'Carolina', lastName: 'Benítez', initials: 'CB', course: 'course_5_2', status: 'excellent', alerts: 0, progress: 89, attendance: 93, average: 8.5, key: 'st13' },
    // 3er 1ra
    { firstName: 'Facundo', lastName: 'Giménez', initials: 'FG', course: 'course_3_1', status: 'good', alerts: 0, progress: 74, attendance: 82, average: 7.1, key: 'st14' },
    { firstName: 'Abril', lastName: 'Sosa', initials: 'AS', course: 'course_3_1', status: 'warning', alerts: 1, progress: 60, attendance: 72, average: 5.8, key: 'st15' },
    { firstName: 'Lautaro', lastName: 'Medina', initials: 'LM', course: 'course_3_1', status: 'excellent', alerts: 0, progress: 88, attendance: 94, average: 8.6, key: 'st16' },
    // 3er 3ra
    { firstName: 'Julieta', lastName: 'Herrera', initials: 'JH', course: 'course_3_3', status: 'good', alerts: 0, progress: 79, attendance: 88, average: 7.4, key: 'st17' },
    { firstName: 'Sebastián', lastName: 'Castro', initials: 'SC', course: 'course_3_3', status: 'critical', alerts: 3, progress: 38, attendance: 55, average: 3.9, key: 'st18' },
    // 6to 1ra
    { firstName: 'Renata', lastName: 'Núñez', initials: 'RN', course: 'course_6_1', status: 'excellent', alerts: 0, progress: 96, attendance: 99, average: 9.7, key: 'st19' },
    { firstName: 'Ignacio', lastName: 'Vera', initials: 'IV', course: 'course_6_1', status: 'good', alerts: 0, progress: 81, attendance: 86, average: 7.6, key: 'st20' },
  ];

  for (const s of studentsData) {
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
      })
      .select()
      .single();
    if (error) throw error;
    ids[s.key] = data.id;
  }
  console.log(`  ✓ ${studentsData.length} students created`);

  // ═══ 7. Schedule Blocks ═══
  console.log('\n📅 Creating schedule blocks...');
  const scheduleData = [
    // Marco
    { teacher: 'user_marco', subject: 'sub_bio', course: 'course_4_2', subjectName: 'Biología Celular', courseName: '4to 2da', day: 'lunes', dayIdx: 0, hour: 8, duration: 1.5, room: 'Aula 12', color: 'green', students: 28 },
    { teacher: 'user_marco', subject: 'sub_fis', course: 'course_5_1', subjectName: 'Física', courseName: '5to 1ra', day: 'lunes', dayIdx: 0, hour: 10, duration: 1.5, room: 'Laboratorio', color: 'blue', students: 26 },
    { teacher: 'user_marco', subject: 'sub_qui', course: 'course_5_2', subjectName: 'Química Orgánica', courseName: '5to 2da', day: 'martes', dayIdx: 1, hour: 9, duration: 1.5, room: 'Laboratorio', color: 'purple', students: 24 },
    { teacher: 'user_marco', subject: 'sub_bio', course: 'course_4_1', subjectName: 'Biología Celular', courseName: '4to 1ra', day: 'miercoles', dayIdx: 2, hour: 8, duration: 1.5, room: 'Aula 11', color: 'green', students: 30 },
    { teacher: 'user_marco', subject: 'sub_fis', course: 'course_5_1', subjectName: 'Física', courseName: '5to 1ra', day: 'miercoles', dayIdx: 2, hour: 10, duration: 1.5, room: 'Aula 14', color: 'blue', students: 26 },
    { teacher: 'user_marco', subject: 'sub_bio', course: 'course_4_2', subjectName: 'Biología Celular', courseName: '4to 2da', day: 'miercoles', dayIdx: 2, hour: 14, duration: 1.5, room: 'Aula 12', color: 'green', students: 28 },
    { teacher: 'user_marco', subject: 'sub_qui', course: 'course_5_2', subjectName: 'Química Orgánica', courseName: '5to 2da', day: 'jueves', dayIdx: 3, hour: 8, duration: 1.5, room: 'Laboratorio', color: 'purple', students: 24 },
    { teacher: 'user_marco', subject: 'sub_bio', course: 'course_5_1', subjectName: 'Anatomía', courseName: '5to 1ra', day: 'viernes', dayIdx: 4, hour: 13, duration: 1.5, room: 'Aula 9', color: 'green', students: 26 },
    // Laura
    { teacher: 'user_laura', subject: 'sub_mat', course: 'course_3_1', subjectName: 'Matemática', courseName: '3er 1ra', day: 'lunes', dayIdx: 0, hour: 8, duration: 1.5, room: 'Aula 5', color: 'orange', students: 28 },
    { teacher: 'user_laura', subject: 'sub_mat', course: 'course_4_2', subjectName: 'Matemática', courseName: '4to 2da', day: 'lunes', dayIdx: 0, hour: 10, duration: 1.5, room: 'Aula 12', color: 'orange', students: 28 },
    { teacher: 'user_laura', subject: 'sub_mat', course: 'course_5_1', subjectName: 'Matemática', courseName: '5to 1ra', day: 'martes', dayIdx: 1, hour: 8, duration: 1.5, room: 'Aula 14', color: 'orange', students: 26 },
    { teacher: 'user_laura', subject: 'sub_mat', course: 'course_3_1', subjectName: 'Matemática', courseName: '3er 1ra', day: 'miercoles', dayIdx: 2, hour: 10, duration: 1.5, room: 'Aula 5', color: 'orange', students: 28 },
    { teacher: 'user_laura', subject: 'sub_mat', course: 'course_4_2', subjectName: 'Matemática', courseName: '4to 2da', day: 'jueves', dayIdx: 3, hour: 10, duration: 1.5, room: 'Aula 12', color: 'orange', students: 28 },
    { teacher: 'user_laura', subject: 'sub_mat', course: 'course_5_1', subjectName: 'Matemática', courseName: '5to 1ra', day: 'viernes', dayIdx: 4, hour: 8, duration: 1.5, room: 'Aula 14', color: 'orange', students: 26 },
    // Carlos
    { teacher: 'user_carlos', subject: 'sub_his', course: 'course_3_1', subjectName: 'Historia', courseName: '3er 1ra', day: 'lunes', dayIdx: 0, hour: 13, duration: 1.5, room: 'Aula 3', color: 'amber', students: 28 },
    { teacher: 'user_carlos', subject: 'sub_his', course: 'course_3_3', subjectName: 'Historia', courseName: '3er 3ra', day: 'martes', dayIdx: 1, hour: 10, duration: 1.5, room: 'Aula 7', color: 'amber', students: 25 },
    { teacher: 'user_carlos', subject: 'sub_len', course: 'course_4_1', subjectName: 'Lengua y Literatura', courseName: '4to 1ra', day: 'martes', dayIdx: 1, hour: 13, duration: 1.5, room: 'Aula 11', color: 'teal', students: 30 },
    { teacher: 'user_carlos', subject: 'sub_len', course: 'course_6_1', subjectName: 'Lengua y Literatura', courseName: '6to 1ra', day: 'miercoles', dayIdx: 2, hour: 8, duration: 1.5, room: 'Aula 2', color: 'teal', students: 22 },
    { teacher: 'user_carlos', subject: 'sub_his', course: 'course_3_1', subjectName: 'Historia', courseName: '3er 1ra', day: 'jueves', dayIdx: 3, hour: 8, duration: 1.5, room: 'Aula 3', color: 'amber', students: 28 },
    { teacher: 'user_carlos', subject: 'sub_len', course: 'course_4_1', subjectName: 'Lengua y Literatura', courseName: '4to 1ra', day: 'viernes', dayIdx: 4, hour: 10, duration: 1.5, room: 'Aula 11', color: 'teal', students: 30 },
  ];

  for (const s of scheduleData) {
    const { error } = await supabase
      .from('schedule_blocks')
      .insert({
        teacher_id: ids[s.teacher],
        subject_id: ids[s.subject],
        course_id: ids[s.course],
        subject_name: s.subjectName,
        course_name: s.courseName,
        day_of_week: s.day,
        day_index: s.dayIdx,
        start_hour: s.hour,
        duration: s.duration,
        room: s.room,
        color_class: s.color,
        student_count: s.students,
        school_id: ids.school,
      });
    if (error) throw error;
  }
  console.log(`  ✓ ${scheduleData.length} schedule blocks created`);

  // ═══ 8. Alerts ═══
  console.log('\n🚨 Creating alerts...');
  const alertsData = [
    { type: 'danger', category: 'attendance', title: 'Inasistencias consecutivas', message: 'Juan Pérez tiene 5 inasistencias consecutivas.', dateLabel: 'Hoy', teacher: 'user_marco', studentKeys: ['st2'], createdAt: '2026-03-02', key: 'alert1' },
    { type: 'warning', category: 'academic', title: 'Bajo rendimiento', message: 'Bajo rendimiento en Matemática - 3er Año.', dateLabel: 'Ayer', teacher: 'user_laura', studentKeys: ['st15'], createdAt: '2026-03-01', key: 'alert2' },
    { type: 'success', category: 'academic', title: 'Evaluación completada', message: 'Evaluación de Historia completada por el 95% del curso.', dateLabel: 'Hace 3 días', teacher: 'user_carlos', studentKeys: [], createdAt: '2026-02-27', isRead: true, key: 'alert3' },
    { type: 'danger', category: 'academic', title: 'Riesgo de repitencia', message: 'María López (5to 1ra) tiene 3 materias previas y bajo rendimiento actual.', dateLabel: 'Hoy', teacher: 'user_marco', studentKeys: ['st11'], createdAt: '2026-03-02', key: 'alert4' },
    { type: 'warning', category: 'attendance', title: 'Límite de faltas', message: 'Sebastián Castro se acerca al límite de 15 inasistencias.', dateLabel: 'Ayer', teacher: 'user_carlos', studentKeys: ['st18'], createdAt: '2026-03-01', key: 'alert5' },
    { type: 'warning', category: 'conduct', title: 'Llamado de atención', message: 'Mateo Díaz recibió un reporte disciplinario reciente.', dateLabel: 'Hace 2 días', teacher: 'user_marco', studentKeys: ['st8'], createdAt: '2026-02-28', isRead: true, key: 'alert6' },
  ];

  for (const a of alertsData) {
    const { data, error } = await supabase
      .from('alerts')
      .insert({
        type: a.type,
        category: a.category,
        title: a.title,
        message: a.message,
        date_label: a.dateLabel,
        teacher_id: ids[a.teacher],
        school_id: ids.school,
        is_read: a.isRead ?? false,
        created_at: a.createdAt,
      })
      .select()
      .single();
    if (error) throw error;
    ids[a.key] = data.id;

    // Insert alert_students
    for (const sk of a.studentKeys) {
      const { error: asErr } = await supabase
        .from('alert_students')
        .insert({ alert_id: data.id, student_id: ids[sk] });
      if (asErr) throw asErr;
    }
  }
  console.log(`  ✓ ${alertsData.length} alerts created`);

  // ═══ 9. Notifications ═══
  console.log('\n🔔 Creating notifications...');
  const notifsData = [
    { from: 'user_director', to: null, title: 'Reunión de personal', message: 'Recordatorio: reunión de personal este viernes 7/3 a las 17:00 en Sala de Profesores.', priority: 'high', createdAt: '2026-03-02T09:00:00' },
    { from: 'user_director', to: 'user_marco', title: 'Planificación trimestral', message: 'Marco, necesito que envíes la planificación trimestral de Biología antes del viernes. Gracias.', priority: 'medium', createdAt: '2026-03-01T14:30:00' },
    { from: 'user_director', to: null, title: 'Jornada de capacitación IA', message: 'El próximo miércoles 5/3 habrá una jornada de capacitación sobre herramientas IA para docentes. Asistencia obligatoria.', priority: 'high', createdAt: '2026-02-28T10:00:00' },
    { from: 'user_director', to: 'user_laura', title: 'Material de evaluación', message: 'Laura, favor enviar los resultados de las evaluaciones de Matemática de 3er año.', priority: 'low', createdAt: '2026-02-27T11:00:00' },
    { from: 'user_director', to: 'user_carlos', title: 'Acto escolar', message: 'Carlos, ¿podrías preparar una actividad de Historia para el acto del 24 de marzo? Coordinemos.', priority: 'medium', createdAt: '2026-03-01T16:00:00' },
  ];

  for (const n of notifsData) {
    const { error } = await supabase
      .from('notifications')
      .insert({
        from_user_id: ids[n.from],
        to_user_id: n.to ? ids[n.to] : null,
        title: n.title,
        message: n.message,
        priority: n.priority,
        school_id: ids.school,
        created_at: n.createdAt,
      });
    if (error) throw error;
  }
  console.log(`  ✓ ${notifsData.length} notifications created`);

  // ═══ 10. Library Materials ═══
  console.log('\n📖 Creating library materials...');
  const materialsData = [
    { title: 'Guía de Biología Celular', description: 'Material teórico sobre estructura celular, organelas y funciones.', fileType: 'pdf', fileName: 'biologia-celular-guia.pdf', fileSize: '2.4 MB', subject: 'sub_bio', subjectName: 'Biología', unitName: 'Unidad 1: Células', teacher: 'user_marco', tags: ['célula', 'organelas', 'membrana', 'núcleo'], uploadedAt: '2026-02-15' },
    { title: 'Ejercicios de Mitosis y Meiosis', description: 'Actividades prácticas con diagramas de división celular.', fileType: 'pdf', fileName: 'mitosis-meiosis-ejercicios.pdf', fileSize: '1.8 MB', subject: 'sub_bio', subjectName: 'Biología', unitName: 'Unidad 1: Células', teacher: 'user_marco', tags: ['mitosis', 'meiosis', 'división celular', 'ejercicios'], uploadedAt: '2026-02-20' },
    { title: 'Leyes de Newton - Resumen', description: 'Síntesis de las tres leyes de Newton con ejemplos cotidianos.', fileType: 'pdf', fileName: 'newton-resumen.pdf', fileSize: '980 KB', subject: 'sub_fis', subjectName: 'Física', unitName: null, teacher: 'user_marco', tags: ['Newton', 'fuerza', 'movimiento', 'inercia'], uploadedAt: '2026-02-10' },
    { title: 'Tabla Periódica Interactiva', description: 'Enlace a recurso interactivo de la tabla periódica.', fileType: 'link', fileName: 'https://ptable.com', fileSize: '-', subject: 'sub_qui', subjectName: 'Química', unitName: null, teacher: 'user_marco', tags: ['tabla periódica', 'elementos', 'recurso online'], uploadedAt: '2026-01-25' },
    { title: 'Problemas de Álgebra - Nivel Intermedio', description: 'Ejercitación de ecuaciones y sistemas para 3er y 4to año.', fileType: 'pdf', fileName: 'algebra-problemas.pdf', fileSize: '1.5 MB', subject: 'sub_mat', subjectName: 'Matemática', unitName: null, teacher: 'user_laura', tags: ['álgebra', 'ecuaciones', 'sistemas', 'ejercicios'], uploadedAt: '2026-02-18' },
    { title: 'Análisis Matemático - Funciones', description: 'Introducción a funciones lineales y cuadráticas.', fileType: 'pdf', fileName: 'funciones-intro.pdf', fileSize: '3.1 MB', subject: 'sub_mat', subjectName: 'Matemática', unitName: null, teacher: 'user_laura', tags: ['funciones', 'lineal', 'cuadrática', 'gráficos'], uploadedAt: '2026-02-22' },
    { title: 'Revolución de Mayo - Fuentes Primarias', description: 'Documentos históricos de la Revolución de Mayo.', fileType: 'pdf', fileName: 'rev-mayo-fuentes.pdf', fileSize: '4.2 MB', subject: 'sub_his', subjectName: 'Historia', unitName: 'Unidad 2: Independencia', teacher: 'user_carlos', tags: ['revolución', 'mayo', 'independencia', 'fuentes'], uploadedAt: '2026-02-08' },
    { title: 'Análisis Literario - Cuentos de Borges', description: 'Guía de análisis para "El Aleph" y "La Biblioteca de Babel".', fileType: 'doc', fileName: 'borges-analisis.docx', fileSize: '890 KB', subject: 'sub_len', subjectName: 'Lengua y Literatura', unitName: null, teacher: 'user_carlos', tags: ['Borges', 'análisis literario', 'cuento', 'narrativa'], uploadedAt: '2026-02-25' },
  ];

  for (const m of materialsData) {
    const { error } = await supabase
      .from('library_materials')
      .insert({
        title: m.title,
        description: m.description,
        file_type: m.fileType,
        file_name: m.fileName,
        file_size: m.fileSize,
        subject_id: ids[m.subject],
        subject_name: m.subjectName,
        unit_name: m.unitName,
        teacher_id: ids[m.teacher],
        school_id: ids.school,
        tags: m.tags,
        uploaded_at: m.uploadedAt,
      });
    if (error) throw error;
  }
  console.log(`  ✓ ${materialsData.length} library materials created`);

  // ═══ 11. Planning Units & Classes ═══
  console.log('\n📋 Creating planning units and classes...');
  const planningData = [
    {
      title: 'Unidad 1: Células', subject: 'sub_bio', course: 'course_4_2', teacher: 'user_marco', order: 1,
      classes: [
        { title: 'Estructura Celular', order: 1, objectives: ['Identificar organelas principales', 'Comprender la función del núcleo'], content: 'La célula es la unidad fundamental de la vida. Existen dos tipos principales: eucariotas y procariotas. Durante esta clase abordaremos la estructura interna de las células eucariotas...', isComplete: true },
        { title: 'Mitosis y Meiosis', order: 2, objectives: ['Diferenciar mitosis de meiosis', 'Identificar fases de división celular'], content: '', isComplete: false },
      ],
    },
    {
      title: 'Unidad 2: Genética', subject: 'sub_bio', course: 'course_4_2', teacher: 'user_marco', order: 2,
      classes: [
        { title: 'Leyes de Mendel', order: 1, objectives: ['Comprender herencia dominante y recesiva'], content: '', isComplete: false },
        { title: 'ADN y ARN', order: 2, objectives: ['Describir la estructura del ADN'], content: '', isComplete: false },
      ],
    },
    {
      title: 'Unidad 1: Mecánica', subject: 'sub_fis', course: 'course_5_1', teacher: 'user_marco', order: 1,
      classes: [
        { title: 'Leyes de Newton', order: 1, objectives: ['Aplicar las tres leyes de Newton'], content: 'Las leyes de Newton son los fundamentos de la mecánica clásica...', isComplete: true },
        { title: 'Trabajo y Energía', order: 2, objectives: ['Calcular trabajo mecánico', 'Diferenciar energía cinética y potencial'], content: '', isComplete: false },
      ],
    },
    {
      title: 'Unidad 1: Álgebra', subject: 'sub_mat', course: 'course_3_1', teacher: 'user_laura', order: 1,
      classes: [
        { title: 'Ecuaciones Lineales', order: 1, objectives: ['Resolver ecuaciones de primer grado'], content: '', isComplete: true },
        { title: 'Sistemas de Ecuaciones', order: 2, objectives: ['Resolver sistemas 2x2'], content: '', isComplete: false },
      ],
    },
    {
      title: 'Unidad 1: Argentina Colonial', subject: 'sub_his', course: 'course_3_1', teacher: 'user_carlos', order: 1,
      classes: [
        { title: 'El Virreinato del Río de la Plata', order: 1, objectives: ['Comprender la organización colonial'], content: '', isComplete: true },
        { title: 'Revolución de Mayo', order: 2, objectives: ['Analizar las causas de la revolución'], content: '', isComplete: false },
      ],
    },
  ];

  for (const pu of planningData) {
    const { data: unit, error: unitErr } = await supabase
      .from('planning_units')
      .insert({
        title: pu.title,
        subject_id: ids[pu.subject],
        course_id: ids[pu.course],
        teacher_id: ids[pu.teacher],
        sort_order: pu.order,
      })
      .select()
      .single();
    if (unitErr) throw unitErr;

    for (const pc of pu.classes) {
      const { data: clsData, error: clsErr } = await supabase
        .from('planning_classes')
        .insert({
          unit_id: unit.id,
          title: pc.title,
          sort_order: pc.order,
          objectives: pc.objectives,
          content: pc.content || null,
          is_complete: pc.isComplete,
        })
        .select()
        .single();
      if (clsErr) throw clsErr;

      // Store class ID for "Estructura Celular" (used in IA chat seed)
      if (pc.title === 'Estructura Celular') {
        ids.class_estructura_celular = clsData.id;
      }
    }
  }
  console.log(`  ✓ ${planningData.length} planning units with classes created`);

  // ═══ 12. Communications ═══
  console.log('\n✉️ Creating communications...');
  const commsData = [
    {
      from: 'user_director', subject: 'Reunión de personal - Viernes 7/3',
      body: 'Estimados docentes,\n\nLes recuerdo que este viernes 7 de marzo a las 17:00 tendremos la reunión mensual de personal en la Sala de Profesores.\n\nAgenda:\n- Revisión de planificaciones trimestrales\n- Actualización sobre herramientas IA\n- Preparación acto 24 de marzo\n\nAsistencia obligatoria. Confirmar asistencia.\n\nSaludos cordiales,\nAna Martínez\nDirección',
      priority: 'high', isBroadcast: true, toUsers: [], readBy: ['user_laura'],
      sentAt: '2026-03-02T09:00:00',
    },
    {
      from: 'user_director', subject: 'Planificación trimestral de Biología',
      body: 'Hola Marco,\n\nNecesito que envíes la planificación trimestral de Biología para 4to y 5to año antes del viernes.\n\nRecordá incluir los objetivos de aprendizaje prioritarios y las actividades con IA que estás implementando.\n\nGracias,\nAna',
      priority: 'medium', isBroadcast: false, toUsers: ['user_marco'], readBy: [],
      sentAt: '2026-03-01T14:30:00',
    },
    {
      from: 'user_director', subject: 'Jornada de capacitación IA - Miércoles 5/3',
      body: 'Estimados colegas,\n\nEl miércoles 5 de marzo realizaremos una jornada de capacitación sobre las nuevas herramientas de IA integradas en la plataforma ENSEÑIA SMT.\n\nHorario: 14:00 a 17:00\nLugar: Laboratorio de Informática\n\nLa asistencia es obligatoria. Traer notebook si tienen.\n\nDirección',
      priority: 'high', isBroadcast: true, toUsers: [], readBy: ['user_marco', 'user_laura', 'user_carlos'],
      sentAt: '2026-02-28T10:00:00',
    },
  ];

  for (const c of commsData) {
    const { data: comm, error: commErr } = await supabase
      .from('communications')
      .insert({
        from_user_id: ids[c.from],
        subject: c.subject,
        body: c.body,
        priority: c.priority,
        school_id: ids.school,
        is_broadcast: c.isBroadcast,
        sent_at: c.sentAt,
      })
      .select()
      .single();
    if (commErr) throw commErr;

    // Insert recipients (for non-broadcast)
    if (!c.isBroadcast && c.toUsers.length > 0) {
      for (const u of c.toUsers) {
        const { error } = await supabase
          .from('communication_recipients')
          .insert({ communication_id: comm.id, user_id: ids[u] });
        if (error) throw error;
      }
    }

    // Insert reads
    for (const u of c.readBy) {
      const { error } = await supabase
        .from('communication_reads')
        .insert({ communication_id: comm.id, user_id: ids[u] });
      if (error) throw error;
    }
  }
  console.log(`  ✓ ${commsData.length} communications created`);

  // ═══ 13. IA Chat Data ═══
  console.log('\n🤖 Creating IA chat demo data...');

  // Chat session for Marco — linked to "Estructura Celular"
  const { data: chatSession, error: chatSessionErr } = await supabase
    .from('chat_sessions')
    .insert({
      teacher_id: ids.user_marco,
      class_id: ids.class_estructura_celular,
      subject_id: ids.sub_bio,
      course_id: ids.course_4_2,
      title: 'Estructura Celular',
    })
    .select()
    .single();
  if (chatSessionErr) throw chatSessionErr;
  ids.chat_session_marco = chatSession.id;
  console.log(`  ✓ Chat session: ${chatSession.id}`);

  // Demo messages
  const chatMessages = [
    {
      session_id: chatSession.id,
      role: 'user',
      content: 'Necesito una actividad práctica sobre estructura celular para 4to 2da. Algo que puedan hacer con microscopio.',
      tool_used: 'act',
      model_used: null,
      token_count: null,
      created_at: '2026-03-01T10:00:00',
    },
    {
      session_id: chatSession.id,
      role: 'assistant',
      content: `## 🔬 Actividad: "Explorando el mundo celular"\n\n**Materia:** Biología | **Curso:** 4to 2da | **Duración:** 80 minutos\n\n---\n\n### 🎯 Objetivos de aprendizaje\n- Identificar las principales organelas de una célula vegetal y animal\n- Utilizar correctamente el microscopio óptico\n- Registrar observaciones con dibujos científicos\n\n### 📦 Materiales necesarios\n- Microscopio óptico (1 por grupo)\n- Portaobjetos y cubreobjetos\n- Cebolla (para células vegetales)\n- Azul de metileno\n- Hojas de papel cuadriculado\n\n### 📋 Desarrollo\n\n#### 🟢 Inicio (15 min)\n1. Repaso breve de las partes de la célula con un diagrama en el pizarrón\n2. Formación de grupos de 4 alumnos\n3. Distribución de materiales\n\n#### 🔵 Desarrollo (50 min)\n1. **Preparación de muestras:** Cada grupo prepara una muestra de epidermis de cebolla\n2. **Observación:** Observar a 100x y 400x, identificando pared celular, membrana, citoplasma y núcleo\n3. **Registro:** Dibujar lo observado en papel cuadriculado con referencias\n4. **Comparación:** Comparar con imágenes de células animales del libro\n\n#### 🟡 Cierre (15 min)\n- Puesta en común: cada grupo comparte sus observaciones\n- Pregunta disparadora: *"¿Por qué las células vegetales tienen pared celular y las animales no?"*\n\n### ✅ Criterios de evaluación\n\n| Criterio | Excelente | Bueno | Regular |\n|---|---|---|---|\n| Uso del microscopio | Manejo autónomo | Necesita guía | Dificultades |\n| Dibujo científico | Detallado con referencias | Básico | Incompleto |\n| Participación | Activa y colaborativa | Participa | Pasiva |\n\n### 💡 Adaptaciones\n- Para alumnos con dificultades: proporcionar diagrama pre-impreso para completar\n- Para alumnos avanzados: agregar tinción con lugol para observar almidón`,
      tool_used: 'act',
      model_used: 'sonnet',
      token_count: 420,
      created_at: '2026-03-01T10:00:30',
    },
    {
      session_id: chatSession.id,
      role: 'user',
      content: '¡Genial! ¿Podés hacer una versión más corta, de 40 minutos, sin microscopio?',
      tool_used: null,
      model_used: null,
      token_count: null,
      created_at: '2026-03-01T10:05:00',
    },
    {
      session_id: chatSession.id,
      role: 'assistant',
      content: `## 🧬 Actividad Express: "Célula en 3D"\n\n**Duración:** 40 minutos | **Sin microscopio**\n\n---\n\n### 🎯 Objetivo\nModelar una célula animal o vegetal con materiales cotidianos, identificando organelas y funciones.\n\n### 📦 Materiales\n- Bolsas ziploc grandes (membrana)\n- Gelatina sin sabor preparada (citoplasma)\n- Ciruela o nuez (núcleo)\n- Fideos, lentejas, porotos (organelas)\n- Etiquetas adhesivas pequeñas\n\n### 📋 Desarrollo\n\n#### 🟢 Inicio (5 min)\nMostrar imagen de célula en el pizarrón. Preguntar: *"Si tuvieran que construir una célula con cosas de la cocina, ¿qué usarían?"*\n\n#### 🔵 Desarrollo (25 min)\n1. En grupos de 3, elegir célula animal o vegetal\n2. Llenar la bolsa con gelatina (citoplasma)\n3. Agregar los "organelas": la ciruela = núcleo, lentejas = ribosomas, fideos = retículo endoplasmático\n4. Etiquetar cada componente con su nombre y función\n5. Si es vegetal: usar un tupper rectangular como "pared celular"\n\n#### 🟡 Cierre (10 min)\nCada grupo presenta su modelo y explica las funciones de 3 organelas elegidas.\n\n### ✅ Evaluación rápida\n- ¿Identificaron al menos 5 organelas? ✓/✗\n- ¿Explicaron funciones correctamente? ✓/✗\n- ¿Diferenciaron célula animal de vegetal? ✓/✗`,
      tool_used: 'act',
      model_used: 'sonnet',
      token_count: 350,
      created_at: '2026-03-01T10:05:45',
    },
  ];

  for (const msg of chatMessages) {
    const { error } = await supabase.from('chat_messages').insert(msg);
    if (error) throw error;
  }
  console.log(`  ✓ ${chatMessages.length} chat messages created`);

  // IA Usage for Marco (7 messages today)
  const today = new Date().toISOString().split('T')[0];
  const { error: usageErr } = await supabase
    .from('ia_usage')
    .insert({
      teacher_id: ids.user_marco,
      usage_date: today,
      message_count: 7,
      token_count_in: 2800,
      token_count_out: 3500,
    });
  if (usageErr) throw usageErr;
  console.log(`  ✓ IA usage record created (7 messages today)`);

  console.log('\n✅ Seed complete! All data has been populated.');
  console.log('\n📋 Created IDs:');
  for (const [key, val] of Object.entries(ids)) {
    console.log(`  ${key}: ${val}`);
  }
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
