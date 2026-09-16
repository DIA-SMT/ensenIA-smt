-- ═══════════════════════════════════════════════
--  EstudIA — Migration 007: Gamificación del estudiante
--  Logros (docente + automáticos), reacciones a materiales
--  y check-in emocional libre (sin actividad).
-- ═══════════════════════════════════════════════

-- ── Logros del estudiante ──
-- kind 'docente': otorgado a mano ("⚡ Six-Seven", "✨ Aura", ...).
-- kind 'auto': lo otorga el sistema (primera entrega, puntaje perfecto).
CREATE TABLE student_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'docente' CHECK (kind IN ('docente', 'auto')),
  emoji TEXT NOT NULL DEFAULT '🏅',
  title TEXT NOT NULL,
  reason TEXT,
  points INT NOT NULL DEFAULT 10 CHECK (points BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_achievements_student ON student_achievements(student_id, created_at DESC);

ALTER TABLE student_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students see own achievements"
  ON student_achievements FOR SELECT
  USING (student_id = auth_student_id());

CREATE POLICY "Teachers of the course manage achievements"
  ON student_achievements FOR ALL
  USING (
    student_id IN (
      SELECT s.id FROM students s
      JOIN teacher_assignments ta ON ta.course_id = s.course_id
      WHERE ta.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    granted_by = auth.uid()
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN teacher_assignments ta ON ta.course_id = s.course_id
      WHERE ta.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Directors view school achievements"
  ON student_achievements FOR SELECT
  USING (
    auth_role() = 'director'
    AND student_id IN (SELECT id FROM students WHERE school_id = auth_school_id())
  );

CREATE POLICY "Guardians see their students achievements"
  ON student_achievements FOR SELECT
  USING (student_id IN (SELECT auth_guardian_student_ids()));

-- ── Reacciones del estudiante a materiales de la biblioteca ──
-- "¿Te sirvió este material?" — feedback directo al docente.
CREATE TABLE material_reactions (
  material_id UUID NOT NULL REFERENCES library_materials(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (material_id, student_id)
);

CREATE INDEX idx_material_reactions_material ON material_reactions(material_id);

ALTER TABLE material_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own reactions"
  ON material_reactions FOR ALL
  USING (student_id = auth_student_id())
  WITH CHECK (student_id = auth_student_id());

CREATE POLICY "Teachers view reactions on their materials"
  ON material_reactions FOR SELECT
  USING (material_id IN (SELECT id FROM library_materials WHERE teacher_id = auth.uid()));

-- ── Check-in libre: cómo se siente hoy, sin actividad de por medio ──
ALTER TABLE student_checkins DROP CONSTRAINT IF EXISTS student_checkins_moment_check;
ALTER TABLE student_checkins
  ADD CONSTRAINT student_checkins_moment_check CHECK (moment IN ('inicio', 'fin', 'libre'));

-- ── Modos de IA del estudiante en el historial de chat ──
-- (no se usan dentro de esta migración, solo se registran en el enum)
ALTER TYPE ia_tool_type ADD VALUE IF NOT EXISTS 'guide';
ALTER TYPE ia_tool_type ADD VALUE IF NOT EXISTS 'simplify';

-- ── Auto-logros al entregar actividades ──
-- SECURITY DEFINER: el trigger inserta logros salteando RLS.
CREATE OR REPLACE FUNCTION grant_auto_achievements()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  submission_count INT;
  act_title TEXT;
  act_points NUMERIC;
  final_score NUMERIC;
BEGIN
  -- Solo cuando la entrega queda enviada o calificada
  IF NEW.status NOT IN ('submitted', 'graded') THEN
    RETURN NEW;
  END IF;

  SELECT title, points INTO act_title, act_points FROM activities WHERE id = NEW.activity_id;

  -- 🚀 Primera entrega del estudiante
  SELECT count(*) INTO submission_count
  FROM activity_submissions
  WHERE student_id = NEW.student_id AND status IN ('submitted', 'graded');

  IF submission_count <= 1 AND NOT EXISTS (
    SELECT 1 FROM student_achievements
    WHERE student_id = NEW.student_id AND kind = 'auto' AND title = 'Primera entrega'
  ) THEN
    INSERT INTO student_achievements (student_id, kind, emoji, title, reason, points)
    VALUES (NEW.student_id, 'auto', '🚀', 'Primera entrega', act_title, 10);
  END IF;

  -- 🎯 Puntaje perfecto
  final_score := COALESCE(NEW.score, NEW.auto_score);
  IF act_points IS NOT NULL AND final_score IS NOT NULL AND final_score >= act_points AND NOT EXISTS (
    SELECT 1 FROM student_achievements
    WHERE student_id = NEW.student_id AND kind = 'auto'
      AND title = 'Puntaje perfecto' AND reason = act_title
  ) THEN
    INSERT INTO student_achievements (student_id, kind, emoji, title, reason, points)
    VALUES (NEW.student_id, 'auto', '🎯', 'Puntaje perfecto', act_title, 20);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_achievements ON activity_submissions;
CREATE TRIGGER trg_auto_achievements
  AFTER INSERT OR UPDATE OF status, score, auto_score ON activity_submissions
  FOR EACH ROW
  EXECUTE FUNCTION grant_auto_achievements();
