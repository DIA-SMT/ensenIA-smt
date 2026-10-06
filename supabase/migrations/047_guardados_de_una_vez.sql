-- ═══════════════════════════════════════════════════════════════════
-- 047 — Lo que carga el docente se guarda de una vez, y el temario del
--       alumno no trae el contenido de los temas
--
-- Con el wifi de la escuela (se corta, a veces conecta sin internet):
--
--  · Las notas del trimestre se guardaban alumno por alumno. Si la señal
--    se cortaba en el 12, quedaban 11 publicadas —y esas familias ya
--    avisadas— y el resto no; y reintentar chocaba con las que sí habían
--    llegado. guardar_notas_trimestre las guarda todas juntas o ninguna,
--    y se puede reintentar las veces que haga falta.
--
--  · La asistencia eran dos pasos (la toma y después cada alumno). Si se
--    cortaba en el medio quedaba la toma vacía, y al reabrir decía "ya
--    tomaste asistencia" con todos presentes. guardar_asistencia hace los
--    dos de una vez.
--
--  · El temario publicado le mandaba al alumno y a la familia cada tema
--    completo, con el contenido que escribe el docente (que puede ser una
--    evaluación con las respuestas), aunque la pantalla no lo mostrara.
--    Ahora los temas los leen solo docentes y dirección; alumnos y
--    familias reciben título y objetivos por temario_clases.
--
-- Las dos funciones de guardar corren con los permisos de quien las llama:
-- valen las mismas reglas (RLS y grants) que antes, y los triggers de
-- avisos y de diciembre (024, 046) corren igual que siempre.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Notas del trimestre ──
-- p_filas: [{ student_id, grade, suggested_grade, suggested_from, teacher_note }]
-- Mismas reglas de estado que tenía el servicio (gradebook.service.ts):
--   · sin nota → borrador (una casilla vacía no puede estar publicada);
--   · ya publicada → sigue publicada aunque se guarde un borrador;
--   · el resto → lo que pidió el botón.
CREATE OR REPLACE FUNCTION guardar_notas_trimestre(
  p_subject UUID,
  p_course UUID,
  p_term UUID,
  p_status TEXT,
  p_filas JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('borrador', 'publicada') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_status USING ERRCODE = '22023';
  END IF;

  INSERT INTO term_grades AS g
    (student_id, subject_id, course_id, term_id, school_id,
     grade, suggested_grade, suggested_from, status, teacher_note)
  SELECT f.student_id, p_subject, p_course, p_term, course_school(p_course),
         f.grade, f.suggested_grade, COALESCE(f.suggested_from, 0),
         CASE WHEN f.grade IS NULL THEN 'borrador' ELSE p_status END,
         f.teacher_note
  FROM jsonb_to_recordset(COALESCE(p_filas, '[]'::jsonb))
    AS f(student_id UUID, grade NUMERIC, suggested_grade NUMERIC, suggested_from INT, teacher_note TEXT)
  ON CONFLICT (student_id, subject_id, course_id, term_id) DO UPDATE SET
    grade = EXCLUDED.grade,
    suggested_grade = EXCLUDED.suggested_grade,
    suggested_from = EXCLUDED.suggested_from,
    teacher_note = EXCLUDED.teacher_note,
    status = CASE
      WHEN EXCLUDED.grade IS NULL THEN 'borrador'
      WHEN g.status = 'publicada' THEN 'publicada'
      ELSE EXCLUDED.status
    END;
END;
$$;

REVOKE EXECUTE ON FUNCTION guardar_notas_trimestre(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_notas_trimestre(UUID, UUID, UUID, TEXT, JSONB) TO authenticated;

-- ── 2. Asistencia ──
-- p_registros: [{ student_id, status }]. Devuelve el id de la toma.
CREATE OR REPLACE FUNCTION guardar_asistencia(
  p_course UUID,
  p_subject UUID,
  p_fecha DATE,
  p_registros JSONB,
  p_nota TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_toma UUID;
BEGIN
  INSERT INTO attendance_sessions (teacher_id, school_id, subject_id, course_id, taken_on, note)
  VALUES (auth.uid(), course_school(p_course), p_subject, p_course, p_fecha, NULLIF(trim(COALESCE(p_nota, '')), ''))
  ON CONFLICT (teacher_id, course_id, subject_id, taken_on) DO UPDATE SET
    note = EXCLUDED.note,
    updated_at = now()
  RETURNING id INTO v_toma;

  INSERT INTO attendance_records (session_id, student_id, status)
  SELECT v_toma, r.student_id, r.status
  FROM jsonb_to_recordset(COALESCE(p_registros, '[]'::jsonb)) AS r(student_id UUID, status TEXT)
  ON CONFLICT (session_id, student_id) DO UPDATE SET status = EXCLUDED.status;

  RETURN v_toma;
END;
$$;

REVOKE EXECUTE ON FUNCTION guardar_asistencia(UUID, UUID, DATE, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_asistencia(UUID, UUID, DATE, JSONB, TEXT) TO authenticated;

-- ── 3. Temario: los temas completos, solo para el equipo ──
DROP POLICY IF EXISTS "Access planning_classes via planning_units RLS" ON planning_classes;
DROP POLICY IF EXISTS "Staff see planning classes of visible units" ON planning_classes;
CREATE POLICY "Staff see planning classes of visible units"
  ON planning_classes FOR SELECT
  USING (auth_role() IN ('docente', 'director') AND unit_id IN (SELECT id FROM planning_units));

-- Lo que alumnos y familias ven de cada tema del temario publicado. Repite
-- las reglas de lectura de la 025: unidad con trimestre, de una materia
-- que cursa el alumno (o el hijo, para la familia).
CREATE OR REPLACE FUNCTION temario_clases(p_unidades UUID[])
RETURNS TABLE (id UUID, unit_id UUID, title TEXT, sort_order INT, objectives TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.unit_id, c.title, c.sort_order, c.objectives
  FROM planning_classes c
  JOIN planning_units u ON u.id = c.unit_id
  WHERE c.unit_id = ANY (p_unidades)
    AND u.term_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.subject_id = u.subject_id
        AND e.course_id = u.course_id
        AND (e.student_id = auth_student_id() OR e.student_id IN (SELECT auth_guardian_student_ids()))
    )
  ORDER BY c.unit_id, c.sort_order
$$;

REVOKE EXECUTE ON FUNCTION temario_clases(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION temario_clases(UUID[]) TO authenticated;

-- Comprobación: una fila, las tres en true
SELECT
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'guardar_notas_trimestre') AS notas,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'guardar_asistencia') AS asistencia,
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'planning_classes'
              AND policyname = 'Access planning_classes via planning_units RLS') AS temario_cerrado;
