-- ═══════════════════════════════════════════════════════════════════
-- Storni 2° A · paso 1 de 2: INVENTARIO (solo lectura, no cambia nada)
--
-- Qué hay hoy en la Escuela Municipal Alfonsina Storni Secundaria: escuela,
-- miembros, cursos, materias, asignaciones, estudiantes, unidades, criterios,
-- trimestres y conteos de todo lo demás que pueda colgar de ella.
-- Devuelve UNA celda (JSON): copiala entera y pasala.
--
-- Por qué: los seeds del repo no explican lo que hay en producción (hay
-- docentes de demo como miembros de la Storni que los scripts no crean), así
-- que la limpieza (paso 2) se arma sobre lo que hay de verdad.
-- ═══════════════════════════════════════════════════════════════════

WITH s AS (SELECT id FROM schools WHERE name ILIKE '%alfonsina storni%'),
     st AS (SELECT id FROM students WHERE school_id IN (SELECT id FROM s))
SELECT json_build_object(
  'escuelas', (SELECT json_agg(json_build_object('id', id, 'nombre', name, 'corto', short_name, 'creada', created_at)) FROM schools WHERE id IN (SELECT id FROM s)),

  'miembros', (SELECT json_agg(json_build_object('rol', m.role, 'email', p.email, 'nombre', p.first_name || ' ' || p.last_name,
                 'escuela_activa_es_esta', p.school_id IN (SELECT id FROM s), 'otras_escuelas',
                 (SELECT count(*) FROM school_memberships m2 WHERE m2.user_id = p.id AND m2.school_id NOT IN (SELECT id FROM s)),
                 'dni', p.dni, 'creado', p.created_at) ORDER BY m.role, p.email)
               FROM school_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.school_id IN (SELECT id FROM s)),

  'cursos', (SELECT json_agg(json_build_object('id', c.id, 'nombre', c.name, 'alumnos', c.student_count, 'creado', c.created_at)) FROM courses c WHERE c.school_id IN (SELECT id FROM s)),
  'materias', (SELECT json_agg(json_build_object('id', sb.id, 'nombre', sb.name)) FROM subjects sb WHERE sb.school_id IN (SELECT id FROM s)),

  'asignaciones', (SELECT json_agg(json_build_object('docente', p.email, 'materia', sb.name, 'curso', c.name) ORDER BY sb.name, p.email)
                   FROM teacher_assignments ta JOIN courses c ON c.id = ta.course_id JOIN subjects sb ON sb.id = ta.subject_id
                   JOIN profiles p ON p.id = ta.teacher_id WHERE c.school_id IN (SELECT id FROM s)),

  'estudiantes', (SELECT json_agg(json_build_object('nombre', x.first_name || ' ' || x.last_name, 'email_ficha', x.email,
                    'cuenta', p.email, 'dni', p.dni, 'curso', c.name, 'creado', x.created_at) ORDER BY c.name, x.last_name)
                  FROM students x JOIN courses c ON c.id = x.course_id LEFT JOIN profiles p ON p.id = x.user_id
                  WHERE x.school_id IN (SELECT id FROM s)),

  'familias', (SELECT json_agg(json_build_object('familia', p.email, 'de', x.first_name || ' ' || x.last_name, 'parentesco', g.relationship))
               FROM student_guardians g JOIN st ON st.id = g.student_id JOIN students x ON x.id = g.student_id JOIN profiles p ON p.id = g.guardian_user_id),

  'unidades', (SELECT json_agg(json_build_object('titulo', u.title, 'materia', sb.name, 'curso', c.name, 'docente', p.email,
                 'trimestre', t.number, 'clases', (SELECT count(*) FROM planning_classes pc WHERE pc.unit_id = u.id), 'creada', u.created_at) ORDER BY sb.name, u.sort_order)
               FROM planning_units u JOIN courses c ON c.id = u.course_id JOIN subjects sb ON sb.id = u.subject_id
               JOIN profiles p ON p.id = u.teacher_id LEFT JOIN academic_terms t ON t.id = u.term_id
               WHERE c.school_id IN (SELECT id FROM s)),

  'criterios', (SELECT json_agg(json_build_object('materia', sb.name, 'curso', c.name, 'trimestre', t.number, 'publicado', e.is_published,
                  'empieza', left(e.criteria, 60)))
                FROM evaluation_criteria e JOIN subjects sb ON sb.id = e.subject_id JOIN courses c ON c.id = e.course_id
                JOIN academic_terms t ON t.id = e.term_id WHERE e.school_id IN (SELECT id FROM s)),

  'trimestres', (SELECT json_agg(json_build_object('n', number, 'anio', year, 'desde', starts_on, 'hasta', ends_on) ORDER BY year, number)
                 FROM academic_terms WHERE school_id IN (SELECT id FROM s)),

  'conteos', json_build_object(
    'inscripciones', (SELECT count(*) FROM enrollments WHERE school_id IN (SELECT id FROM s)),
    'actividades', (SELECT count(*) FROM activities WHERE school_id IN (SELECT id FROM s)),
    'entregas_de_sus_alumnos', (SELECT count(*) FROM activity_submissions WHERE student_id IN (SELECT id FROM st)),
    'horarios', (SELECT count(*) FROM schedule_blocks WHERE school_id IN (SELECT id FROM s)),
    'alertas_de_la_escuela', (SELECT count(*) FROM alerts WHERE school_id IN (SELECT id FROM s)),
    'alertas_que_nombran_a_sus_alumnos', (SELECT count(*) FROM alert_students WHERE student_id IN (SELECT id FROM st)),
    'avisos_a_familias', (SELECT count(*) FROM guardian_notices WHERE school_id IN (SELECT id FROM s)),
    'notificaciones', (SELECT count(*) FROM notifications WHERE school_id IN (SELECT id FROM s)),
    'biblioteca', (SELECT count(*) FROM library_materials WHERE school_id IN (SELECT id FROM s)),
    'notas_de_libreta', (SELECT count(*) FROM term_grades WHERE student_id IN (SELECT id FROM st)),
    'tomas_de_asistencia', (SELECT count(*) FROM attendance_sessions WHERE school_id IN (SELECT id FROM s)),
    'clases_en_vivo', (SELECT count(*) FROM live_sessions WHERE school_id IN (SELECT id FROM s)),
    'observaciones_de_sus_alumnos', (SELECT count(*) FROM student_observations WHERE student_id IN (SELECT id FROM st)),
    'checkins_de_sus_alumnos', (SELECT count(*) FROM student_checkins WHERE student_id IN (SELECT id FROM st)),
    'grupos', (SELECT count(*) FROM course_groups WHERE course_id IN (SELECT id FROM courses WHERE school_id IN (SELECT id FROM s))),
    'normativa', (SELECT count(*) FROM school_policies WHERE school_id IN (SELECT id FROM s))
  )
) AS inventario;
