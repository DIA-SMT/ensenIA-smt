-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 014: presencia, pregunta dirigida y grupos
--  · El docente ve QUIÉN está conectado en la clase en vivo (no solo cuántos).
--  · Puede mandarle una pregunta a UN estudiante conectado.
--  · Grupos de estudiantes por curso (conexión, batería, pedagogía):
--    los arma el docente en segundos o valida los que se armen.
--  · Segunda escuela de la demo: E.M. Alfonsina Storni.
-- ═══════════════════════════════════════════════

-- ── Presencia: quién está en la clase en vivo ahora ──
-- El celular del estudiante late cada ~30s mientras tiene la pantalla
-- abierta; "online" = visto en los últimos 90s. Mismo criterio que los
-- invitados (live_guests.last_seen_at).
CREATE TABLE IF NOT EXISTS live_presence (
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS live_presence_seen ON live_presence(session_id, last_seen_at DESC);

ALTER TABLE live_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students upsert own presence" ON live_presence;
CREATE POLICY "Students upsert own presence"
  ON live_presence FOR ALL
  USING (student_id = auth_student_id())
  WITH CHECK (
    student_id = auth_student_id()
    AND session_id IN (SELECT id FROM live_sessions WHERE course_id = auth_student_course_id() AND status = 'live')
  );

DROP POLICY IF EXISTS "Teachers view presence of own sessions" ON live_presence;
CREATE POLICY "Teachers view presence of own sessions"
  ON live_presence FOR SELECT
  USING (session_id IN (SELECT id FROM live_sessions WHERE teacher_id = auth.uid()));

-- ── Pregunta dirigida: "esta va para vos" ──
-- NULL = para todo el curso (comportamiento de siempre).
ALTER TABLE live_activities
  ADD COLUMN IF NOT EXISTS target_student_id UUID REFERENCES students(id) ON DELETE SET NULL;

-- ── Grupos por curso ──
-- Para responder en grupo cuando no alcanzan los celulares (batería,
-- datos) o cuando la consigna es grupal. Los arma el docente.
CREATE TABLE IF NOT EXISTS course_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '👥',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_groups_course ON course_groups(course_id);

CREATE TABLE IF NOT EXISTS course_group_members (
  group_id UUID NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, student_id)
);

ALTER TABLE course_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage own groups" ON course_groups;
CREATE POLICY "Teachers manage own groups"
  ON course_groups FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Students see groups of their course" ON course_groups;
CREATE POLICY "Students see groups of their course"
  ON course_groups FOR SELECT
  USING (course_id = auth_student_course_id());

DROP POLICY IF EXISTS "Teachers manage members of own groups" ON course_group_members;
CREATE POLICY "Teachers manage members of own groups"
  ON course_group_members FOR ALL
  USING (group_id IN (SELECT id FROM course_groups WHERE teacher_id = auth.uid()))
  WITH CHECK (group_id IN (SELECT id FROM course_groups WHERE teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Students see members of course groups" ON course_group_members;
CREATE POLICY "Students see members of course groups"
  ON course_group_members FOR SELECT
  USING (group_id IN (SELECT id FROM course_groups WHERE course_id = auth_student_course_id()));

-- ── La otra escuela de la demo ──
INSERT INTO schools (name, short_name, district)
SELECT 'Escuela Municipal Alfonsina Storni', 'E.M. Alfonsina Storni', 'San Miguel de Tucumán'
WHERE NOT EXISTS (SELECT 1 FROM schools WHERE short_name = 'E.M. Alfonsina Storni');
