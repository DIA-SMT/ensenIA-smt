-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 003: Estudiantes con cuenta,
--  actividades, huella digital y biblioteca real
-- ═══════════════════════════════════════════════

-- ── Students: vínculo con auth + email ──
ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- Helper RLS: id de student del usuario logueado
CREATE OR REPLACE FUNCTION auth_student_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM students WHERE user_id = auth.uid()
$$;

-- ── Enrollments: inscripción por materia+curso, con ID visible ──
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrollment_code TEXT NOT NULL,
  school_id UUID NOT NULL REFERENCES schools(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, subject_id, course_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_subject_course ON enrollments(subject_id, course_id);

-- ── Activities ──
CREATE TYPE activity_status AS ENUM ('draft', 'published', 'closed');
CREATE TYPE submission_status AS ENUM ('pending', 'in_progress', 'submitted', 'graded');

CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  content_md TEXT NOT NULL DEFAULT '',
  -- [{id, type: 'open'|'multiple_choice', prompt, options?: string[], correct_index?: number}]
  questions JSONB NOT NULL DEFAULT '[]',
  subject_id UUID NOT NULL REFERENCES subjects(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id),
  unit_id UUID REFERENCES planning_units(id) ON DELETE SET NULL,
  class_id UUID REFERENCES planning_classes(id) ON DELETE SET NULL,
  source_tool ia_tool_type,
  status activity_status NOT NULL DEFAULT 'published',
  due_date TIMESTAMPTZ,
  points INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activities_teacher ON activities(teacher_id);
CREATE INDEX idx_activities_subject_course ON activities(subject_id, course_id);
CREATE INDEX idx_activities_status ON activities(status);

-- ── Submissions (respuesta del alumno) ──
CREATE TABLE activity_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status submission_status NOT NULL DEFAULT 'in_progress',
  -- {questionId: {answer, correct?}}
  answers JSONB NOT NULL DEFAULT '{}',
  response_text TEXT,
  auto_score NUMERIC(5,2),
  score NUMERIC(5,2),
  feedback TEXT,
  time_spent_seconds INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(activity_id, student_id)
);

CREATE INDEX idx_submissions_activity ON activity_submissions(activity_id);
CREATE INDEX idx_submissions_student ON activity_submissions(student_id);

-- ── Huella digital: eventos de interacción ──
-- event_type: 'viewed' | 'started' | 'answer_changed' | 'submitted' | 'reopened' | 'focus_lost' | 'focus_gained'
CREATE TABLE activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_events_activity ON activity_events(activity_id, created_at);
CREATE INDEX idx_activity_events_student ON activity_events(student_id, created_at);

-- ── Biblioteca: archivos reales + IA + compartir ──
ALTER TABLE library_materials
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS is_shared_with_students BOOLEAN NOT NULL DEFAULT false;

-- updated_at triggers (reusa la función genérica de 002)
CREATE TRIGGER trg_activities_updated
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_chat_session_timestamp();

CREATE TRIGGER trg_submissions_updated
  BEFORE UPDATE ON activity_submissions
  FOR EACH ROW EXECUTE FUNCTION update_chat_session_timestamp();

-- ══════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════

-- Students: el alumno ve su propia ficha
CREATE POLICY "Students see own record"
  ON students FOR SELECT
  USING (user_id = auth.uid());

-- Enrollments
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students see own enrollments"
  ON enrollments FOR SELECT
  USING (student_id = auth_student_id());

CREATE POLICY "Teachers see enrollments of their assignments"
  ON enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = enrollments.subject_id
        AND ta.course_id = enrollments.course_id
    )
  );

CREATE POLICY "Directors see school enrollments"
  ON enrollments FOR SELECT
  USING (school_id = auth_school_id() AND auth_role() = 'director');

-- Activities
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own activities"
  ON activities FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Students see published activities of their enrollments"
  ON activities FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.student_id = auth_student_id()
        AND e.subject_id = activities.subject_id
        AND e.course_id = activities.course_id
    )
  );

CREATE POLICY "Directors see school activities"
  ON activities FOR SELECT
  USING (school_id = auth_school_id() AND auth_role() = 'director');

-- Submissions
ALTER TABLE activity_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own submissions"
  ON activity_submissions FOR ALL
  USING (student_id = auth_student_id())
  WITH CHECK (student_id = auth_student_id());

CREATE POLICY "Teachers view submissions of their activities"
  ON activity_submissions FOR SELECT
  USING (activity_id IN (SELECT id FROM activities WHERE teacher_id = auth.uid()));

CREATE POLICY "Teachers grade submissions of their activities"
  ON activity_submissions FOR UPDATE
  USING (activity_id IN (SELECT id FROM activities WHERE teacher_id = auth.uid()));

-- Events (huella digital)
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert own events"
  ON activity_events FOR INSERT
  WITH CHECK (student_id = auth_student_id());

CREATE POLICY "Students view own events"
  ON activity_events FOR SELECT
  USING (student_id = auth_student_id());

CREATE POLICY "Teachers view events of their activities"
  ON activity_events FOR SELECT
  USING (activity_id IN (SELECT id FROM activities WHERE teacher_id = auth.uid()));

-- Biblioteca: alumnos ven materiales compartidos de sus materias
CREATE POLICY "Students see shared materials of enrolled subjects"
  ON library_materials FOR SELECT
  USING (
    is_shared_with_students = true
    AND subject_id IN (SELECT subject_id FROM enrollments WHERE student_id = auth_student_id())
  );

-- ══════════════════════════════════════
-- STORAGE: bucket "library" + políticas
-- ══════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'library', 'library', false, 20971520,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Convención de path: <teacher_id>/<uuid>_<filename>
CREATE POLICY "Teachers upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Teachers manage own files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Read library files via materials RLS"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'library'
    AND EXISTS (
      SELECT 1 FROM public.library_materials m
      WHERE m.storage_path = storage.objects.name
        AND (
          m.teacher_id = auth.uid()
          OR (public.auth_role() = 'director' AND m.school_id = public.auth_school_id())
          OR (
            m.is_shared_with_students
            AND m.subject_id IN (
              SELECT subject_id FROM public.enrollments
              WHERE student_id = public.auth_student_id()
            )
          )
        )
    )
  );
