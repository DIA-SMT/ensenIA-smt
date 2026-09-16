-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 008: Clase en vivo + podcasts
--  El docente lanza actividades desde cualquier dispositivo durante
--  una clase tradicional; los estudiantes responden desde el celular
--  (sin apps, casi sin datos) y todos ven los resultados en vivo.
-- ═══════════════════════════════════════════════

-- ── Sesiones en vivo (una clase dictándose ahora) ──
CREATE TABLE live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL DEFAULT 'Clase en vivo',
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  -- La botonera de emojis se prende y apaga a voluntad del docente.
  reactions_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- Una sola clase viva por curso (el banner del estudiante apunta a esa).
CREATE UNIQUE INDEX live_sessions_one_live_per_course
  ON live_sessions(course_id) WHERE status = 'live';
CREATE INDEX live_sessions_teacher ON live_sessions(teacher_id, created_at DESC);

-- ── Actividades lanzadas durante la sesión (ad hoc, híbrido con la clase tradicional) ──
CREATE TABLE live_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  -- encuesta: una opción · quiz: opción con correcta y revelar · chips: varias
  -- texto: respuesta libre · nube: una palabra · checkin: cómo venís
  kind TEXT NOT NULL CHECK (kind IN ('encuesta', 'quiz', 'chips', 'texto', 'nube', 'checkin')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revealed', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX live_activities_session ON live_activities(session_id, created_at DESC);

-- ── Respuestas (upsert: el estudiante puede cambiarla hasta que se cierre) ──
CREATE TABLE live_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES live_activities(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (activity_id, student_id)
);

CREATE INDEX live_responses_activity ON live_responses(activity_id);

CREATE OR REPLACE FUNCTION live_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS live_responses_touch ON live_responses;
CREATE TRIGGER live_responses_touch BEFORE UPDATE ON live_responses
  FOR EACH ROW EXECUTE FUNCTION live_touch_updated_at();

-- ── Reacciones (emojis que flotan en el panel del docente) ──
CREATE TABLE live_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX live_reactions_session_time ON live_reactions(session_id, created_at DESC);

-- ══════════════════════════════════════
-- RLS
-- ══════════════════════════════════════

ALTER TABLE live_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_reactions  ENABLE ROW LEVEL SECURITY;

-- Curso del estudiante logueado (para no repetir el subquery)
CREATE OR REPLACE FUNCTION auth_student_course_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT course_id FROM students WHERE id = auth_student_id()
$$;

-- Sesiones
CREATE POLICY "Teachers manage own live sessions"
  ON live_sessions FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Students see live sessions of their course"
  ON live_sessions FOR SELECT
  USING (course_id = auth_student_course_id());

-- Actividades
CREATE POLICY "Teachers manage activities of own sessions"
  ON live_activities FOR ALL
  USING (session_id IN (SELECT id FROM live_sessions WHERE teacher_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT id FROM live_sessions WHERE teacher_id = auth.uid()));

CREATE POLICY "Students see activities of their course sessions"
  ON live_activities FOR SELECT
  USING (session_id IN (SELECT id FROM live_sessions WHERE course_id = auth_student_course_id()));

-- Respuestas
CREATE POLICY "Students manage own live responses"
  ON live_responses FOR ALL
  USING (student_id = auth_student_id())
  WITH CHECK (
    student_id = auth_student_id()
    AND session_id IN (SELECT id FROM live_sessions WHERE course_id = auth_student_course_id() AND status = 'live')
  );

CREATE POLICY "Teachers view responses of own sessions"
  ON live_responses FOR SELECT
  USING (session_id IN (SELECT id FROM live_sessions WHERE teacher_id = auth.uid()));

-- Reacciones
CREATE POLICY "Students send own reactions"
  ON live_reactions FOR INSERT
  WITH CHECK (
    student_id = auth_student_id()
    AND session_id IN (SELECT id FROM live_sessions WHERE course_id = auth_student_course_id() AND status = 'live' AND reactions_enabled)
  );

CREATE POLICY "Teachers view reactions of own sessions"
  ON live_reactions FOR SELECT
  USING (session_id IN (SELECT id FROM live_sessions WHERE teacher_id = auth.uid()));

-- ══════════════════════════════════════
-- Resultados agregados (RPC): una sola llamada por poll.
-- El docente ve nombres; el estudiante ve el agregado anónimo.
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION get_live_results(p_activity UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act live_activities;
  ses live_sessions;
  is_teacher BOOLEAN;
  is_student BOOLEAN;
  course_total INT;
  responded INT;
  counts JSONB;
  texts JSONB;
  words JSONB;
BEGIN
  SELECT * INTO act FROM live_activities WHERE id = p_activity;
  IF act.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO ses FROM live_sessions WHERE id = act.session_id;

  is_teacher := (ses.teacher_id = auth.uid());
  is_student := (ses.course_id = auth_student_course_id());
  IF NOT is_teacher AND NOT is_student THEN
    RAISE EXCEPTION 'Sin acceso a esta actividad';
  END IF;

  SELECT count(*) INTO course_total FROM students WHERE course_id = ses.course_id;
  SELECT count(*) INTO responded FROM live_responses WHERE activity_id = p_activity;

  -- Conteo por opción: encuesta/quiz (payload.opcion) + chips (payload.selected[]) + checkin (payload.feeling)
  SELECT COALESCE(jsonb_object_agg(k, n), '{}'::jsonb) INTO counts FROM (
    SELECT payload->>'opcion' AS k, count(*) AS n
    FROM live_responses WHERE activity_id = p_activity AND payload ? 'opcion'
    GROUP BY 1
    UNION ALL
    SELECT payload->>'feeling', count(*)
    FROM live_responses WHERE activity_id = p_activity AND payload ? 'feeling'
    GROUP BY 1
    UNION ALL
    SELECT sel.value, count(*)
    FROM live_responses, jsonb_array_elements_text(payload->'selected') sel
    WHERE activity_id = p_activity AND payload ? 'selected'
    GROUP BY 1
  ) t WHERE k IS NOT NULL;

  -- Textos libres: con nombre solo para el docente
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', CASE WHEN is_teacher THEN s.first_name || ' ' || s.last_name ELSE NULL END,
    'text', left(r.payload->>'texto', 300)
  ) ORDER BY r.updated_at), '[]'::jsonb)
  INTO texts
  FROM live_responses r JOIN students s ON s.id = r.student_id
  WHERE r.activity_id = p_activity AND r.payload ? 'texto' AND trim(r.payload->>'texto') <> '';

  -- Nube de palabras
  SELECT COALESCE(jsonb_agg(jsonb_build_object('word', w, 'n', n) ORDER BY n DESC), '[]'::jsonb)
  INTO words
  FROM (
    SELECT lower(trim(payload->>'palabra')) AS w, count(*) AS n
    FROM live_responses
    WHERE activity_id = p_activity AND payload ? 'palabra' AND trim(payload->>'palabra') <> ''
    GROUP BY 1 ORDER BY n DESC LIMIT 40
  ) t;

  RETURN jsonb_build_object(
    'activityId', act.id,
    'kind', act.kind,
    'status', act.status,
    'courseTotal', course_total,
    'responded', responded,
    'counts', counts,
    'texts', texts,
    'words', words
  );
END $$;

-- ── Podcasts de materiales de estudio ──
ALTER TABLE library_materials ADD COLUMN IF NOT EXISTS podcast_path TEXT;
ALTER TABLE library_materials ADD COLUMN IF NOT EXISTS podcast_status TEXT NOT NULL DEFAULT 'none'
  CHECK (podcast_status IN ('none', 'generating', 'ready', 'error'));
