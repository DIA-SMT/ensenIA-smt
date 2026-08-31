-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 010: Segmento directivo (Fase 2)
--  1) Umbrales de alerta configurables por escuela (saca los números
--     mágicos de adentro de los triggers de 005).
--  2) Ciclo de vida de la alerta: abierta → en seguimiento (con
--     intervención registrada) → cerrada (con resultado). is_read
--     queda como "vista", separado de "atendida".
--  3) Escalamiento: alerta crítica sin intervención pasado el umbral
--     de horas → se marca escalada y se notifica a dirección.
--  4) Abandono silencioso: estudiante que estuvo activo y no deja
--     rastro (huella, entregas, práctica) hace N días → alerta a los
--     docentes del curso. Es la señal que los triggers por-acción de
--     005 no pueden ver: la ausencia de acciones.
--  Programación: pg_cron si está disponible (best effort al final).
-- ═══════════════════════════════════════════════

-- ── 1. Umbrales por escuela ──
-- low_score_pct e inactivity_days también los leen el tablero (Fase 1)
-- y el trigger de bajo desempeño. Una fila por escuela; si no hay fila,
-- get_alert_thresholds() devuelve los defaults.
CREATE TABLE alert_thresholds (
  school_id UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  negative_checkins_count INT NOT NULL DEFAULT 2 CHECK (negative_checkins_count BETWEEN 1 AND 10),
  negative_checkins_days INT NOT NULL DEFAULT 7 CHECK (negative_checkins_days BETWEEN 1 AND 30),
  low_score_pct INT NOT NULL DEFAULT 40 CHECK (low_score_pct BETWEEN 10 AND 90),
  inactivity_days INT NOT NULL DEFAULT 14 CHECK (inactivity_days BETWEEN 3 AND 60),
  escalation_hours INT NOT NULL DEFAULT 72 CHECK (escalation_hours BETWEEN 12 AND 336),
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE alert_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view school thresholds"
  ON alert_thresholds FOR SELECT
  USING (school_id = auth_school_id() AND auth_role() IN ('director', 'docente'));

CREATE POLICY "Directors insert school thresholds"
  ON alert_thresholds FOR INSERT
  WITH CHECK (school_id = auth_school_id() AND auth_role() = 'director');

CREATE POLICY "Directors update school thresholds"
  ON alert_thresholds FOR UPDATE
  USING (school_id = auth_school_id() AND auth_role() = 'director')
  WITH CHECK (school_id = auth_school_id() AND auth_role() = 'director');

-- Umbrales efectivos de una escuela (fila propia o defaults).
CREATE OR REPLACE FUNCTION get_alert_thresholds(p_school_id UUID)
RETURNS alert_thresholds
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r alert_thresholds;
BEGIN
  SELECT * INTO r FROM alert_thresholds WHERE school_id = p_school_id;
  IF NOT FOUND THEN
    r.school_id := p_school_id;
    r.negative_checkins_count := 2;
    r.negative_checkins_days := 7;
    r.low_score_pct := 40;
    r.inactivity_days := 14;
    r.escalation_hours := 72;
  END IF;
  RETURN r;
END;
$$;

-- ── 2. Ciclo de vida de la alerta ──
ALTER TABLE alerts
  ADD COLUMN status TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'en_seguimiento', 'cerrada')),
  ADD COLUMN intervention_note TEXT,
  ADD COLUMN intervention_by UUID REFERENCES profiles(id),
  ADD COLUMN intervention_at TIMESTAMPTZ,
  ADD COLUMN closed_outcome TEXT CHECK (closed_outcome IN ('resuelta', 'derivada', 'sin_cambio')),
  ADD COLUMN closed_at TIMESTAMPTZ,
  ADD COLUMN escalated_at TIMESTAMPTZ;

CREATE INDEX idx_alerts_open ON alerts(school_id, status) WHERE status <> 'cerrada';

-- Backfill: las alertas de celebración no exigen intervención.
UPDATE alerts SET status = 'cerrada', closed_outcome = 'resuelta', closed_at = now()
WHERE type = 'success';

-- Backfill: las alertas viejas YA LEÍDAS se consideran atendidas en el
-- mundo pre-ciclo-de-vida y se cierran, para que la primera corrida del
-- cron no escale en masa historia antigua con el texto "sin intervención
-- registrada" (que era imposible de registrar antes de esta migración).
-- Las viejas NO leídas quedan abiertas a propósito: si nadie las miró en
-- más de 72 h, escalar a dirección es exactamente el comportamiento buscado.
UPDATE alerts SET status = 'cerrada', closed_outcome = 'sin_cambio', closed_at = now()
WHERE status = 'abierta' AND is_read = true AND created_at < now() - interval '7 days';

