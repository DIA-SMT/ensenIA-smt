-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 007: Modo Estudio
--  Herramientas de estudio para estudiantes: práctica
--  gamificada con quiz pedagógico cacheado por material,
--  guía de estudio IA, progreso personal (XP / racha /
--  logros, sin ranking) y notas personales.
-- ═══════════════════════════════════════════════

-- ── 1. Cache IA en el material ──
-- El quiz y la guía se generan UNA vez (edge function con service role)
-- y quedan disponibles para todos los estudiantes del curso.
ALTER TABLE library_materials
  ADD COLUMN IF NOT EXISTS practice_quiz JSONB,   -- [{prompt, options[], correct_index, explanation, hint}]
  ADD COLUMN IF NOT EXISTS study_guide TEXT;      -- Markdown dirigido al estudiante

-- ── 2. Intentos de práctica ──
-- material_id con SET NULL: si el docente borra el material,
-- el historial y el XP del estudiante sobreviven.
CREATE TABLE practice_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  material_id UUID REFERENCES library_materials(id) ON DELETE SET NULL,
  score INT NOT NULL,
  total INT NOT NULL,
  xp_earned INT NOT NULL DEFAULT 0,   -- lo calcula y pisa el trigger; se ignora lo que mande el cliente
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_practice_attempts_student ON practice_attempts(student_id, created_at DESC);
CREATE INDEX idx_practice_attempts_material ON practice_attempts(material_id);

-- ── 3. Progreso personal (una fila por estudiante) ──
-- Solo escriben los triggers SECURITY DEFINER: sin policies de INSERT/UPDATE.
CREATE TABLE student_progress (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  xp INT NOT NULL DEFAULT 0,
  streak_days INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  last_practice_date DATE,            -- fecha con corte de día en America/Argentina/Buenos_Aires
  total_attempts INT NOT NULL DEFAULT 0,
  perfect_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. Logros ──
-- El catálogo (emoji, label, descripción) vive en el frontend.
CREATE TABLE student_badges (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL,           -- 'primer_quiz' | 'quiz_perfecto' | 'racha_5' | 'diez_practicas'
  earned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (student_id, badge_code)
);

-- ── 5. Notas personales del estudiante ──
-- Calcada de quick_notes del docente, con is_done para usarla de checklist.
CREATE TABLE student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_student_notes_student ON student_notes(student_id);

-- ── 6. Trigger: XP calculado en el servidor (anti-manipulación / anti-farmeo) ──
CREATE OR REPLACE FUNCTION compute_practice_xp()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoy DATE := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF NEW.total <= 0 OR NEW.score < 0 OR NEW.score > NEW.total THEN
    RAISE EXCEPTION 'Puntaje de práctica inválido';
  END IF;

  -- Repetir el mismo material el mismo día da XP fijo bajo (anti-farmeo)
  IF NEW.material_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM practice_attempts
    WHERE student_id = NEW.student_id
      AND material_id = NEW.material_id
      AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = hoy
  ) THEN
    NEW.xp_earned := 5;
  ELSE
    NEW.xp_earned := 10 + NEW.score * 5
      + CASE WHEN NEW.score = NEW.total THEN 20 ELSE 0 END;  -- bonus por quiz perfecto
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_practice_xp
  BEFORE INSERT ON practice_attempts
  FOR EACH ROW EXECUTE FUNCTION compute_practice_xp();

-- ── 7. Trigger: progreso, racha y logros ──
CREATE OR REPLACE FUNCTION update_student_progress()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoy DATE := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  prog RECORD;
BEGIN
  INSERT INTO student_progress (student_id, xp, streak_days, best_streak, last_practice_date, total_attempts, perfect_count)
  VALUES (NEW.student_id, NEW.xp_earned, 1, 1, hoy, 1, (NEW.score = NEW.total)::int)
  ON CONFLICT (student_id) DO UPDATE SET
    xp = student_progress.xp + NEW.xp_earned,
    streak_days = CASE
      WHEN student_progress.last_practice_date = hoy THEN student_progress.streak_days
      WHEN student_progress.last_practice_date = hoy - 1 THEN student_progress.streak_days + 1
      ELSE 1
    END,
    best_streak = GREATEST(student_progress.best_streak, CASE
      WHEN student_progress.last_practice_date = hoy THEN student_progress.streak_days
      WHEN student_progress.last_practice_date = hoy - 1 THEN student_progress.streak_days + 1
      ELSE 1
    END),
    last_practice_date = hoy,
    total_attempts = student_progress.total_attempts + 1,
    perfect_count = student_progress.perfect_count + (NEW.score = NEW.total)::int,
    updated_at = now();

  SELECT * INTO prog FROM student_progress WHERE student_id = NEW.student_id;

  -- Logros: insert idempotente, solo los que corresponden a este intento
  INSERT INTO student_badges (student_id, badge_code)
  SELECT NEW.student_id, b.code
  FROM (VALUES ('primer_quiz'), ('quiz_perfecto'), ('racha_5'), ('diez_practicas')) AS b(code)
  WHERE (b.code = 'primer_quiz')
     OR (b.code = 'quiz_perfecto' AND NEW.score = NEW.total)
     OR (b.code = 'racha_5' AND prog.streak_days >= 5)
     OR (b.code = 'diez_practicas' AND prog.total_attempts >= 10)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_practice_progress
  AFTER INSERT ON practice_attempts
  FOR EACH ROW EXECUTE FUNCTION update_student_progress();

-- ═══════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════

-- ── practice_attempts: el estudiante registra y ve solo lo suyo ──
ALTER TABLE practice_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert own attempts"
  ON practice_attempts FOR INSERT
  WITH CHECK (student_id = auth_student_id());

CREATE POLICY "Students view own attempts"
  ON practice_attempts FOR SELECT
  USING (student_id = auth_student_id());

-- ── student_progress: solo lectura (escriben los triggers) ──
ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own progress"
  ON student_progress FOR SELECT
  USING (student_id = auth_student_id());

CREATE POLICY "Teachers view progress of their students"
  ON student_progress FOR SELECT
  USING (student_id IN (
    SELECT e.student_id
    FROM enrollments e
    JOIN teacher_assignments ta
      ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
    WHERE ta.teacher_id = auth.uid()
  ));

-- ── student_badges: mismo criterio que el progreso ──
ALTER TABLE student_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own badges"
  ON student_badges FOR SELECT
  USING (student_id = auth_student_id());

CREATE POLICY "Teachers view badges of their students"
  ON student_badges FOR SELECT
  USING (student_id IN (
    SELECT e.student_id
    FROM enrollments e
    JOIN teacher_assignments ta
      ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
    WHERE ta.teacher_id = auth.uid()
  ));

-- ── student_notes: CRUD completo del propio estudiante ──
ALTER TABLE student_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students CRUD own notes"
  ON student_notes FOR ALL
  USING (student_id = auth_student_id())
  WITH CHECK (student_id = auth_student_id());
