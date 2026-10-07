-- 058 — Evaluar al docente: su uso de la app y la devolución de los chicos
--
-- Decisiones (del usuario, oct 2026):
--  · La devolución de los estudiantes es ANÓNIMA y AGRUPADA: dirección y el
--    propio docente ven totales y comentarios sin nombre, y solo con 5
--    respuestas o más (con menos se adivina quién fue).
--  · El docente ve lo mismo que dirección ve de él (uso y devolución).
--
-- Por eso la tabla devoluciones NO tiene ninguna policy de lectura para
-- docentes ni dirección: guarda quién respondió (para que cada chico responda
-- una vez y vea la suya) pero eso nunca sale. Todo lo que se muestra pasa por
-- devolucion_docente(), que agrega.
--
-- Cuidado de menores: un comentario anónimo que suena a que el chico la está
-- pasando mal no puede quedar perdido entre los anónimos. No se guarda como
-- comentario: se avisa a la dirección (sin nombre, con el curso y el texto) y
-- la app le ofrece al chico hablar con alguien.

-- ══ 1. Las devoluciones ══

CREATE TABLE IF NOT EXISTS devoluciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id  UUID REFERENCES subjects(id) ON DELETE SET NULL,
  course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  origen      TEXT NOT NULL CHECK (origen IN ('actividad', 'clase_en_vivo', 'clase_enviada')),
  ref_id      UUID NOT NULL,
  -- 1 = no me sirvió · 2 = más o menos · 3 = me sirvió mucho
  valor       SMALLINT NOT NULL CHECK (valor BETWEEN 1 AND 3),
  comentario  TEXT CHECK (char_length(comentario) <= 300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, origen, ref_id)
);

CREATE INDEX IF NOT EXISTS devoluciones_docente_idx ON devoluciones (teacher_id, school_id, created_at DESC);

ALTER TABLE devoluciones ENABLE ROW LEVEL SECURITY;

-- El chico ve solo las suyas (para saber si ya respondió). Nadie más lee filas.
DROP POLICY IF EXISTS "Student reads own feedback" ON devoluciones;
CREATE POLICY "Student reads own feedback"
  ON devoluciones FOR SELECT
  USING (student_id = auth_student_id());

-- ══ 2. Dar la devolución (solo por acá: valida que el chico estuvo) ══