-- ── 3. Triggers de 005 parametrizados por umbral ──

CREATE OR REPLACE FUNCTION notify_negative_checkins()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  neg_count INT;
  st RECORD;
  t RECORD;
  th alert_thresholds;
  new_alert_id UUID;
BEGIN
  IF NEW.feeling NOT IN ('frustrado', 'confundido') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO st FROM students WHERE id = NEW.student_id;
  IF st IS NULL THEN RETURN NEW; END IF;

  th := get_alert_thresholds(st.school_id);

  SELECT count(*) INTO neg_count
  FROM student_checkins
  WHERE student_id = NEW.student_id
    AND feeling IN ('frustrado', 'confundido')
    AND created_at > now() - make_interval(days => th.negative_checkins_days);

  IF neg_count < th.negative_checkins_count THEN
    RETURN NEW;
  END IF;

  FOR t IN
    SELECT DISTINCT ta.teacher_id
    FROM teacher_assignments ta
    WHERE ta.course_id = st.course_id
  LOOP
    -- dedup: no repetir la misma alerta por docente/estudiante en 3 días
    IF NOT EXISTS (
      SELECT 1 FROM alerts a
      JOIN alert_students als ON als.alert_id = a.id
      WHERE als.student_id = st.id
        AND a.teacher_id = t.teacher_id
        AND a.title = 'Señales emocionales negativas'
        AND a.created_at > now() - interval '3 days'
    ) THEN
      INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
      VALUES (
        'warning', 'academic', 'Señales emocionales negativas',
        st.first_name || ' ' || st.last_name || ' registró ' || neg_count ||
          ' check-ins negativos (confundido/frustrado) en los últimos ' ||
          th.negative_checkins_days || ' días. Puede necesitar acompañamiento.',
        'Hoy', t.teacher_id, st.school_id
      )
      RETURNING id INTO new_alert_id;

      INSERT INTO alert_students (alert_id, student_id) VALUES (new_alert_id, st.id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_low_performance()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act RECORD;
  st RECORD;
  th alert_thresholds;
  pct NUMERIC;
  new_alert_id UUID;
BEGIN
  IF NEW.status <> 'submitted' OR (OLD.status IS NOT DISTINCT FROM 'submitted') THEN
    RETURN NEW;
  END IF;
  IF NEW.auto_score IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO act FROM activities WHERE id = NEW.activity_id;
  IF act IS NULL OR act.points IS NULL OR act.points = 0 THEN
    RETURN NEW;
  END IF;

  th := get_alert_thresholds(act.school_id);

  pct := NEW.auto_score / act.points;
  IF pct > th.low_score_pct / 100.0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO st FROM students WHERE id = NEW.student_id;
  IF st IS NULL THEN RETURN NEW; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM alerts a
    JOIN alert_students als ON als.alert_id = a.id
    WHERE als.student_id = st.id
      AND a.teacher_id = act.teacher_id
      AND a.title = 'Bajo desempeño en actividad'
      AND a.created_at > now() - interval '1 day'
  ) THEN
    INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
    VALUES (
      'danger', 'academic', 'Bajo desempeño en actividad',
      st.first_name || ' ' || st.last_name || ' obtuvo ' || NEW.auto_score || '/' || act.points ||
        ' en "' || act.title || '". Revisá sus respuestas y su huella digital.',
      'Hoy', act.teacher_id, st.school_id
    )
    RETURNING id INTO new_alert_id;

    INSERT INTO alert_students (alert_id, student_id) VALUES (new_alert_id, st.id);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Escalamiento de alertas críticas sin intervención ──
-- Corre por cron (cada hora). Marca escalated_at y notifica a cada
-- director de la escuela. La dirección ya VE todas las alertas por RLS:
-- escalar = ponérsela adelante con una notificación de prioridad alta.
CREATE OR REPLACE FUNCTION escalate_stale_alerts()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  th alert_thresholds;
  escalated INT := 0;
  notified INT;
