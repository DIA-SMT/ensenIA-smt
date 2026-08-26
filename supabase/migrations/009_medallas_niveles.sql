-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 009: Medallas y niveles
--  Capa social de la gamificación:
--   - Docentes otorgan medallas a estudiantes (¡Crack!, Aura +1...)
--     con dedicatoria; suman XP y quedan en el perfil del estudiante.
--   - Directivos otorgan medallas a docentes (Presente total,
--     Fábrica de actividades, Siempre ahí...).
--   - Medalla automática de materia: 5+ prácticas con promedio ≥70%
--     → "El crack de <materia>" (badge dinámico crack:<subject_id>).
--  Los niveles se derivan del XP en el frontend (sin tabla).
-- ═══════════════════════════════════════════════

-- ── 1. Medallas docente → estudiante ──
CREATE TABLE student_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  badge_code TEXT NOT NULL,          -- catálogo AWARD_META en el frontend
  message TEXT,                      -- dedicatoria opcional del docente
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_student_awards_student ON student_awards(student_id, created_at DESC);
CREATE INDEX idx_student_awards_teacher ON student_awards(teacher_id);

-- ── 2. Medallas directivo → docente ──
CREATE TABLE teacher_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  director_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL,          -- catálogo TEACHER_AWARD_META en el frontend
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_teacher_awards_teacher ON teacher_awards(teacher_id, created_at DESC);

-- ── 3. Trigger: medalla de docente suma XP al estudiante ──
CREATE OR REPLACE FUNCTION award_xp_on_student_award()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO student_progress (student_id, xp)
  VALUES (NEW.student_id, 25)
  ON CONFLICT (student_id) DO UPDATE SET
    xp = student_progress.xp + 25,
    updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_student_award_xp
  AFTER INSERT ON student_awards
  FOR EACH ROW EXECUTE FUNCTION award_xp_on_student_award();

-- ── 4. Trigger: medalla automática de materia ("El crack de <materia>") ──
-- 5+ prácticas sobre materiales de una materia con promedio ≥ 70%.
CREATE OR REPLACE FUNCTION award_subject_mastery()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  subj UUID;
  cnt INT;
  avg_pct NUMERIC;
BEGIN
  IF NEW.material_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT subject_id INTO subj FROM library_materials WHERE id = NEW.material_id;
  IF subj IS NULL THEN RETURN NEW; END IF;

  SELECT count(*), avg(pa.score::numeric / NULLIF(pa.total, 0))
    INTO cnt, avg_pct
  FROM practice_attempts pa
  JOIN library_materials lm ON lm.id = pa.material_id
  WHERE pa.student_id = NEW.student_id
    AND lm.subject_id = subj;

  IF cnt >= 5 AND avg_pct >= 0.7 THEN
    INSERT INTO student_badges (student_id, badge_code)
    VALUES (NEW.student_id, 'crack:' || subj)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subject_mastery
  AFTER INSERT ON practice_attempts
  FOR EACH ROW EXECUTE FUNCTION award_subject_mastery();

-- ═══════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════

-- ── student_awards ──
ALTER TABLE student_awards ENABLE ROW LEVEL SECURITY;

-- El docente da medallas solo a estudiantes de sus cursos, a su nombre
CREATE POLICY "Teachers award their students"
  ON student_awards FOR INSERT
  WITH CHECK (
    teacher_id = auth.uid()
    AND auth_role() IN ('docente', 'director')
    AND student_id IN (
      SELECT e.student_id
      FROM enrollments e
      JOIN teacher_assignments ta
        ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE ta.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Students view own awards"
  ON student_awards FOR SELECT
  USING (student_id = auth_student_id());

CREATE POLICY "Teachers view awards they gave or of their students"
  ON student_awards FOR SELECT
  USING (
    teacher_id = auth.uid()
    OR student_id IN (
      SELECT e.student_id
      FROM enrollments e
      JOIN teacher_assignments ta
        ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE ta.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Guardians view awards of their children"
  ON student_awards FOR SELECT
  USING (student_id IN (SELECT auth_guardian_student_ids()));

-- El docente puede retirar una medalla que dio (misma sesión de arrepentimiento)
CREATE POLICY "Teachers delete own given awards"
  ON student_awards FOR DELETE
  USING (teacher_id = auth.uid());

-- ── teacher_awards ──
ALTER TABLE teacher_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors award teachers of their school"
  ON teacher_awards FOR INSERT
  WITH CHECK (
    director_id = auth.uid()
    AND auth_role() = 'director'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = teacher_id AND p.school_id = auth_school_id()
    )
  );

CREATE POLICY "Teachers view own awards"
  ON teacher_awards FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "Directors view awards of their school"
  ON teacher_awards FOR SELECT
  USING (
    auth_role() = 'director'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = teacher_id AND p.school_id = auth_school_id()
    )
  );

CREATE POLICY "Directors delete own given awards"
  ON teacher_awards FOR DELETE
  USING (director_id = auth.uid());