CREATE OR REPLACE FUNCTION dar_devolucion(p_origen TEXT, p_ref UUID, p_valor INT, p_comentario TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st UUID := auth_student_id();
  v_teacher UUID;
  v_subject UUID;
  v_course UUID;
  v_school UUID;
  v_comentario TEXT := nullif(left(trim(coalesce(p_comentario, '')), 300), '');
  v_plegado TEXT;
  v_riesgo BOOLEAN := false;
  v_avisados INT;
BEGIN
  IF v_st IS NULL THEN RAISE EXCEPTION 'Solo los estudiantes dan devoluciones'; END IF;
  IF p_valor NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  IF p_origen = 'actividad' THEN
    -- Una tarea que entregó
    SELECT a.teacher_id, a.subject_id, a.course_id, a.school_id
      INTO v_teacher, v_subject, v_course, v_school
    FROM activities a
    WHERE a.id = p_ref
      AND EXISTS (SELECT 1 FROM activity_submissions s
                  WHERE s.activity_id = a.id AND s.student_id = v_st AND s.status IN ('submitted', 'graded'));
  ELSIF p_origen = 'clase_en_vivo' THEN
    -- Una clase en vivo de su curso en la que estuvo
    SELECT ls.teacher_id, ls.subject_id, ls.course_id, ls.school_id
      INTO v_teacher, v_subject, v_course, v_school
    FROM live_sessions ls
    WHERE ls.id = p_ref
      AND ls.course_id = auth_student_course_id()
      AND EXISTS (SELECT 1 FROM live_presence lp WHERE lp.session_id = ls.id AND lp.student_id = v_st);
  ELSIF p_origen = 'clase_enviada' THEN
    -- Una clase que le mandaron
    SELECT ce.teacher_id, ce.subject_id, ce.course_id, ce.school_id
      INTO v_teacher, v_subject, v_course, v_school
    FROM clases_enviadas ce
    WHERE ce.id = p_ref
      AND student_sees_material(ce.subject_id, ce.course_id, ce.teacher_id);
  ELSE
    RAISE EXCEPTION 'Origen inválido';
  END IF;

  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa clase o tarea para vos';
  END IF;

  -- ¿El comentario suena a que la está pasando mal? (sin tildes, minúsculas)
  IF v_comentario IS NOT NULL THEN
    v_plegado := lower(translate(v_comentario, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'));
    v_riesgo := v_plegado ~ '(quiero morir|me quiero matar|matarme|suicid|no quiero vivir|me corto|cortarme|autolesi|lastimarme|me lastimo|me pegan|me pega |me golpea|abusa|abuso|me acosa|acoso|bullying|me tocan|me toca |me amenaza|me odio|nadie me quiere)';
  END IF;

  INSERT INTO devoluciones (school_id, teacher_id, subject_id, course_id, student_id, origen, ref_id, valor, comentario)
  VALUES (v_school, v_teacher, v_subject, v_course, v_st, p_origen, p_ref, p_valor,
          CASE WHEN v_riesgo THEN NULL ELSE v_comentario END)
  ON CONFLICT (student_id, origen, ref_id)
  DO UPDATE SET valor = EXCLUDED.valor, comentario = EXCLUDED.comentario, created_at = now();

  IF v_riesgo THEN
    -- A la dirección, sin nombre: el curso, la materia y lo que escribió.
    -- Remitente: el docente de esa clase (la columna no admite vacío, y poner
    -- al chico rompería el anonimato).
    v_avisados := notificar_a_direccion(
      v_school, v_teacher,
      'Un estudiante escribió algo que preocupa',
      'En una devolución anónima de ' || coalesce((SELECT name FROM courses WHERE id = v_course), 'un curso')
        || ' (' || coalesce((SELECT name FROM subjects WHERE id = v_subject), 'una materia') || ') un estudiante escribió: "'
        || v_comentario || '". Es anónimo: conviene una charla con el curso o con su preceptoría.'
    );
    -- Sin directivos cargados, que no quede sin nadie que lo lea: al docente
    IF COALESCE(v_avisados, 0) = 0 THEN
      INSERT INTO notifications (from_user_id, to_user_id, title, message, priority, school_id)
      VALUES (v_teacher, v_teacher, 'Un estudiante escribió algo que preocupa',
              'En una devolución anónima un estudiante de tu curso escribió: "' || v_comentario
              || '". Es anónimo: conviene una charla con el curso y avisar a la escuela.', 'high', v_school);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'riesgo', v_riesgo);
END;
$$;

REVOKE EXECUTE ON FUNCTION dar_devolucion(TEXT, UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dar_devolucion(TEXT, UUID, INT, TEXT) TO authenticated;

-- ══ 3. ¿Quién puede ver lo de un docente? Él mismo, o la dirección de su escuela ══

CREATE OR REPLACE FUNCTION puede_ver_docente(p_teacher UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_teacher = auth.uid()
      OR (auth_role() = 'director' AND is_member_as(p_teacher, auth_school_id(), 'docente'))
$$;
REVOKE EXECUTE ON FUNCTION puede_ver_docente(UUID) FROM PUBLIC, anon, authenticated;

-- ══ 4. La devolución de un docente, agregada ══

CREATE OR REPLACE FUNCTION devolucion_docente(p_teacher UUID, p_dias INT DEFAULT 90)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  MINIMO CONSTANT INT := 5;
  v_school UUID := auth_school_id();
  v_desde TIMESTAMPTZ := now() - make_interval(days => GREATEST(7, LEAST(COALESCE(p_dias, 90), 365)));
  v_total INT;
  r JSONB;
BEGIN
  IF v_school IS NULL OR NOT puede_ver_docente(p_teacher) THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_total FROM devoluciones
   WHERE teacher_id = p_teacher AND school_id = v_school AND created_at >= v_desde;

  r := jsonb_build_object('total', v_total, 'minimo', MINIMO, 'suficiente', v_total >= MINIMO);

  IF v_total >= MINIMO THEN
    r := r || jsonb_build_object(
      'valores', (
        SELECT jsonb_build_object(
          'mucho', count(*) FILTER (WHERE valor = 3),
          'masOMenos', count(*) FILTER (WHERE valor = 2),
          'nada', count(*) FILTER (WHERE valor = 1),
          'promedio', round(avg(valor), 2))
        FROM devoluciones
        WHERE teacher_id = p_teacher AND school_id = v_school AND created_at >= v_desde
      ),
      -- Por materia y curso, solo los grupos con 5 o más (con menos se adivina)
      'porGrupo', (
        SELECT COALESCE(jsonb_agg(g ORDER BY g->>'materia', g->>'curso'), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
                   'materia', coalesce(su.name, '—'), 'curso', coalesce(c.name, '—'),
                   'total', count(*), 'promedio', round(avg(d.valor), 2),
                   'mucho', count(*) FILTER (WHERE d.valor = 3), 'nada', count(*) FILTER (WHERE d.valor = 1)) AS g
          FROM devoluciones d
          LEFT JOIN subjects su ON su.id = d.subject_id
          LEFT JOIN courses c ON c.id = d.course_id
          WHERE d.teacher_id = p_teacher AND d.school_id = v_school AND d.created_at >= v_desde
          GROUP BY su.name, c.name
          HAVING count(*) >= MINIMO
        ) x
      ),
      -- Los comentarios, sin nombre ni fecha y mezclados (el orden no delata quién)
      'comentarios', (
        SELECT COALESCE(jsonb_agg(comentario ORDER BY md5(id::text)), '[]'::jsonb)
        FROM (
          SELECT id, comentario FROM devoluciones
          WHERE teacher_id = p_teacher AND school_id = v_school AND created_at >= v_desde
            AND comentario IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 40
        ) y
      )
    );
  END IF;

  -- Lo que ya existía: 👍/👎 del material y los emojis de la clase en vivo
  r := r || jsonb_build_object(
    'material', (
      SELECT jsonb_build_object(
        'meSirvio', count(*) FILTER (WHERE mr.reaction = 'like'),
        'noMeSirvio', count(*) FILTER (WHERE mr.reaction = 'dislike'))
      FROM material_reactions mr
      JOIN library_materials m ON m.id = mr.material_id
      WHERE m.teacher_id = p_teacher AND m.school_id = v_school AND mr.created_at >= v_desde
    ),
    'enVivo', (
      SELECT COALESCE(jsonb_object_agg(emoji, n), '{}'::jsonb)
      FROM (
        SELECT lr.emoji, count(*) AS n
        FROM live_reactions lr
        JOIN live_sessions ls ON ls.id = lr.session_id
        WHERE ls.teacher_id = p_teacher AND ls.school_id = v_school AND lr.created_at >= v_desde
        GROUP BY lr.emoji
      ) z
    ),
    'clasesEnVivo', (
      SELECT count(*) FROM live_sessions ls
      WHERE ls.teacher_id = p_teacher AND ls.school_id = v_school AND ls.created_at >= v_desde
    )
  );

  RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION devolucion_docente(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION devolucion_docente(UUID, INT) TO authenticated;

-- ══ 5. El uso de la app de un docente (una sola definición, en esta escuela) ══

CREATE OR REPLACE FUNCTION uso_docente(p_teacher UUID, p_dias INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := auth_school_id();
  v_dias INT := GREATEST(7, LEAST(COALESCE(p_dias, 30), 365));
  v_desde TIMESTAMPTZ := now() - make_interval(days => v_dias);
  r JSONB;
BEGIN
  IF v_school IS NULL OR NOT puede_ver_docente(p_teacher) THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'dias', v_dias,
    'materiales', (SELECT count(*) FROM library_materials m WHERE m.teacher_id = p_teacher AND m.school_id = v_school AND m.uploaded_at >= v_desde),
    'materialesCompartidos', (SELECT count(*) FROM library_materials m WHERE m.teacher_id = p_teacher AND m.school_id = v_school AND m.uploaded_at >= v_desde AND m.is_shared_with_students),
    'actividades', (SELECT count(*) FROM activities a WHERE a.teacher_id = p_teacher AND a.school_id = v_school AND a.created_at >= v_desde),
    'clasesEnviadas', (SELECT count(*) FROM clases_enviadas ce WHERE ce.teacher_id = p_teacher AND ce.school_id = v_school AND ce.enviada_at >= v_desde),
    'clasesEnVivo', (SELECT count(*) FROM live_sessions ls WHERE ls.teacher_id = p_teacher AND ls.school_id = v_school AND ls.created_at >= v_desde),
    'listasAsistencia', (SELECT count(*) FROM attendance_sessions se WHERE se.teacher_id = p_teacher AND se.school_id = v_school AND se.taken_on >= v_desde::date),
    'notasTrimestre', (SELECT count(*) FROM term_grades tg WHERE tg.graded_by = p_teacher AND tg.school_id = v_school AND tg.graded_at >= v_desde),
    'evaluaciones', (SELECT count(*) FROM assessments ev WHERE ev.teacher_id = p_teacher AND ev.school_id = v_school AND ev.created_at >= v_desde),
    'corregidas', (SELECT count(*) FROM activity_submissions s JOIN activities a ON a.id = s.activity_id
                   WHERE a.teacher_id = p_teacher AND a.school_id = v_school AND s.status = 'graded' AND s.graded_at >= v_desde),
    'sinCorregir', (SELECT count(*) FROM activity_submissions s JOIN activities a ON a.id = s.activity_id
                    WHERE a.teacher_id = p_teacher AND a.school_id = v_school AND s.status = 'submitted'),
    'horasParaCorregir', (
      SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (s.graded_at - s.submitted_at)) / 3600))::numeric, 1)
      FROM activity_submissions s JOIN activities a ON a.id = s.activity_id
      WHERE a.teacher_id = p_teacher AND a.school_id = v_school AND s.status = 'graded'
        AND s.graded_at >= v_desde AND s.submitted_at IS NOT NULL AND s.graded_at > s.submitted_at),
    'usosIA', (SELECT COALESCE(sum(u.message_count), 0) FROM ia_usage u WHERE u.teacher_id = p_teacher AND u.usage_date >= v_desde::date),
    'ultimaActividad', GREATEST(
      (SELECT max(m.uploaded_at) FROM library_materials m WHERE m.teacher_id = p_teacher AND m.school_id = v_school),
      (SELECT max(a.created_at) FROM activities a WHERE a.teacher_id = p_teacher AND a.school_id = v_school),
      (SELECT max(ls.created_at) FROM live_sessions ls WHERE ls.teacher_id = p_teacher AND ls.school_id = v_school),
      (SELECT max(se.created_at) FROM attendance_sessions se WHERE se.teacher_id = p_teacher AND se.school_id = v_school),
      (SELECT max(ce.enviada_at) FROM clases_enviadas ce WHERE ce.teacher_id = p_teacher AND ce.school_id = v_school),
      (SELECT max(tg.graded_at) FROM term_grades tg WHERE tg.graded_by = p_teacher AND tg.school_id = v_school),
      (SELECT max(s.graded_at) FROM activity_submissions s JOIN activities a ON a.id = s.activity_id
        WHERE a.teacher_id = p_teacher AND a.school_id = v_school)
    )
  ) INTO r;

  RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION uso_docente(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION uso_docente(UUID, INT) TO authenticated;

-- ══ 6. El equipo entero, para la dirección ══

CREATE OR REPLACE FUNCTION uso_docentes(p_dias INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := auth_school_id();
BEGIN
  IF v_school IS NULL OR auth_role() IS DISTINCT FROM 'director' THEN RETURN NULL; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      uso_docente(m.user_id, p_dias)
      || jsonb_build_object(
        'teacherId', m.user_id,
        'nombre', trim(p.first_name || ' ' || p.last_name),
        'devolucion', (
          SELECT jsonb_build_object(
            'total', count(*),
            'promedio', CASE WHEN count(*) >= 5 THEN round(avg(d.valor), 2) END)
          FROM devoluciones d
          WHERE d.teacher_id = m.user_id AND d.school_id = v_school AND d.created_at >= now() - interval '90 days'
        )
      )
      ORDER BY p.last_name, p.first_name), '[]'::jsonb)
    FROM school_memberships m
    JOIN profiles p ON p.id = m.user_id
    WHERE m.school_id = v_school AND m.role = 'docente'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION uso_docentes(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION uso_docentes(INT) TO authenticated;

-- ══ 7. "Qué está pasando": el pulso docente por membresía y por escuela ══
-- Antes: los docentes eran los de profiles.school_id (un docente de dos
-- escuelas desaparecía si su escuela activa era la otra) y los conteos
-- mezclaban lo de las dos escuelas.

CREATE OR REPLACE FUNCTION get_teacher_pulse(p_days INT DEFAULT 30)
RETURNS TABLE (
  teacher_id UUID,
  teacher_name TEXT,
  materials INT,
  activities INT,
  live_classes INT,
  attendance_taken INT,
  graded INT,
  pending_grading INT,
  last_active TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  school UUID;
  since TIMESTAMPTZ;
BEGIN
  IF auth_role() <> 'director' THEN
    RAISE EXCEPTION 'Solo el equipo directivo puede ver el pulso docente';
  END IF;

  school := auth_school_id();
  since := now() - (p_days || ' days')::interval;

  RETURN QUERY
  SELECT
    p.id,
    (p.first_name || ' ' || p.last_name)::TEXT,
    (SELECT count(*)::INT FROM library_materials m
       WHERE m.teacher_id = p.id AND m.school_id = school AND m.uploaded_at >= since),
    (SELECT count(*)::INT FROM activities a
       WHERE a.teacher_id = p.id AND a.school_id = school AND a.created_at >= since),
    (SELECT count(*)::INT FROM live_sessions ls
       WHERE ls.teacher_id = p.id AND ls.school_id = school AND ls.created_at >= since),
    (SELECT count(*)::INT FROM attendance_sessions ats
       WHERE ats.teacher_id = p.id AND ats.school_id = school AND ats.created_at >= since),
    (SELECT count(*)::INT FROM activity_submissions s
       JOIN activities a2 ON a2.id = s.activity_id
       WHERE a2.teacher_id = p.id AND a2.school_id = school AND s.status = 'graded' AND s.graded_at >= since),
    (SELECT count(*)::INT FROM activity_submissions s2
       JOIN activities a3 ON a3.id = s2.activity_id
       WHERE a3.teacher_id = p.id AND a3.school_id = school AND s2.status = 'submitted'),
    GREATEST(
      (SELECT max(m2.uploaded_at) FROM library_materials m2 WHERE m2.teacher_id = p.id AND m2.school_id = school),
      (SELECT max(a4.created_at) FROM activities a4 WHERE a4.teacher_id = p.id AND a4.school_id = school),
      (SELECT max(ls2.created_at) FROM live_sessions ls2 WHERE ls2.teacher_id = p.id AND ls2.school_id = school),
      (SELECT max(ats2.created_at) FROM attendance_sessions ats2 WHERE ats2.teacher_id = p.id AND ats2.school_id = school)
    )
  FROM school_memberships mm
  JOIN profiles p ON p.id = mm.user_id
  WHERE mm.school_id = school AND mm.role = 'docente'
  ORDER BY 2;
END $$;
