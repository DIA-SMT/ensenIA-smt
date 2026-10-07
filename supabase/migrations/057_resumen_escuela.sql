-- 057 — La escuela en números, calculada en la base
--
-- El tablero de dirección armaba sus indicadores bajando filas crudas al
-- navegador (entregas, inscripciones, check-ins). Con más de 1000 filas
-- PostgREST corta en silencio y los números salen bajos sin ningún aviso.
-- Además faltaba lo más pedido: la asistencia (los datos estaban, ninguna
-- pantalla los mostraba), cómo vienen las notas y la evolución semana a
-- semana.
--
-- resumen_escuela() devuelve todo ya agregado, solo para la dirección de la
-- escuela activa. No devuelve nombres: son números de la escuela y de cada
-- curso (el detalle por alumno sigue en la ficha del curso).

CREATE OR REPLACE FUNCTION resumen_escuela(p_semanas INT DEFAULT 12)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := auth_school_id();
  v_semanas INT := GREATEST(4, LEAST(COALESCE(p_semanas, 12), 26));
  v_term academic_terms%ROWTYPE;
  v_cursos JSONB;
  v_semanal JSONB;
  v_notas JSONB;
  v_escuela JSONB;
BEGIN
  IF v_school IS NULL OR auth_role() IS DISTINCT FROM 'director' THEN
    RETURN NULL;
  END IF;

  -- El trimestre en curso (o el último que empezó)
  SELECT * INTO v_term FROM academic_terms
   WHERE school_id = v_school AND starts_on <= current_date
   ORDER BY (current_date <= ends_on) DESC, starts_on DESC
   LIMIT 1;

  -- ── Por curso: asistencia (30 días), faltas reiteradas, notas del trimestre, ánimo ──
  WITH cursos AS (
    SELECT c.id, c.name, c.year, c.division,
           (SELECT count(*) FROM students s WHERE s.course_id = c.id) AS estudiantes
    FROM courses c
    WHERE c.school_id = v_school
  ),
  asis AS (
    SELECT se.course_id,
           count(*) AS registros,
           count(*) FILTER (WHERE ar.status IN ('presente', 'tarde')) AS presentes
    FROM attendance_records ar
    JOIN attendance_sessions se ON se.id = ar.session_id
    WHERE se.school_id = v_school AND se.taken_on >= current_date - 30
    GROUP BY se.course_id
  ),
  faltas AS (
    SELECT course_id, count(*) AS con_faltas
    FROM (
      SELECT se.course_id, ar.student_id
      FROM attendance_records ar
      JOIN attendance_sessions se ON se.id = ar.session_id
      WHERE se.school_id = v_school AND se.taken_on >= current_date - 30 AND ar.status = 'ausente'
      GROUP BY se.course_id, ar.student_id
      HAVING count(*) >= 3
    ) x
    GROUP BY course_id
  ),
  notas AS (
    SELECT tg.course_id,
           round(avg(tg.grade), 2) AS promedio,
           count(*) AS notas,
           count(*) FILTER (WHERE tg.grade < 6) AS desaprobadas
    FROM term_grades tg
    WHERE tg.school_id = v_school AND tg.term_id = v_term.id
      AND tg.status = 'publicada' AND tg.grade IS NOT NULL
    GROUP BY tg.course_id
  ),
  animo AS (
    SELECT s.course_id,
           count(*) AS checkins,
           round(avg(CASE ck.feeling
             WHEN 'genial' THEN 5 WHEN 'bien' THEN 4 WHEN 'neutral' THEN 3
             WHEN 'confundido' THEN 2 WHEN 'frustrado' THEN 1 END), 2) AS animo
    FROM student_checkins ck
    JOIN students s ON s.id = ck.student_id
    WHERE s.school_id = v_school AND ck.created_at >= now() - interval '30 days'
    GROUP BY s.course_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'courseId', c.id,
           'nombre', c.name,
           'estudiantes', c.estudiantes,
           'asistenciaPct', CASE WHEN a.registros > 0 THEN round(100.0 * a.presentes / a.registros) END,
           'registrosAsistencia', COALESCE(a.registros, 0),
           'conFaltasReiteradas', COALESCE(f.con_faltas, 0),
           'promedio', n.promedio,
           'notas', COALESCE(n.notas, 0),
           'desaprobadas', COALESCE(n.desaprobadas, 0),
           'animo', an.animo,
           'checkins', COALESCE(an.checkins, 0)
         ) ORDER BY c.year, c.division, c.name), '[]'::jsonb)
    INTO v_cursos
  FROM cursos c
  LEFT JOIN asis a ON a.course_id = c.id
  LEFT JOIN faltas f ON f.course_id = c.id
  LEFT JOIN notas n ON n.course_id = c.id
  LEFT JOIN animo an ON an.course_id = c.id;

  -- ── Notas del trimestre: cómo se reparten ──
  SELECT jsonb_build_object(
           'trimestre', v_term.name,
           'total', count(*),
           'promedio', round(avg(tg.grade), 2),
           'rangos', jsonb_build_array(
             jsonb_build_object('rango', '1 a 3', 'n', count(*) FILTER (WHERE tg.grade < 4)),
             jsonb_build_object('rango', '4 y 5', 'n', count(*) FILTER (WHERE tg.grade >= 4 AND tg.grade < 6)),
             jsonb_build_object('rango', '6 y 7', 'n', count(*) FILTER (WHERE tg.grade >= 6 AND tg.grade < 8)),
             jsonb_build_object('rango', '8 a 10', 'n', count(*) FILTER (WHERE tg.grade >= 8))
           ),
           'aDiciembre', count(*) FILTER (WHERE tg.carries_to_december)
         )
    INTO v_notas
  FROM term_grades tg
  WHERE tg.school_id = v_school AND tg.term_id = v_term.id
    AND tg.status = 'publicada' AND tg.grade IS NOT NULL;

  -- ── Semana a semana: asistencia, ánimo, entregas, actividades ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'semana', to_char(w.inicio, 'YYYY-MM-DD'),
           'asistenciaPct', (
             SELECT CASE WHEN count(*) > 0
               THEN round(100.0 * count(*) FILTER (WHERE ar.status IN ('presente', 'tarde')) / count(*)) END
             FROM attendance_records ar
             JOIN attendance_sessions se ON se.id = ar.session_id
             WHERE se.school_id = v_school AND se.taken_on >= w.inicio AND se.taken_on < w.inicio + 7
           ),
           'animo', (
             SELECT round(avg(CASE ck.feeling
               WHEN 'genial' THEN 5 WHEN 'bien' THEN 4 WHEN 'neutral' THEN 3
               WHEN 'confundido' THEN 2 WHEN 'frustrado' THEN 1 END), 2)
             FROM student_checkins ck
             JOIN students s ON s.id = ck.student_id
             WHERE s.school_id = v_school AND ck.created_at >= w.inicio AND ck.created_at < w.inicio + 7
           ),
           'checkins', (
             SELECT count(*) FROM student_checkins ck JOIN students s ON s.id = ck.student_id
             WHERE s.school_id = v_school AND ck.created_at >= w.inicio AND ck.created_at < w.inicio + 7
           ),
           'entregas', (
             SELECT count(*) FROM activity_submissions sub JOIN activities ac ON ac.id = sub.activity_id
             WHERE ac.school_id = v_school AND sub.submitted_at >= w.inicio AND sub.submitted_at < w.inicio + 7
           ),
           'actividades', (
             SELECT count(*) FROM activities ac
             WHERE ac.school_id = v_school AND ac.created_at >= w.inicio AND ac.created_at < w.inicio + 7
           )
         ) ORDER BY w.inicio), '[]'::jsonb)
    INTO v_semanal
  FROM (
    SELECT generate_series(
      (date_trunc('week', current_date) - make_interval(weeks => v_semanas - 1))::date,
      date_trunc('week', current_date)::date,
      interval '1 week'
    )::date AS inicio
  ) w;

  -- ── La escuela entera (30 días) ──
  SELECT jsonb_build_object(
           'asistenciaPct', CASE WHEN count(*) > 0
             THEN round(100.0 * count(*) FILTER (WHERE ar.status IN ('presente', 'tarde')) / count(*)) END,
           'registrosAsistencia', count(*),
           'estudiantes', (SELECT count(*) FROM students s WHERE s.school_id = v_school)
         )
    INTO v_escuela
  FROM attendance_records ar
  JOIN attendance_sessions se ON se.id = ar.session_id
  WHERE se.school_id = v_school AND se.taken_on >= current_date - 30;

  RETURN jsonb_build_object(
    'escuela', v_escuela,
    'cursos', v_cursos,
    'notas', v_notas,
    'semanas', v_semanal
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION resumen_escuela(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resumen_escuela(INT) TO authenticated;
