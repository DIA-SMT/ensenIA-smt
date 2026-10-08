-- ═══════════════════════════════════════════════════════════════════
-- 051 — Avisos entre personas
--
-- Hasta acá las alertas las creaba solo el sistema y nadie le podía avisar
-- nada a nadie: la app le decía al docente "derivá a dirección" sin darle
-- cómo, y la casilla del alumno "Me gustaría hablar con un docente" no le
-- llegaba a ningún docente (solo pintaba un semáforo).
--
--  1. El docente le avisa a dirección: desde una alerta suya
--     (avisar_a_direccion) o desde la ficha de un alumno que tiene a cargo
--     (avisar_a_direccion_por_alumno). La alerta queda "escalada" con el
--     motivo y quién la mandó, y a cada directivo le llega a la campanita.
--     Es el mismo "escalada" que ya ponía el cron a las 72 h.
--  2. El alumno pide hablar con un docente (pedir_hablar_con_docente): a
--     uno de sus docentes o a todos los del curso. Le llega a cada uno como
--     alerta "Quiere hablar con vos". La casilla del check-in hace lo mismo.
--  3. Comunicados de dirección: la bandeja del docente usa las tablas que
--     ya existían. Quién ve cada comunicado lo decide la 059 (por audiencia:
--     docentes, estudiantes, curso).
--
-- Se puede correr antes o después de la 059 y la 060 sin pisarlas: no toca
-- la regla de comunicados (es de la 059) y no reemplaza la versión de
-- pedir_hablar_con_docente de la 060 (que además abre la conversación en
-- Mensajes y usa pedido_hablar, de acá).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Docente → dirección ──
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS escalated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_reason TEXT;

