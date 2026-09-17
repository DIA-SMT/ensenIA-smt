-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 016: videos + alerta temprana emocional
--  · Videos (YouTube) como material de estudio: el disparador con el
--    que suele arrancar una clase, curado dentro de la plataforma.
--  · Señales tempranas: la app NO diagnostica; junta métricas crudas
--    (línea base propia, persistencia, convergencia de dominios,
--    silencio, pedido explícito) y el docente ve el porqué de cada
--    señal. Las reglas viven en el cliente, transparentes.
-- ═══════════════════════════════════════════════

-- ── Videos como material ──
ALTER TYPE file_type ADD VALUE IF NOT EXISTS 'video';
ALTER TABLE library_materials ADD COLUMN IF NOT EXISTS video_url TEXT;

-- ── Pedido explícito de ayuda en el check-in ──
-- "¿Querés que hablemos?" marcado por el estudiante saltea cualquier
-- algoritmo: es la señal de máxima prioridad.
ALTER TABLE student_checkins ADD COLUMN IF NOT EXISTS wants_to_talk BOOLEAN NOT NULL DEFAULT false;

-- ── Métricas crudas de bienestar por estudiante ──
-- Una sola llamada trae, para cada estudiante de los cursos del docente
-- (o de la escuela si es director):
--   · ánimo reciente (7 días) vs. línea base propia (días 8-45)
--   · últimos valores de check-in (para calcular rachas en el cliente)
--   · silencio (fecha del último check-in)
--   · entregas 14d vs. 14d previos · ausencias 30d vs. 30d previos
--   · participación en vivo 14d vs. 14d previos
--   · pedido de ayuda en los últimos 7 días
CREATE OR REPLACE FUNCTION get_wellbeing_signals()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('docente', 'director')
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH my_students AS (
    SELECT DISTINCT s.id
    FROM students s
    WHERE s.course_id IN (SELECT course_id FROM teacher_assignments WHERE teacher_id = auth.uid())
       OR EXISTS (
         SELECT 1 FROM profiles p
         WHERE p.id = auth.uid() AND p.role = 'director' AND p.school_id = s.school_id
       )
  ),
  ck AS (
    SELECT c.student_id,
      CASE c.feeling
        WHEN 'genial' THEN 5 WHEN 'bien' THEN 4 WHEN 'neutral' THEN 3
        WHEN 'confundido' THEN 2 ELSE 1
      END AS val,
      c.created_at,
      c.wants_to_talk
    FROM student_checkins c
    JOIN my_students ms ON ms.id = c.student_id
    WHERE c.created_at > now() - interval '45 days'
  ),
  ck_agg AS (
    SELECT student_id,
      round(avg(val) FILTER (WHERE created_at > now() - interval '7 days'), 2)  AS recent_avg,
      count(*)   FILTER (WHERE created_at > now() - interval '7 days')          AS recent_n,
      round(avg(val) FILTER (WHERE created_at <= now() - interval '7 days'), 2) AS base_avg,
      count(*)   FILTER (WHERE created_at <= now() - interval '7 days')         AS base_n,
      max(created_at) AS last_checkin_at,
      bool_or(wants_to_talk AND created_at > now() - interval '7 days')         AS help_requested
    FROM ck
    GROUP BY student_id
  ),
  subs AS (
    SELECT sub.student_id,
      count(*) FILTER (WHERE sub.updated_at > now() - interval '14 days') AS subs_14,
      count(*) FILTER (WHERE sub.updated_at <= now() - interval '14 days') AS subs_prev
    FROM activity_submissions sub
    JOIN my_students ms ON ms.id = sub.student_id
    WHERE sub.status IN ('submitted', 'graded')
      AND sub.updated_at > now() - interval '28 days'
    GROUP BY sub.student_id
  ),
  ausencias AS (
    SELECT ar.student_id,
      count(*) FILTER (WHERE ases.taken_on > current_date - 30) AS abs_30,
      count(*) FILTER (WHERE ases.taken_on <= current_date - 30) AS abs_prev
    FROM attendance_records ar
    JOIN attendance_sessions ases ON ases.id = ar.session_id
    JOIN my_students ms ON ms.id = ar.student_id
    WHERE ar.status = 'ausente' AND ases.taken_on > current_date - 60
    GROUP BY ar.student_id
  ),
  vivo AS (
    SELECT lr.student_id,
      count(*) FILTER (WHERE lr.created_at > now() - interval '14 days') AS live_14,
      count(*) FILTER (WHERE lr.created_at <= now() - interval '14 days') AS live_prev
    FROM live_responses lr
    JOIN my_students ms ON ms.id = lr.student_id
    WHERE lr.created_at > now() - interval '28 days'
    GROUP BY lr.student_id
  )
  SELECT jsonb_agg(jsonb_build_object(
    'student_id', ms.id,
    'recent_avg', ck_agg.recent_avg,
    'recent_n', COALESCE(ck_agg.recent_n, 0),
    'base_avg', ck_agg.base_avg,
    'base_n', COALESCE(ck_agg.base_n, 0),
    'last_checkin_at', ck_agg.last_checkin_at,
    'help_requested', COALESCE(ck_agg.help_requested, false),
    'last_vals', COALESCE((
      SELECT jsonb_agg(z.val)
      FROM (
        SELECT val FROM ck
        WHERE ck.student_id = ms.id
        ORDER BY created_at DESC
        LIMIT 6
      ) z
    ), '[]'::jsonb),
    'subs_14', COALESCE(subs.subs_14, 0),
    'subs_prev', COALESCE(subs.subs_prev, 0),
    'abs_30', COALESCE(ausencias.abs_30, 0),
    'abs_prev', COALESCE(ausencias.abs_prev, 0),
    'live_14', COALESCE(vivo.live_14, 0),
    'live_prev', COALESCE(vivo.live_prev, 0)
  )) INTO result
  FROM my_students ms
  LEFT JOIN ck_agg ON ck_agg.student_id = ms.id
  LEFT JOIN subs ON subs.student_id = ms.id
  LEFT JOIN ausencias ON ausencias.student_id = ms.id
  LEFT JOIN vivo ON vivo.student_id = ms.id;

  RETURN COALESCE(result, '[]'::jsonb);
END $$;
