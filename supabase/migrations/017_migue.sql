-- ════════════════════════════════════════════════════════════════════
--  SMT EstudIA — 017: Migue
--
--  Pedido de las escuelas (26/8): "Migue con información de protocolos y
--  normativas" y "alerta emocional de Migue".
--
--  Migue tiene tres caras, y son tres caras de verdad: cambia a quién le
--  habla, qué sabe y qué hace con lo que escucha.
--   · equipo     — docentes y dirección; responde citando la normativa
--                  publicada (015/016), con la RLS de quien pregunta.
--   · estudiante — acompaña el estudio y escucha; si detecta que un chico
--                  la está pasando mal, deja una señal para la escuela.
--   · familia    — orienta a tutores sobre el acompañamiento y las normas
--                  que la escuela marcó para la comunidad.
--
--  Historial en tablas propias, no en las del laboratorio docente: Migue
--  lo usan cuatro roles y las de chat_* están atadas a "teacher_id".
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE migue_audience AS ENUM ('equipo', 'estudiante', 'familia');

CREATE TABLE migue_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  audience migue_audience NOT NULL,
  title TEXT NOT NULL DEFAULT 'Conversación con Migue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_migue_sessions_user ON migue_sessions(user_id, updated_at DESC);

CREATE TABLE migue_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES migue_sessions(id) ON DELETE CASCADE,
  role chat_role NOT NULL,
  content TEXT NOT NULL,
  -- Normas que Migue usó para responder: la respuesta queda auditable.
  cited_policy_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_migue_messages_session ON migue_messages(session_id, created_at);

ALTER TABLE migue_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE migue_messages ENABLE ROW LEVEL SECURITY;

-- Cada uno con su propia conversación. Nadie más, tampoco dirección:
-- lo que un chico le cuenta a Migue no es material de consulta; lo que
-- la escuela necesita saber viaja por wellbeing_signals, más abajo.
CREATE POLICY "Users manage their own Migue sessions"
  ON migue_sessions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND school_id = auth_school_id());

-- Atado por EXISTS sobre la propiedad de la sesión, no heredando de su
-- SELECT: la lección de la 013 es que heredar escritura de lectura abre
-- puertas que nadie ve.
CREATE POLICY "Users read messages of their own sessions"
  ON migue_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM migue_sessions s
            WHERE s.id = migue_messages.session_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Users write messages in their own sessions"
  ON migue_messages FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM migue_sessions s
            WHERE s.id = migue_messages.session_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Users delete messages of their own sessions"
  ON migue_messages FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM migue_sessions s
            WHERE s.id = migue_messages.session_id AND s.user_id = auth.uid())
  );

-- ── Alerta emocional ──
-- Lo que Migue deja para la escuela cuando un estudiante dice algo que
-- preocupa. NO es la conversación: es una señal con el motivo y, si hace
-- falta, la frase que la disparó. El estudiante SIEMPRE se entera de que
-- se compartió — eso lo garantiza la interfaz y el prompt, acá queda el
-- registro.

CREATE TYPE wellbeing_level AS ENUM ('seguimiento', 'urgente');
CREATE TYPE wellbeing_status AS ENUM ('abierta', 'en_seguimiento', 'cerrada');

CREATE TABLE wellbeing_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  level wellbeing_level NOT NULL,
  reason TEXT NOT NULL,
  excerpt TEXT,
  status wellbeing_status NOT NULL DEFAULT 'abierta',
  handled_by UUID REFERENCES profiles(id),
  handled_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wellbeing_school_status
  ON wellbeing_signals(school_id, status, created_at DESC);
CREATE INDEX idx_wellbeing_student ON wellbeing_signals(student_id, created_at DESC);

ALTER TABLE wellbeing_signals ENABLE ROW LEVEL SECURITY;

-- Dirección ve y gestiona las de su escuela.
CREATE POLICY "Directors manage wellbeing signals"
  ON wellbeing_signals FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

CREATE POLICY "Directors update wellbeing signals"
  ON wellbeing_signals FOR UPDATE
  USING (auth_role() = 'director' AND school_id = auth_school_id())
  WITH CHECK (auth_role() = 'director' AND school_id = auth_school_id());

-- El docente solo las de los estudiantes que efectivamente tiene en clase.
CREATE POLICY "Teachers see signals of their students"
  ON wellbeing_signals FOR SELECT
  USING (
    auth_role() = 'docente'
    AND EXISTS (
      SELECT 1 FROM enrollments e
      JOIN teacher_assignments ta
        ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE e.student_id = wellbeing_signals.student_id
        AND ta.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers update signals of their students"
  ON wellbeing_signals FOR UPDATE
  USING (
    auth_role() = 'docente'
    AND EXISTS (
      SELECT 1 FROM enrollments e
      JOIN teacher_assignments ta
        ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE e.student_id = wellbeing_signals.student_id
        AND ta.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    auth_role() = 'docente'
    AND EXISTS (
      SELECT 1 FROM enrollments e
      JOIN teacher_assignments ta
        ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE e.student_id = wellbeing_signals.student_id
        AND ta.teacher_id = auth.uid()
    )
  );

-- El estudiante puede ver las suyas: se le avisa que se compartió, y
-- ocultárselas después sería incoherente con habérselo dicho.
CREATE POLICY "Students see their own signals"
  ON wellbeing_signals FOR SELECT
  USING (student_id = auth_student_id());

-- Nadie inserta desde el cliente: solo la Edge Function con service role.
REVOKE INSERT ON wellbeing_signals FROM anon, authenticated;
REVOKE UPDATE ON wellbeing_signals FROM anon, authenticated;
GRANT UPDATE (status, note) ON wellbeing_signals TO authenticated;

-- Quien cierra o toma una señal queda registrado por el servidor.
CREATE OR REPLACE FUNCTION stamp_wellbeing_signal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.handled_by := auth.uid();
    NEW.handled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wellbeing_stamp
  BEFORE UPDATE ON wellbeing_signals
  FOR EACH ROW EXECUTE FUNCTION stamp_wellbeing_signal();
