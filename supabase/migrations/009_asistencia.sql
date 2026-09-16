-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 009: Asistencia
--  Hasta ahora students.attendance era un número fijo que nadie
--  actualizaba. Esta migración la convierte en algo real: el docente
--  toma asistencia en un toque (y si hubo clase en vivo, viene
--  prellenada con quienes participaron desde el celular).
-- ═══════════════════════════════════════════════

-- ── Una toma de asistencia (un día, un curso, una materia) ──
CREATE TABLE attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  taken_on DATE NOT NULL DEFAULT current_date,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Una sola toma por día/curso/materia: volver a entrar edita la misma.
  UNIQUE (teacher_id, course_id, subject_id, taken_on)
);

CREATE INDEX attendance_sessions_teacher ON attendance_sessions(teacher_id, taken_on DESC);
CREATE INDEX attendance_sessions_course ON attendance_sessions(course_id, taken_on DESC);

-- ── Estado de cada estudiante en esa toma ──
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'presente'
    CHECK (status IN ('presente', 'ausente', 'tarde', 'justificado')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX attendance_records_student ON attendance_records(student_id);
CREATE INDEX attendance_records_session ON attendance_records(session_id);

CREATE OR REPLACE FUNCTION attendance_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_sessions_touch ON attendance_sessions;
CREATE TRIGGER attendance_sessions_touch BEFORE UPDATE ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();

-- ══════════════════════════════════════
-- El % de asistencia del estudiante deja de ser un número muerto:
-- se recalcula solo con cada cambio. 'tarde' y 'justificado' cuentan
-- como presencia (el estudiante estuvo en el aula).
-- ══════════════════════════════════════
CREATE OR REPLACE FUNCTION recalc_student_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_student UUID;
  total INT;
  present INT;
BEGIN
  target_student := COALESCE(NEW.student_id, OLD.student_id);

  SELECT count(*), count(*) FILTER (WHERE status <> 'ausente')
    INTO total, present
  FROM attendance_records
  WHERE student_id = target_student;

  IF total > 0 THEN
    UPDATE students
      SET attendance = ROUND((present::numeric / total) * 100, 2)
      WHERE id = target_student;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_recalc_attendance ON attendance_records;
CREATE TRIGGER trg_recalc_attendance
  AFTER INSERT OR UPDATE OR DELETE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION recalc_student_attendance();

-- ══════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════

ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own attendance sessions"
  ON attendance_sessions FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Directors view school attendance sessions"
  ON attendance_sessions FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

CREATE POLICY "Teachers manage records of own sessions"
  ON attendance_records FOR ALL
  USING (session_id IN (SELECT id FROM attendance_sessions WHERE teacher_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT id FROM attendance_sessions WHERE teacher_id = auth.uid()));

CREATE POLICY "Students see own attendance"
  ON attendance_records FOR SELECT
  USING (student_id = auth_student_id());

CREATE POLICY "Guardians see their students attendance"
  ON attendance_records FOR SELECT
  USING (student_id IN (SELECT auth_guardian_student_ids()));

CREATE POLICY "Directors view school attendance records"
  ON attendance_records FOR SELECT
  USING (
    auth_role() = 'director'
    AND student_id IN (SELECT id FROM students WHERE school_id = auth_school_id())
  );

-- ══════════════════════════════════════
-- Quiénes participaron hoy desde el celular en una clase en vivo
-- del curso: sirve para prellenar la asistencia sin trabajo extra.
-- ══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_live_participants(p_course UUID, p_date DATE)
RETURNS TABLE (student_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT r.student_id
  FROM live_responses r
  JOIN live_sessions s ON s.id = r.session_id
  WHERE s.course_id = p_course
    AND s.teacher_id = auth.uid()
    AND s.created_at::date = p_date
  UNION
  SELECT DISTINCT x.student_id
  FROM live_reactions x
  JOIN live_sessions s2 ON s2.id = x.session_id
  WHERE s2.course_id = p_course
    AND s2.teacher_id = auth.uid()
    AND s2.created_at::date = p_date
$$;
