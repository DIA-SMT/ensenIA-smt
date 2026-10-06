-- ============================================================
-- 048 · Alumnos de muestra
-- ============================================================
-- Para mostrar la app con un aula llena: el superadmin carga en un curso
-- 20 alumnos inventados, cada uno con su historia (asistencia de las
-- últimas cinco semanas, notas publicadas del 1° y 2° trimestre, ánimo,
-- observaciones, medallas y práctica). Los ven sus docentes y la
-- dirección como a cualquier alumno del curso.
--
-- No tienen cuenta ni familia. Quedan marcados con students.is_demo y al
-- quitarlos se borra todo lo suyo (casi todo cuelga de students con
-- ON DELETE CASCADE; las alertas y las clases que se crearon solo para
-- ellos se borran a mano). Los alumnos reales no se tocan.
--
-- Las notas se cargan "como" el docente de cada materia: así los
-- automatismos de 024/046 (alerta de riesgo, aviso a la familia) quedan a
-- su nombre y la alerta le aparece a él, igual que si las hubiera
-- publicado desde la Libreta.
-- ============================================================

ALTER TABLE students ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_students_demo ON students(course_id) WHERE is_demo;


-- ── Quitar ──
CREATE OR REPLACE FUNCTION demo_alumnos_quitar(p_course UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin maneja los alumnos de muestra';
  END IF;

  -- Las alertas no cuelgan del alumno (van por alert_students): se borran
  -- las que son solo de alumnos de muestra
  DELETE FROM alerts a
  WHERE EXISTS (
      SELECT 1 FROM alert_students x JOIN students s ON s.id = x.student_id
      WHERE x.alert_id = a.id AND s.course_id = p_course AND s.is_demo
    )
    AND NOT EXISTS (
      SELECT 1 FROM alert_students x JOIN students s ON s.id = x.student_id
      WHERE x.alert_id = a.id AND NOT s.is_demo
    );

  DELETE FROM students WHERE course_id = p_course AND is_demo;
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Las clases que se crearon para ellos y quedaron vacías
  DELETE FROM attendance_sessions ses
  WHERE ses.course_id = p_course AND ses.is_demo
    AND NOT EXISTS (SELECT 1 FROM attendance_records r WHERE r.session_id = ses.id);

  RETURN n;
END;
$$;


-- ── Cargar (si ya había, empieza de cero) ──
CREATE OR REPLACE FUNCTION demo_alumnos_cargar(p_course UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_school UUID;
  v_year INT := extract(year FROM current_date)::int;
  -- nombre, apellido, perfil: muy_bien · bien · riesgo (notas bajas) ·
  -- ausencias (falta mucho) · animo (viene mal en los check-ins)
  alumnos TEXT[] := ARRAY[
    ['Valentina', 'Paz', 'muy_bien'],
    ['Thiago', 'Medina', 'bien'],
    ['Martina', 'Ledesma', 'bien'],
    ['Benjamín', 'Ruiz', 'riesgo'],
    ['Catalina', 'Juárez', 'muy_bien'],
    ['Joaquín', 'Sosa', 'ausencias'],
    ['Sofía', 'Herrera', 'bien'],
    ['Lautaro', 'Díaz', 'riesgo'],
    ['Emma', 'Robles', 'animo'],
    ['Mateo', 'Acosta', 'bien'],
    ['Isabella', 'Carrizo', 'muy_bien'],
    ['Felipe', 'Albornoz', 'bien'],
    ['Mía', 'Figueroa', 'ausencias'],
    ['Santino', 'Romano', 'bien'],
    ['Delfina', 'Ríos', 'bien'],
    ['Bautista', 'Costilla', 'bien'],
    ['Renata', 'Suárez', 'muy_bien'],
    ['Tomás', 'Aguirre', 'bien'],
    ['Julieta', 'Navarro', 'bien'],
    ['Ignacio', 'Barrionuevo', 'bien']
  ];
  com_bien TEXT[] := ARRAY['Me gustó trabajar en grupo', 'Entendí todo', 'La clase estuvo buena', 'Quiero hacer más ejercicios así'];
  com_mal TEXT[] := ARRAY['No entendí bien la consigna', 'Me costó seguir la clase', 'Hoy no tenía ganas de nada', 'Fue muy rápido'];
  a RECORD;
  t RECORD;
  v_st UUID;
  v_perfil TEXT;
  v_dias INT[];
  v_sesiones UUID[];
  v_aus NUMERIC;
  v_tarde NUMERIC;
  v_opciones TEXT[];
  v_feel TEXT;
  v_cat TEXT;
  v_textos TEXT[];
  v_nota NUMERIC;
  k INT;
  n INT := 0;
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin carga alumnos de muestra';
  END IF;
  SELECT school_id INTO v_school FROM courses WHERE id = p_course;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No existe ese curso';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teacher_assignments WHERE course_id = p_course) THEN
    RAISE EXCEPTION 'El curso no tiene docentes con materias. Asigná al menos una en Personal y después cargá los alumnos de muestra.';
  END IF;

  PERFORM demo_alumnos_quitar(p_course);

  -- Trimestres del año (los mismos que arma ensure_academic_terms)
  INSERT INTO academic_terms (school_id, year, number, name, starts_on, ends_on)
  SELECT v_school, v_year, x.number, x.name, make_date(v_year, x.sm, x.sd), make_date(v_year, x.em, x.ed)
  FROM (VALUES
    (1, '1° Trimestre', 3, 1, 6, 5),
    (2, '2° Trimestre', 6, 8, 9, 11),
    (3, '3° Trimestre', 9, 14, 12, 11)
  ) AS x(number, name, sm, sd, em, ed)
  ON CONFLICT (school_id, year, number) DO NOTHING;

  -- 1. Clases de las últimas cinco semanas (hoy no: queda para pasar lista
  --    en vivo), en los días de su horario o en dos días fijos si no tiene
  FOR a IN SELECT teacher_id, subject_id FROM teacher_assignments WHERE course_id = p_course LOOP
    SELECT array_agg(DISTINCT day_index) INTO v_dias FROM schedule_blocks
    WHERE teacher_id = a.teacher_id AND course_id = p_course AND subject_id = a.subject_id;
    IF v_dias IS NULL THEN
      k := abs(hashtext(a.subject_id::text)) % 5;
      v_dias := ARRAY[k, (k + 2) % 5];
    END IF;
    INSERT INTO attendance_sessions (teacher_id, school_id, subject_id, course_id, taken_on, is_demo)
    SELECT a.teacher_id, v_school, a.subject_id, p_course, d::date, true
    FROM generate_series((current_date - 35)::timestamp, (current_date - 1)::timestamp, interval '1 day') AS d
    WHERE extract(isodow FROM d)::int - 1 = ANY (v_dias)
    ON CONFLICT (teacher_id, course_id, subject_id, taken_on) DO NOTHING;
  END LOOP;

  SELECT array_agg(id) INTO v_sesiones FROM attendance_sessions
  WHERE course_id = p_course AND taken_on BETWEEN current_date - 35 AND current_date - 1;

  -- 2. Cada alumno con su historia
  FOR i IN 1 .. array_length(alumnos, 1) LOOP
    v_perfil := alumnos[i][3];

    INSERT INTO students (first_name, last_name, avatar_initials, course_id, school_id, is_demo, status, progress)
    VALUES (
      alumnos[i][1], alumnos[i][2], upper(left(alumnos[i][1], 1) || left(alumnos[i][2], 1)),
      p_course, v_school, true,
      (CASE v_perfil WHEN 'muy_bien' THEN 'excellent' WHEN 'bien' THEN 'good'
                     WHEN 'riesgo' THEN 'critical' ELSE 'warning' END)::student_status,
      round((CASE v_perfil WHEN 'muy_bien' THEN 85 + random() * 12 WHEN 'bien' THEN 60 + random() * 25
                           WHEN 'riesgo' THEN 25 + random() * 20 ELSE 45 + random() * 20 END)::numeric, 2)
    )
    RETURNING id INTO v_st;
    n := n + 1;

    -- Asistencia
    v_aus := CASE v_perfil WHEN 'ausencias' THEN 0.30 WHEN 'riesgo' THEN 0.12 WHEN 'animo' THEN 0.08 ELSE 0.03 END;
    v_tarde := CASE v_perfil WHEN 'ausencias' THEN 0.10 ELSE 0.04 END;
    IF v_sesiones IS NOT NULL THEN
      INSERT INTO attendance_records (session_id, student_id, status)
      SELECT x.sid, v_st,
        CASE WHEN x.r < v_aus THEN 'ausente'
             WHEN x.r < v_aus + v_tarde THEN 'tarde'
             WHEN x.r < v_aus + v_tarde + 0.02 THEN 'justificado'
             ELSE 'presente' END
      FROM (SELECT sid, random() AS r FROM unnest(v_sesiones) AS sid) x
      ON CONFLICT (session_id, student_id) DO NOTHING;
    END IF;

    -- Check-ins de ánimo, del más viejo al más nuevo (así el aviso de
    -- "señales negativas" de 005 salta como en la vida real)
    FOR k IN REVERSE 8 .. 1 LOOP
      v_opciones := CASE
        WHEN v_perfil = 'muy_bien' THEN ARRAY['genial', 'genial', 'bien']
        WHEN v_perfil = 'bien' THEN ARRAY['bien', 'bien', 'genial', 'neutral']
        WHEN v_perfil = 'riesgo' THEN ARRAY['confundido', 'neutral', 'bien', 'confundido']
        WHEN v_perfil = 'ausencias' THEN ARRAY['neutral', 'bien', 'neutral']
        WHEN k <= 3 THEN ARRAY['frustrado', 'confundido']
        ELSE ARRAY['bien', 'genial', 'neutral']
      END;
      v_feel := v_opciones[1 + floor(random() * array_length(v_opciones, 1))::int];
      INSERT INTO student_checkins (student_id, moment, feeling, comment, wants_to_talk, created_at)
      VALUES (
        v_st,
        CASE WHEN k % 2 = 0 THEN 'inicio' ELSE 'fin' END,
        v_feel,
        CASE WHEN random() < 0.3 THEN
          CASE WHEN v_feel IN ('frustrado', 'confundido')
            THEN com_mal[1 + floor(random() * array_length(com_mal, 1))::int]
            ELSE com_bien[1 + floor(random() * array_length(com_bien, 1))::int] END
        END,
        v_perfil = 'animo' AND k = 1,
        now() - make_interval(days => CASE WHEN v_perfil = 'animo' AND k <= 3 THEN k * 2 ELSE k * 4 END)
              - make_interval(hours => floor(random() * 6)::int)
      );
    END LOOP;

    -- Observaciones del docente (todos los perfiles con algo que contar,
    -- y la mitad de los que andan bien)
    IF v_perfil <> 'bien' OR random() < 0.5 THEN
      SELECT teacher_id, subject_id INTO a FROM teacher_assignments WHERE course_id = p_course ORDER BY random() LIMIT 1;
      v_cat := CASE v_perfil WHEN 'muy_bien' THEN 'logro' WHEN 'bien' THEN 'participacion'
                             WHEN 'riesgo' THEN 'dificultad' WHEN 'ausencias' THEN 'familia' ELSE 'otro' END;
      v_textos := CASE v_perfil
        WHEN 'muy_bien' THEN ARRAY[
          'Explicó en el pizarrón cómo resolvió el problema y ayudó a dos compañeros a terminarlo.',
          'Entregó el trabajo práctico completo y muy prolijo, con conclusiones propias.']
        WHEN 'bien' THEN ARRAY[
          'Participa cuando se le pregunta. Esta semana trajo la carpeta al día.',
          'Trabajó bien en grupo; todavía le cuesta animarse a hablar frente a todos.',
          'Mejoró mucho la organización de la carpeta.']
        WHEN 'riesgo' THEN ARRAY[
          'Le cuesta resolver los ejercicios sin ayuda. Acordamos repasar con la guía antes de la evaluación.',
          'No entregó los dos últimos trabajos. Se le dio una semana más.']
        WHEN 'ausencias' THEN ARRAY[
          'Faltó varias clases seguidas. Se habló con la familia: tiene problemas con el colectivo y lo están resolviendo.']
        ELSE ARRAY[
          'Estas semanas participa menos y está más en silencio que de costumbre. Lo hablamos con preceptoría.']
      END;
      INSERT INTO student_observations (student_id, teacher_id, subject_id, category, note, created_at)
      VALUES (v_st, a.teacher_id, a.subject_id, v_cat,
              v_textos[1 + floor(random() * array_length(v_textos, 1))::int],
              now() - make_interval(days => 1 + floor(random() * 20)::int));
    END IF;

    -- Medallas (cada una suma 25 XP por el trigger de 022)
    FOR k IN 1 .. CASE v_perfil WHEN 'muy_bien' THEN 2 WHEN 'bien' THEN (random() < 0.6)::int ELSE 1 END LOOP
      SELECT teacher_id, subject_id INTO a FROM teacher_assignments WHERE course_id = p_course ORDER BY random() LIMIT 1;
      v_opciones := CASE v_perfil
        WHEN 'muy_bien' THEN ARRAY['crack', 'genio', 'imparable', 'creatividad']
        WHEN 'bien' THEN ARRAY['esfuerzo', 'participacion', 'companerismo', 'aura']
        WHEN 'animo' THEN ARRAY['companerismo']
        ELSE ARRAY['esfuerzo']
      END;
      INSERT INTO student_awards (student_id, teacher_id, subject_id, badge_code, created_at)
      VALUES (v_st, a.teacher_id, a.subject_id,
              v_opciones[1 + floor(random() * array_length(v_opciones, 1))::int],
              now() - make_interval(days => 1 + floor(random() * 25)::int));
    END LOOP;

    -- Práctica en el modo estudio
    INSERT INTO student_progress (student_id, xp, streak_days, best_streak, last_practice_date, total_attempts, perfect_count)
    SELECT v_st, p.xp, p.racha, p.racha + p.extra, current_date - p.hace, p.intentos, p.perfectos
    FROM (SELECT
      CASE v_perfil WHEN 'muy_bien' THEN 400 + floor(random() * 300) WHEN 'bien' THEN 150 + floor(random() * 200)
                    WHEN 'riesgo' THEN 20 + floor(random() * 60) WHEN 'ausencias' THEN 60 + floor(random() * 90) ELSE 220 END::int AS xp,
      CASE v_perfil WHEN 'muy_bien' THEN 5 + floor(random() * 8) WHEN 'bien' THEN 1 + floor(random() * 4) ELSE 0 END::int AS racha,
      floor(random() * 6)::int AS extra,
      CASE v_perfil WHEN 'muy_bien' THEN 0 WHEN 'bien' THEN 1 + floor(random() * 3)
                    WHEN 'riesgo' THEN 10 + floor(random() * 10) ELSE 6 END::int AS hace,
      CASE v_perfil WHEN 'muy_bien' THEN 25 + floor(random() * 15) WHEN 'bien' THEN 10 + floor(random() * 10)
                    WHEN 'riesgo' THEN 2 + floor(random() * 4) ELSE 8 END::int AS intentos,
      CASE v_perfil WHEN 'muy_bien' THEN 8 + floor(random() * 7) WHEN 'bien' THEN 2 + floor(random() * 4) ELSE 1 END::int AS perfectos
    ) p
    ON CONFLICT (student_id) DO UPDATE SET
      xp = student_progress.xp + EXCLUDED.xp,
      streak_days = EXCLUDED.streak_days,
      best_streak = EXCLUDED.best_streak,
      last_practice_date = EXCLUDED.last_practice_date,
      total_attempts = EXCLUDED.total_attempts,
      perfect_count = EXCLUDED.perfect_count;

    -- Notas del 1° y 2° trimestre, publicadas "como" el docente de cada
    -- materia: auth.uid() pasa a ser él solo para estos INSERT
    FOR a IN SELECT DISTINCT ON (subject_id) teacher_id, subject_id FROM teacher_assignments
             WHERE course_id = p_course ORDER BY subject_id, created_at LOOP
      PERFORM set_config('request.jwt.claim.sub', a.teacher_id::text, true);
      FOR t IN SELECT id, number FROM academic_terms
               WHERE school_id = v_school AND year = v_year AND number IN (1, 2) ORDER BY number LOOP
        v_nota := CASE v_perfil
          WHEN 'muy_bien' THEN 8 + floor(random() * 3)
          WHEN 'bien' THEN 6 + floor(random() * 3)
          WHEN 'riesgo' THEN (CASE t.number WHEN 1 THEN 5 ELSE 4 END) + floor(random() * 2)
          WHEN 'ausencias' THEN (CASE t.number WHEN 1 THEN 6 ELSE 5 END) + floor(random() * 2)
          ELSE CASE t.number WHEN 1 THEN 8 ELSE 6 END
        END;
        INSERT INTO term_grades (student_id, subject_id, course_id, term_id, school_id, grade, status)
        VALUES (v_st, a.subject_id, p_course, t.id, v_school, v_nota, 'publicada')
        ON CONFLICT (student_id, subject_id, course_id, term_id) DO NOTHING;
      END LOOP;
    END LOOP;
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_admin::text, ''), true);

    -- Lo que contó en Migue (lo ve dirección en Bienestar)
    IF v_perfil = 'animo' THEN
      INSERT INTO wellbeing_signals (student_id, school_id, level, reason, created_at)
      VALUES (v_st, v_school, 'seguimiento', 'Contó que viene con pocas ganas de venir a la escuela', now() - interval '2 days');
    END IF;
  END LOOP;

  -- Promedio y cantidad de alertas de la lista
  UPDATE students s SET
    average = COALESCE((SELECT round(avg(g.grade), 2) FROM term_grades g WHERE g.student_id = s.id), 0),
    alerts_count = (SELECT count(*) FROM alert_students x WHERE x.student_id = s.id)
  WHERE s.course_id = p_course AND s.is_demo;

  RETURN n;
END;
$$;


-- ── Cuántos hay en cada curso de una escuela: { "<course_id>": 20 } ──
CREATE OR REPLACE FUNCTION demo_alumnos_estado(p_school UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(course_id, n), '{}'::jsonb)
  FROM (
    SELECT course_id, count(*) AS n FROM students
    WHERE school_id = p_school AND is_demo AND is_superadmin()
    GROUP BY course_id
  ) x
$$;

REVOKE EXECUTE ON FUNCTION demo_alumnos_quitar(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION demo_alumnos_cargar(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION demo_alumnos_estado(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION demo_alumnos_quitar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION demo_alumnos_cargar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION demo_alumnos_estado(UUID) TO authenticated;

-- Verificación (devuelve una fila; las dos columnas tienen que dar true):
-- SELECT
--   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'is_demo') AS columna_ok,
--   (SELECT count(*) FROM pg_proc WHERE proname IN ('demo_alumnos_cargar', 'demo_alumnos_quitar', 'demo_alumnos_estado')) = 3 AS funciones_ok;
