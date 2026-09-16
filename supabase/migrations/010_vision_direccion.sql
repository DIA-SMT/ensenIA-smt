-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 010: visión de dirección
--  El equipo directivo ya podía ver actividades, materiales, entregas,
--  asistencia y check-ins de la escuela, pero no las clases en vivo.
--  Sin esto, "qué está pasando ahora" queda ciego.
-- ═══════════════════════════════════════════════

CREATE POLICY "Directors view school live sessions"
  ON live_sessions FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

CREATE POLICY "Directors view school live activities"
  ON live_activities FOR SELECT
  USING (
    auth_role() = 'director'
    AND session_id IN (SELECT id FROM live_sessions WHERE school_id = auth_school_id())
  );

CREATE POLICY "Directors view school live responses"
  ON live_responses FOR SELECT
  USING (
    auth_role() = 'director'
    AND session_id IN (SELECT id FROM live_sessions WHERE school_id = auth_school_id())
  );

-- ══════════════════════════════════════
-- Pulso de cada docente: qué viene haciendo en la escuela.
-- Una sola llamada en vez de seis consultas desde el navegador.
-- ══════════════════════════════════════
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
       WHERE m.teacher_id = p.id AND m.uploaded_at >= since),
    (SELECT count(*)::INT FROM activities a
       WHERE a.teacher_id = p.id AND a.created_at >= since),
    (SELECT count(*)::INT FROM live_sessions ls
       WHERE ls.teacher_id = p.id AND ls.created_at >= since),
    (SELECT count(*)::INT FROM attendance_sessions ats
       WHERE ats.teacher_id = p.id AND ats.created_at >= since),
    (SELECT count(*)::INT FROM activity_submissions s
       JOIN activities a2 ON a2.id = s.activity_id
       WHERE a2.teacher_id = p.id AND s.status = 'graded' AND s.graded_at >= since),
    (SELECT count(*)::INT FROM activity_submissions s2
       JOIN activities a3 ON a3.id = s2.activity_id
       WHERE a3.teacher_id = p.id AND s2.status = 'submitted'),
    GREATEST(
      (SELECT max(m2.uploaded_at) FROM library_materials m2 WHERE m2.teacher_id = p.id),
      (SELECT max(a4.created_at) FROM activities a4 WHERE a4.teacher_id = p.id),
      (SELECT max(ls2.created_at) FROM live_sessions ls2 WHERE ls2.teacher_id = p.id),
      (SELECT max(ats2.created_at) FROM attendance_sessions ats2 WHERE ats2.teacher_id = p.id)
    )
  FROM profiles p
  WHERE p.role = 'docente' AND p.school_id = school
  ORDER BY 2;
END $$;

-- ══════════════════════════════════════
-- Clima emocional por curso de toda la escuela: qué cursos vienen bien
-- y cuáles necesitan que alguien mire.
-- ══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_school_climate(p_days INT DEFAULT 30)
RETURNS TABLE (
  course_id UUID,
  course_name TEXT,
  checkins INT,
  mood NUMERIC,
  students_at_risk INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  school UUID;
  since TIMESTAMPTZ;
BEGIN
  IF auth_role() <> 'director' THEN
    RAISE EXCEPTION 'Solo el equipo directivo puede ver el clima de la escuela';
  END IF;

  school := auth_school_id();
  since := now() - (p_days || ' days')::interval;

  RETURN QUERY
  SELECT
    c.id,
    c.name::TEXT,
    count(ck.id)::INT,
    -- ELSE NULL es importante: con LEFT JOIN, un estudiante sin check-ins
    -- produce feeling NULL, y si lo contáramos como 1 los cursos sin datos
    -- aparecerían como si la estuvieran pasando pésimo.
    round(avg(CASE ck.feeling
      WHEN 'genial' THEN 5 WHEN 'bien' THEN 4 WHEN 'neutral' THEN 3
      WHEN 'confundido' THEN 2 WHEN 'frustrado' THEN 1 ELSE NULL END), 2),
    (SELECT count(*)::INT FROM (
       SELECT ck2.student_id
       FROM student_checkins ck2
       JOIN students s2 ON s2.id = ck2.student_id
       WHERE s2.course_id = c.id
         AND ck2.created_at >= since
         AND ck2.feeling IN ('confundido', 'frustrado')
       GROUP BY ck2.student_id
       HAVING count(*) >= 2
     ) risky)
  FROM courses c
  LEFT JOIN students s ON s.course_id = c.id
  LEFT JOIN student_checkins ck ON ck.student_id = s.id AND ck.created_at >= since
  WHERE c.school_id = school
  GROUP BY c.id, c.name
  ORDER BY c.name;
END $$;
