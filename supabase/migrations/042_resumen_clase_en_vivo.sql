-- ═══════════════════════════════════════════════════════════════════
-- 042 — Resumen de la clase en vivo
--
-- Al terminar una clase el docente ve qué pasó: quiénes se conectaron y
-- participaron, cómo le fue al curso en cada pregunta, el ambiente
-- (check-in y emojis), las medallas que dio y el material que usó. Y puede
-- pedir un informe escrito por la IA, que queda guardado en la clase.
--
--  · live_sessions.ai_summary: el informe de la IA (lo escribe el docente
--    dueño de la clase, por su policy de siempre).
--  · live_session_summary(sesión): todos los números, armados acá (cruza
--    presencia, respuestas, reacciones y medallas). Solo el docente de la
--    clase.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS ai_summary TEXT;

CREATE OR REPLACE FUNCTION live_session_summary(p_session UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s live_sessions%ROWTYPE;
  v_fin TIMESTAMPTZ;
  r JSONB;
BEGIN
  SELECT * INTO s FROM live_sessions WHERE id = p_session;
  IF NOT FOUND OR s.teacher_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;
  v_fin := COALESCE(s.ended_at, now());

  WITH
  curso AS (
    SELECT st.id, st.first_name, st.last_name FROM students st WHERE st.course_id = s.course_id
  ),
  acts AS (
    SELECT a.* FROM live_activities a WHERE a.session_id = s.id
  ),
  resp AS (
    SELECT lr.*, a.kind, a.config
    FROM live_responses lr JOIN acts a ON a.id = lr.activity_id
  ),
  reac AS (
    SELECT * FROM live_reactions WHERE session_id = s.id
  ),
  medallas AS (
    SELECT sa.* FROM student_awards sa
    WHERE sa.teacher_id = s.teacher_id
      AND sa.student_id IN (SELECT id FROM curso)
      AND sa.created_at BETWEEN s.created_at AND v_fin
  )
  SELECT jsonb_build_object(
    'sesion', jsonb_build_object(
      'id', s.id, 'titulo', s.title, 'inicio', s.created_at, 'fin', s.ended_at,
      'minutos', GREATEST(1, round(extract(epoch FROM (v_fin - s.created_at)) / 60)::int),
      'ai_summary', s.ai_summary
    ),
    'material', (
      SELECT CASE
        WHEN s.class_id IS NOT NULL THEN
          (SELECT jsonb_build_object('tipo', 'tema', 'titulo', c.title, 'unidad', u.title)
           FROM planning_classes c JOIN planning_units u ON u.id = c.unit_id WHERE c.id = s.class_id)
        WHEN s.material_id IS NOT NULL THEN
          (SELECT jsonb_build_object('tipo', 'material', 'titulo', m.title)
           FROM library_materials m WHERE m.id = s.material_id)
      END
    ),
    'totales', jsonb_build_object(
      'curso', (SELECT count(*) FROM curso),
      'conectados', (SELECT count(*) FROM live_presence p WHERE p.session_id = s.id AND p.student_id IN (SELECT id FROM curso)),
      'participaron', (SELECT count(DISTINCT student_id) FROM resp WHERE student_id IS NOT NULL),
      'actividades', (SELECT count(*) FROM acts),
      'invitados', (SELECT count(*) FROM live_guests g WHERE g.session_id = s.id),
      'medallas', (SELECT count(*) FROM medallas)
    ),
    'actividades', (
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'orden')::int), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'orden', row_number() OVER (ORDER BY a.created_at),
          'tipo', a.kind,
          'pregunta', a.config->>'question',
          'dirigida', a.target_student_id IS NOT NULL,
          'grupal', COALESCE((a.config->>'groupMode')::boolean, false),
          'respondieron', (SELECT count(*) FROM resp WHERE resp.activity_id = a.id),
          'aciertos', CASE WHEN a.kind = 'quiz' AND a.config ? 'correctId' THEN
              (SELECT count(*) FROM resp WHERE resp.activity_id = a.id AND resp.payload->>'opcion' = a.config->>'correctId')
            END,
          'correcta', CASE WHEN a.kind = 'quiz' THEN
              (SELECT o->>'label' FROM jsonb_array_elements(a.config->'options') o WHERE o->>'id' = a.config->>'correctId')
            END
        ) AS x
        FROM acts a
      ) t
    ),
    'alumnos', (
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'respuestas')::int DESC, x->>'nombre'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', c.id,
          'nombre', c.first_name || ' ' || c.last_name,
          'conectado', EXISTS (SELECT 1 FROM live_presence p WHERE p.session_id = s.id AND p.student_id = c.id),
          'respuestas', (SELECT count(*) FROM resp WHERE resp.student_id = c.id),
          'preguntas', (SELECT count(*) FROM resp WHERE resp.student_id = c.id AND resp.kind = 'quiz' AND resp.config ? 'correctId'),
          'aciertos', (SELECT count(*) FROM resp WHERE resp.student_id = c.id AND resp.kind = 'quiz'
                         AND resp.payload->>'opcion' = resp.config->>'correctId'),
          'reacciones', (SELECT count(*) FROM reac WHERE reac.student_id = c.id),
          'medallas', (SELECT count(*) FROM medallas WHERE medallas.student_id = c.id)
        ) AS x
        FROM curso c
      ) t
    ),
    'reacciones', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('emoji', emoji, 'n', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT emoji, count(*) AS n FROM reac GROUP BY emoji) t
    ),
    'animo', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('estado', estado, 'n', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT payload->>'feeling' AS estado, count(*) AS n FROM resp
            WHERE kind = 'checkin' AND payload ? 'feeling' GROUP BY 1) t
    ),
    'medallas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('medalla', badge_code, 'n', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT badge_code, count(*) AS n FROM medallas GROUP BY badge_code) t
    )
  ) INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION live_session_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION live_session_summary(UUID) TO authenticated;

-- Comprobación: una fila, las dos en true
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'live_sessions' AND column_name = 'ai_summary') AS columna,
  to_regprocedure('public.live_session_summary(uuid)') IS NOT NULL AS funcion;