BEGIN
  FOR a IN
    SELECT * FROM alerts
    WHERE type = 'danger'
      AND status = 'abierta'
      AND escalated_at IS NULL
  LOOP
    th := get_alert_thresholds(a.school_id);
    IF a.created_at < now() - make_interval(hours => th.escalation_hours) THEN
      -- Notificar PRIMERO: si la escuela todavía no tiene director,
      -- no se marca escalated_at y se reintenta en la próxima corrida
      -- (cuando haya director dado de alta, la escalación le llega).
      INSERT INTO notifications (from_user_id, to_user_id, title, message, priority, school_id)
      SELECT
        COALESCE(a.teacher_id, p.id),
        p.id,
        'Alerta escalada a dirección',
        'Sin intervención registrada tras ' || th.escalation_hours || ' h: ' || a.message,
        'high',
        a.school_id
      FROM profiles p
      WHERE p.school_id = a.school_id AND p.role = 'director';

      GET DIAGNOSTICS notified = ROW_COUNT;
      IF notified > 0 THEN
        UPDATE alerts SET escalated_at = now() WHERE id = a.id;
        escalated := escalated + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN escalated;
END;
$$;

-- ── 5. Abandono silencioso ──
-- Corre por cron (diario). Estudiante que ALGUNA VEZ estuvo activo
-- (huella, entregas o práctica) y no deja rastro hace inactivity_days.
-- Quien nunca usó la plataforma no dispara: eso es un problema de
-- onboarding, no de abandono, y generaría puro ruido el primer mes.
CREATE OR REPLACE FUNCTION detect_silent_students()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st RECORD;
  t RECORD;
  th alert_thresholds;
  created INT := 0;
  new_alert_id UUID;
  dias INT;
  encontro_docente BOOLEAN := false;
BEGIN
  FOR st IN
    SELECT
      s.id, s.first_name, s.last_name, s.course_id, s.school_id,
      GREATEST(ev.m, su.m, pr.m) AS last_seen
    FROM students s
    LEFT JOIN LATERAL (
      SELECT max(created_at) AS m FROM activity_events e WHERE e.student_id = s.id
    ) ev ON true
    LEFT JOIN LATERAL (
      SELECT max(updated_at) AS m FROM activity_submissions sub WHERE sub.student_id = s.id
    ) su ON true
    LEFT JOIN LATERAL (
      SELECT max(created_at) AS m FROM practice_attempts pa WHERE pa.student_id = s.id
    ) pr ON true
  LOOP
    IF st.last_seen IS NULL THEN CONTINUE; END IF;

    th := get_alert_thresholds(st.school_id);
    IF st.last_seen >= now() - make_interval(days => th.inactivity_days) THEN
      CONTINUE;
    END IF;

    dias := EXTRACT(day FROM now() - st.last_seen)::int;

    FOR t IN
      SELECT DISTINCT ta.teacher_id
      FROM teacher_assignments ta
      WHERE ta.course_id = st.course_id
    LOOP
      -- dedup: no crear otra si hay una abierta, o una cerrada hace menos
      -- de 7 días (cooldown POST-CIERRE: anclado a closed_at, no a
      -- created_at — si no, cerrar una alerta vieja la recrearía mañana).
      IF NOT EXISTS (
        SELECT 1 FROM alerts a
        JOIN alert_students als ON als.alert_id = a.id
        WHERE als.student_id = st.id
          AND a.teacher_id = t.teacher_id
          AND a.title = 'Posible abandono silencioso'
          AND (a.status <> 'cerrada' OR a.closed_at > now() - interval '7 days')
      ) THEN
        INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
        VALUES (
          'danger', 'attendance', 'Posible abandono silencioso',
          st.first_name || ' ' || st.last_name || ' no registra actividad en la plataforma hace ' ||
            dias || ' días (sin entregas, sin práctica, sin huella digital). ' ||
            'Vale la pena un contacto directo con la familia.',
          'Hoy', t.teacher_id, st.school_id
        )
        RETURNING id INTO new_alert_id;

        INSERT INTO alert_students (alert_id, student_id) VALUES (new_alert_id, st.id);
        created := created + 1;
      END IF;
      encontro_docente := true;
    END LOOP;

    -- Curso sin docentes asignados: sin este respaldo el estudiante
    -- silencioso sería invisible. La alerta huérfana (teacher_id NULL)
    -- la ve dirección por la RLS de escuela.
    IF NOT encontro_docente THEN
      IF NOT EXISTS (
        SELECT 1 FROM alerts a
        JOIN alert_students als ON als.alert_id = a.id
        WHERE als.student_id = st.id
          AND a.teacher_id IS NULL
          AND a.title = 'Posible abandono silencioso'
          AND (a.status <> 'cerrada' OR a.closed_at > now() - interval '7 days')
      ) THEN
        INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
        VALUES (
          'danger', 'attendance', 'Posible abandono silencioso',
          st.first_name || ' ' || st.last_name || ' no registra actividad hace ' || dias ||
            ' días y su curso no tiene docentes asignados: requiere intervención de dirección.',
          'Hoy', NULL, st.school_id
        )
        RETURNING id INTO new_alert_id;

        INSERT INTO alert_students (alert_id, student_id) VALUES (new_alert_id, st.id);
        created := created + 1;
      END IF;
    END IF;
    encontro_docente := false;
  END LOOP;
  RETURN created;