-- Los directivos de una escuela (por membresía, 039)
CREATE OR REPLACE FUNCTION directivos_de(p_school UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM school_memberships WHERE school_id = p_school AND role = 'director'
$$;
REVOKE EXECUTE ON FUNCTION directivos_de(UUID) FROM PUBLIC, anon, authenticated;

-- La campanita de cada directivo
CREATE OR REPLACE FUNCTION notificar_a_direccion(p_school UUID, p_desde UUID, p_titulo TEXT, p_mensaje TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  INSERT INTO notifications (from_user_id, to_user_id, title, message, priority, school_id)
  SELECT p_desde, d, p_titulo, p_mensaje, 'high', p_school
  FROM directivos_de(p_school) AS d;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION notificar_a_direccion(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nombre_de(p_user UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT trim(first_name || ' ' || last_name) FROM profiles WHERE id = p_user
$$;
REVOKE EXECUTE ON FUNCTION nombre_de(UUID) FROM PUBLIC, anon, authenticated;

-- Desde una alerta suya
CREATE OR REPLACE FUNCTION avisar_a_direccion(p_alert UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a alerts%ROWTYPE;
  v_motivo TEXT := trim(COALESCE(p_motivo, ''));
  v_alumno TEXT;
BEGIN
  IF length(v_motivo) = 0 OR length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Contale a dirección por qué (hasta 1000 letras)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM alerts WHERE id = p_alert;
  IF NOT FOUND OR a.teacher_id IS DISTINCT FROM auth.uid() OR a.school_id IS DISTINCT FROM auth_school_id() THEN
    RAISE EXCEPTION 'Esa alerta no es tuya' USING ERRCODE = '42501';
  END IF;
  IF a.status = 'cerrada' THEN
    RAISE EXCEPTION 'La alerta ya está cerrada' USING ERRCODE = '22023';
  END IF;

  UPDATE alerts SET escalated_at = now(), escalated_by = auth.uid(), escalation_reason = v_motivo
  WHERE id = p_alert;

  SELECT string_agg(s.first_name || ' ' || s.last_name, ', ') INTO v_alumno
  FROM alert_students als JOIN students s ON s.id = als.student_id WHERE als.alert_id = p_alert;

  PERFORM notificar_a_direccion(
    a.school_id, auth.uid(),
    'Aviso de ' || COALESCE(nombre_de(auth.uid()), 'un docente') || COALESCE(' sobre ' || v_alumno, ''),
    a.title || ': ' || v_motivo
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION avisar_a_direccion(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION avisar_a_direccion(UUID, TEXT) TO authenticated;

-- Desde la ficha de un alumno que tiene a cargo (sin alerta previa)
CREATE OR REPLACE FUNCTION avisar_a_direccion_por_alumno(p_student UUID, p_tema TEXT, p_motivo TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st students%ROWTYPE;
  v_motivo TEXT := trim(COALESCE(p_motivo, ''));
  v_titulo TEXT;
  v_categoria alert_category;
  v_id UUID;
BEGIN
  IF length(v_motivo) = 0 OR length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Contale a dirección por qué (hasta 1000 letras)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO st FROM students WHERE id = p_student;
  IF NOT FOUND OR st.school_id IS DISTINCT FROM auth_school_id() OR NOT teaches_student(p_student) THEN
    RAISE EXCEPTION 'Ese alumno no lo tenés a cargo' USING ERRCODE = '42501';
  END IF;

  v_titulo := CASE p_tema
    WHEN 'convivencia' THEN 'Aviso a dirección: convivencia'
    WHEN 'bienestar' THEN 'Aviso a dirección: bienestar'
    WHEN 'aprendizaje' THEN 'Aviso a dirección: aprendizaje'
    WHEN 'asistencia' THEN 'Aviso a dirección: asistencia'
    WHEN 'familia' THEN 'Aviso a dirección: familia'
    ELSE 'Aviso a dirección'
  END;
  v_categoria := CASE p_tema
    WHEN 'convivencia' THEN 'conduct'::alert_category
    WHEN 'asistencia' THEN 'attendance'::alert_category
    WHEN 'aprendizaje' THEN 'academic'::alert_category
    ELSE 'system'::alert_category
  END;

  INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id,
                      escalated_at, escalated_by, escalation_reason)
  VALUES ('warning', v_categoria, v_titulo,
          st.first_name || ' ' || st.last_name || ': ' || v_motivo,
          'Hoy', auth.uid(), st.school_id, now(), auth.uid(), v_motivo)
  RETURNING id INTO v_id;
  INSERT INTO alert_students (alert_id, student_id) VALUES (v_id, p_student);

  PERFORM notificar_a_direccion(
    st.school_id, auth.uid(),
    'Aviso de ' || COALESCE(nombre_de(auth.uid()), 'un docente') || ' sobre ' || st.first_name || ' ' || st.last_name,
    v_motivo
  );
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION avisar_a_direccion_por_alumno(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION avisar_a_direccion_por_alumno(UUID, TEXT, TEXT) TO authenticated;

-- ── 2. Alumno → docente ──
-- A un docente del curso (p_teacher) o, sin elegir, a todos los del curso.
-- No repite el pedido al mismo docente si ya tiene uno abierto de las
-- últimas 24 h: le suma lo nuevo a ese.
CREATE OR REPLACE FUNCTION pedido_hablar(p_student UUID, p_teacher UUID, p_motivo TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st students%ROWTYPE;
  t RECORD;
  v_motivo TEXT := NULLIF(left(trim(COALESCE(p_motivo, '')), 500), '');
  v_mensaje TEXT;
  v_previa UUID;
  v_id UUID;
  creadas INT := 0;
BEGIN
  SELECT * INTO st FROM students WHERE id = p_student;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_mensaje := st.first_name || ' ' || st.last_name || ' pidió hablar con vos.'
    || COALESCE(' Dijo: "' || v_motivo || '"', '');

  FOR t IN
    SELECT DISTINCT ta.teacher_id
    FROM teacher_assignments ta
    WHERE ta.course_id = st.course_id
      AND (p_teacher IS NULL OR ta.teacher_id = p_teacher)
  LOOP
    SELECT a.id INTO v_previa
    FROM alerts a JOIN alert_students als ON als.alert_id = a.id
    WHERE als.student_id = st.id AND a.teacher_id = t.teacher_id
      AND a.title = 'Quiere hablar con vos' AND a.status <> 'cerrada'
      AND a.created_at > now() - interval '24 hours'
    LIMIT 1;

    IF v_previa IS NOT NULL THEN
      IF v_motivo IS NOT NULL THEN
        UPDATE alerts SET message = message || ' · Después: "' || v_motivo || '"', is_read = false
        WHERE id = v_previa;
      END IF;
    ELSE
      INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
      VALUES ('warning', 'system', 'Quiere hablar con vos', v_mensaje, 'Hoy', t.teacher_id, st.school_id)
      RETURNING id INTO v_id;
      INSERT INTO alert_students (alert_id, student_id) VALUES (v_id, st.id);
      creadas := creadas + 1;
    END IF;
  END LOOP;
  RETURN creadas;
END;
$$;
REVOKE EXECUTE ON FUNCTION pedido_hablar(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Lo que llama el alumno desde la app. Solo si todavía no existe: la 060
-- (mensajería) la reemplaza por una que además abre la conversación, y
-- correr esta migración después no tiene que volver a la versión de acá.
DO $crear$
BEGIN
  IF to_regprocedure('public.pedir_hablar_con_docente(uuid,text)') IS NULL THEN
    EXECUTE $f$
CREATE FUNCTION pedir_hablar_con_docente(p_teacher UUID, p_motivo TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $cuerpo$
DECLARE
  v_student UUID := auth_student_id();
  v_curso UUID;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Solo un estudiante puede pedir hablar con un docente' USING ERRCODE = '42501';
  END IF;
  SELECT course_id INTO v_curso FROM students WHERE id = v_student;
  IF p_teacher IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM teacher_assignments WHERE teacher_id = p_teacher AND course_id = v_curso
  ) THEN
    RAISE EXCEPTION 'Ese docente no es de tu curso' USING ERRCODE = '42501';
  END IF;
  RETURN pedido_hablar(v_student, p_teacher, p_motivo);
END;
$cuerpo$;
    $f$;
  END IF;
END
$crear$;
REVOKE EXECUTE ON FUNCTION pedir_hablar_con_docente(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pedir_hablar_con_docente(UUID, TEXT) TO authenticated;

-- Docentes del curso del alumno, para elegir a quién (nombre y materia)
CREATE OR REPLACE FUNCTION mis_docentes()
RETURNS TABLE (teacher_id UUID, nombre TEXT, materias TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ta.teacher_id, nombre_de(ta.teacher_id), string_agg(DISTINCT sb.name, ', ')
  FROM teacher_assignments ta
  JOIN subjects sb ON sb.id = ta.subject_id
  WHERE ta.course_id = (SELECT course_id FROM students WHERE id = auth_student_id())
  GROUP BY ta.teacher_id
  ORDER BY 2
$$;
REVOKE EXECUTE ON FUNCTION mis_docentes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mis_docentes() TO authenticated;

-- La casilla del check-in "Me gustaría hablar con un docente" ahora avisa:
-- al docente de esa actividad si el check-in es de una, o a los del curso
CREATE OR REPLACE FUNCTION checkin_quiere_hablar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_docente UUID;
BEGIN
  IF NOT NEW.wants_to_talk THEN RETURN NEW; END IF;
  IF NEW.activity_id IS NOT NULL THEN
    SELECT teacher_id INTO v_docente FROM activities WHERE id = NEW.activity_id;
  END IF;
  PERFORM pedido_hablar(NEW.student_id, v_docente, NEW.comment);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checkin_quiere_hablar ON student_checkins;
CREATE TRIGGER trg_checkin_quiere_hablar
  AFTER INSERT ON student_checkins
  FOR EACH ROW EXECUTE FUNCTION checkin_quiere_hablar();

-- Comprobación: una fila, las tres en true
SELECT
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'avisar_a_direccion_por_alumno') AS docente_a_direccion,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pedir_hablar_con_docente') AS alumno_a_docente,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_checkin_quiere_hablar') AS checkin_avisa;