END;
$$;

-- ── 6. Endurecer el UPDATE de alerts ──
-- Las policies de 001 no tenían WITH CHECK: un docente podía reescribir
-- el mensaje de su alerta o moverla de escuela (spoofing hacia el parte
-- del director ajeno). Además, con el ciclo de vida el cliente solo
-- necesita tocar columnas de estado: grants por columna para que
-- message/title/school_id/teacher_id/type sean inmutables desde la API.

DROP POLICY IF EXISTS "Directors can update alerts" ON alerts;
CREATE POLICY "Directors can update alerts"
  ON alerts FOR UPDATE
  USING (school_id = auth_school_id() AND auth_role() = 'director')
  WITH CHECK (school_id = auth_school_id());

DROP POLICY IF EXISTS "Teachers can update their own alerts" ON alerts;
CREATE POLICY "Teachers can update their own alerts"
  ON alerts FOR UPDATE
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid() AND school_id = auth_school_id());

-- intervention_by/intervention_at NO están en el GRANT: la autoría y la
-- fecha de la intervención las sella exclusivamente el trigger — el
-- cliente no puede mandarlas ni falsificarlas.
REVOKE UPDATE ON alerts FROM anon, authenticated;
GRANT UPDATE (is_read, status, intervention_note, closed_outcome, closed_at)
  ON alerts TO authenticated;

-- La autoría de la intervención la sella el servidor: si cambia la nota
-- en una sesión de usuario, intervention_by/at son SIEMPRE quién y cuándo.
-- (Los jobs de cron corren sin JWT: auth.uid() es NULL y no pisan nada.)
CREATE OR REPLACE FUNCTION stamp_alert_intervention()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.intervention_note IS DISTINCT FROM OLD.intervention_note AND auth.uid() IS NOT NULL THEN
    NEW.intervention_by := auth.uid();
    NEW.intervention_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alerts_stamp_intervention ON alerts;
CREATE TRIGGER trg_alerts_stamp_intervention
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION stamp_alert_intervention();

-- Mismo criterio para los umbrales: updated_by/updated_at los sella el
-- servidor, no el cliente.
CREATE OR REPLACE FUNCTION stamp_threshold_author()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_thresholds_stamp_author ON alert_thresholds;
CREATE TRIGGER trg_thresholds_stamp_author
  BEFORE INSERT OR UPDATE ON alert_thresholds
  FOR EACH ROW EXECUTE FUNCTION stamp_threshold_author();

-- ── 7. Cerrar el RPC de PostgREST sobre las funciones internas ──
-- Sin esto, cualquier usuario (incluso anon) puede invocarlas vía
-- /rest/v1/rpc/: disparar los jobs a voluntad o leer umbrales de
-- cualquier escuela por id. Solo las ejecutan pg_cron (postgres) y
-- los triggers SECURITY DEFINER (que evalúan como su owner).
REVOKE EXECUTE ON FUNCTION escalate_stale_alerts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION detect_silent_students() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_alert_thresholds(UUID) FROM PUBLIC, anon, authenticated;

-- ── 7. Programación (best effort) ──
-- Horarios en UTC: 10:00 UTC = 07:00 en Argentina.
-- Si pg_cron no está disponible en el proyecto, la migración avisa y
-- las funciones quedan listas para invocarse manualmente o por otro
-- scheduler (p. ej. una edge function con cron de Supabase).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('ensenia-escalate-alerts', '0 * * * *', 'SELECT escalate_stale_alerts()');
  PERFORM cron.schedule('ensenia-detect-silent-students', '0 10 * * *', 'SELECT detect_silent_students()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible (%). Programar escalate_stale_alerts() y detect_silent_students() con otro scheduler.', SQLERRM;
END;
$$;
