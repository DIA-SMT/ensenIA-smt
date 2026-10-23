-- ═══════════════════════════════════════════════════════════════════
-- 066 — Seguimiento del docente: consultas atadas a cada actividad y
--       aclaraciones para todo el curso
--
-- Fase 4 del recorrido del docente: en un panel aparte, ver la actividad de
-- sus estudiantes, dar devoluciones y resolver consultas.
--
--  · Consultas: el estudiante pregunta desde la actividad. Es una
--    conversación de la mensajería (060) con la actividad anotada: sigue
--    sus reglas (nunca privada: la dirección la puede leer; los mensajes no
--    se editan ni se borran; solo con quien le da esa materia en su curso) y
--    aparece en la misma bandeja. Una por estudiante y actividad: si vuelve
--    a preguntar, se suma a la misma charla.
--  · Aclaraciones: lo que el docente publica en la actividad para todo el
--    curso (por ejemplo, la respuesta a una consulta que le sirve a todos).
--    Las escribe el docente; no muestran quién preguntó. Como los mensajes,
--    no se editan ni se borran: se retiran, y la dirección las sigue viendo.
--  · seguimiento_curso: lo que ve el panel, en un solo pedido (GET, así el
--    service worker lo guarda y se ve sin señal). Corre con los permisos de
--    quien llama: un docente ve solo sus actividades y sus estudiantes.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. La conversación sabe de qué actividad es ──

ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conv_actividad_idx ON conversaciones (activity_id) WHERE activity_id IS NOT NULL;

ALTER TABLE conversaciones DROP CONSTRAINT IF EXISTS conversaciones_origen_check;
ALTER TABLE conversaciones ADD CONSTRAINT conversaciones_origen_check
  CHECK (origen IN ('mensaje', 'comunicado', 'citacion', 'pedido_hablar', 'aviso_direccion', 'consulta'));

-- El resumen de la bandeja (060) con la actividad: la bandeja la muestra y
-- la actividad encuentra su consulta. Mismo cuerpo que la 060 más dos campos.
CREATE OR REPLACE FUNCTION _resumen_conversacion(p_conv UUID, p_me UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'asunto', c.asunto,
    'origen', c.origen,
    'conEstudiante', c.con_estudiante,
    'ultimoMensajeAt', c.ultimo_mensaje_at,
    'archivada', coalesce(me.archivada, false),
    'soyParticipante', me.user_id IS NOT NULL,
    'sinLeer', me.user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM mensajes m WHERE m.conversacion_id = c.id
        AND m.created_at > coalesce(me.leido_hasta, '-infinity') AND m.autor_id IS DISTINCT FROM p_me),
    'ultimo', (SELECT jsonb_build_object('autor', coalesce(nombre_de(m.autor_id), '—'), 'cuerpo', left(m.cuerpo, 140))
               FROM mensajes m WHERE m.conversacion_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    'participantes', (SELECT jsonb_agg(jsonb_build_object(
                        'id', p.user_id, 'nombre', coalesce(nombre_de(p.user_id), '—'),
                        'rol', rol_en_escuela(p.user_id, c.school_id)) ORDER BY nombre_de(p.user_id))
                      FROM conversacion_participantes p WHERE p.conversacion_id = c.id),
    'activityId', c.activity_id,
    'actividad', (SELECT a.title FROM activities a WHERE a.id = c.activity_id)
  )
  FROM conversaciones c
  LEFT JOIN conversacion_participantes me ON me.conversacion_id = c.id AND me.user_id = p_me
  WHERE c.id = p_conv
$$;
REVOKE EXECUTE ON FUNCTION _resumen_conversacion(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── 2. El estudiante consulta desde la actividad ──

-- Las consultas que ya llegaron, por el id que elige el celular. Con señal
-- floja el pedido puede llegar y la respuesta perderse: el celular la
-- reintenta y, como los mensajes no se borran, quedaría repetida para
-- siempre. Solo la usa consultar_actividad (nadie la lee ni la escribe).
CREATE TABLE IF NOT EXISTS consultas_recibidas (
  id              UUID PRIMARY KEY,
  conversacion_id UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  autor_id        UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE consultas_recibidas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON consultas_recibidas FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS consultar_actividad(UUID, TEXT);
CREATE OR REPLACE FUNCTION consultar_actividad(p_activity UUID, p_texto TEXT, p_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_texto TEXT := trim(coalesce(p_texto, ''));
  a RECORD;
  v_conv UUID;
BEGIN
  IF v_me IS NULL OR auth_student_id() IS NULL THEN
    RAISE EXCEPTION 'Las consultas sobre una actividad las hace el estudiante.' USING ERRCODE = '42501';
  END IF;
  IF v_texto = '' OR char_length(v_texto) > 2000 THEN
    RAISE EXCEPTION 'Escribí tu consulta (hasta 2000 letras).' USING ERRCODE = '22023';
  END IF;
  -- Solo sobre lo que tiene publicado en sus materias (misma regla que
  -- entregar: 018)
  IF NOT coalesce(student_can_see_activity(p_activity), false) THEN
    RAISE EXCEPTION 'Esa actividad no está publicada para vos.' USING ERRCODE = '42501';
  END IF;

  SELECT id, teacher_id, school_id, title, subject_id, course_id INTO a FROM activities WHERE id = p_activity;
  -- Le llega a quien la publicó solo si sigue dando esa materia en ese curso
  -- (si no, la vería alguien que ya no está y no quien está ahora)
  IF a.teacher_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM teacher_assignments ta
                    WHERE ta.teacher_id = a.teacher_id AND ta.subject_id = a.subject_id AND ta.course_id = a.course_id)
     OR NOT coalesce(pueden_hablar(v_me, a.teacher_id, a.school_id), false) THEN
    RAISE EXCEPTION 'Quien publicó esta actividad ya no da esta materia en tu curso: escribile a tu docente desde Mensajes.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Una charla por estudiante y actividad: dos consultas a la vez no abren
  -- dos (y el mismo reintento espera acá al primero)
  PERFORM pg_advisory_xact_lock(hashtext('consulta|' || v_me::text || '|' || p_activity::text));

  -- ¿Ya llegó? Devolver la charla sin escribir otra vez
  IF p_id IS NOT NULL THEN
    SELECT r.conversacion_id INTO v_conv FROM consultas_recibidas r WHERE r.id = p_id AND r.autor_id = v_me;
    IF v_conv IS NOT NULL THEN
      RETURN v_conv;
    END IF;
  END IF;

  -- Un tope: cada consulta le prende el aviso al docente
  IF (SELECT count(*) FROM mensajes m JOIN conversaciones c ON c.id = m.conversacion_id
      WHERE m.autor_id = v_me AND c.origen = 'consulta' AND m.created_at > now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Mandaste muchas consultas seguidas. Esperá unos minutos y probá de nuevo.' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.id INTO v_conv
  FROM conversaciones c
  WHERE c.activity_id = p_activity AND c.origen = 'consulta'
    AND EXISTS (SELECT 1 FROM conversacion_participantes p WHERE p.conversacion_id = c.id AND p.user_id = v_me)
    AND EXISTS (SELECT 1 FROM conversacion_participantes p WHERE p.conversacion_id = c.id AND p.user_id = a.teacher_id)
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_conv IS NOT NULL THEN
    INSERT INTO mensajes (conversacion_id, autor_id, cuerpo) VALUES (v_conv, v_me, v_texto);
  ELSE
    v_conv := _abrir_conversacion(a.school_id, v_me, ARRAY[a.teacher_id], 'Consulta: ' || a.title, v_texto, 'consulta');
    -- Con un estudiante adentro nunca es privada: la dirección la supervisa
    -- aunque su membresía en la escuela esté mal cargada (060)
    UPDATE conversaciones SET activity_id = p_activity, con_estudiante = true WHERE id = v_conv;
  END IF;

  IF p_id IS NOT NULL THEN
    INSERT INTO consultas_recibidas (id, conversacion_id, autor_id) VALUES (p_id, v_conv, v_me);
  END IF;
  RETURN v_conv;
END;
$$;

REVOKE EXECUTE ON FUNCTION consultar_actividad(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consultar_actividad(UUID, TEXT, UUID) TO authenticated;

-- Qué consultas esperan respuesta del docente, por materia y curso (para
-- Hoy y para que el panel abra en el curso que tiene consultas). Sin
-- responder = el último mensaje es de otro (el estudiante) y no la archivó.
-- Las mismas actividades que seguimiento_curso (de este año, no borradores,
-- de un curso que sigue dando), para que Hoy no cuente lo que el panel no
-- muestra. (Un mensaje nuevo la desarchiva: 060.)
DROP FUNCTION IF EXISTS consultas_sin_responder();
CREATE FUNCTION consultas_sin_responder()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('subjectId', x.subject_id, 'courseId', x.course_id, 'cantidad', x.n)), '[]'::jsonb)
  FROM (
    SELECT a.subject_id, a.course_id, count(*)::INT AS n
    FROM conversaciones c
    JOIN conversacion_participantes p ON p.conversacion_id = c.id AND p.user_id = auth.uid()
    JOIN activities a ON a.id = c.activity_id AND a.teacher_id = auth.uid()
      AND a.status <> 'draft' AND coalesce(a.published_at, a.created_at) >= date_trunc('year', now())
    WHERE c.origen = 'consulta' AND NOT p.archivada AND c.school_id = auth_school_id()
      AND EXISTS (SELECT 1 FROM teacher_assignments ta
                  WHERE ta.teacher_id = auth.uid() AND ta.subject_id = a.subject_id AND ta.course_id = a.course_id)
      AND (SELECT m.autor_id FROM mensajes m WHERE m.conversacion_id = c.id ORDER BY m.created_at DESC LIMIT 1)
          IS DISTINCT FROM auth.uid()
    GROUP BY a.subject_id, a.course_id
  ) x
$$;

REVOKE EXECUTE ON FUNCTION consultas_sin_responder() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consultas_sin_responder() TO authenticated;

-- ── 3. Aclaraciones para todo el curso ──
-- Es el docente hablándole a un curso de menores: como los mensajes (060),
-- quedan como se escribieron. No se editan ni se borran: se retiran (los
-- estudiantes dejan de verlas) y la dirección las sigue viendo, también si
-- después se borra la actividad.

CREATE TABLE IF NOT EXISTS aclaraciones_actividad (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  autor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  texto       TEXT NOT NULL CHECK (char_length(trim(texto)) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  retirada_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS aclaraciones_actividad_idx ON aclaraciones_actividad (activity_id, created_at);
CREATE INDEX IF NOT EXISTS aclaraciones_escuela_idx ON aclaraciones_actividad (school_id, created_at);

ALTER TABLE aclaraciones_actividad ENABLE ROW LEVEL SECURITY;
-- Nadie borra (ni vacía la tabla); los anónimos, nada
REVOKE ALL ON aclaraciones_actividad FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON aclaraciones_actividad FROM PUBLIC, authenticated;

DROP POLICY IF EXISTS "Teacher manages clarifications of own activities" ON aclaraciones_actividad;
DROP POLICY IF EXISTS "Teacher reads clarifications of own activities" ON aclaraciones_actividad;
CREATE POLICY "Teacher reads clarifications of own activities"
  ON aclaraciones_actividad FOR SELECT
  USING (EXISTS (SELECT 1 FROM activities a WHERE a.id = aclaraciones_actividad.activity_id AND a.teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Teacher publishes clarifications" ON aclaraciones_actividad;
CREATE POLICY "Teacher publishes clarifications"
  ON aclaraciones_actividad FOR INSERT
  WITH CHECK (
    autor_id = auth.uid()
    AND EXISTS (SELECT 1 FROM activities a WHERE a.id = aclaraciones_actividad.activity_id AND a.teacher_id = auth.uid())
  );

-- Solo para retirarla: el trigger no deja cambiar nada más
DROP POLICY IF EXISTS "Teacher withdraws clarifications" ON aclaraciones_actividad;
CREATE POLICY "Teacher withdraws clarifications"
  ON aclaraciones_actividad FOR UPDATE
  USING (EXISTS (SELECT 1 FROM activities a WHERE a.id = aclaraciones_actividad.activity_id AND a.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM activities a WHERE a.id = aclaraciones_actividad.activity_id AND a.teacher_id = auth.uid()));

-- El estudiante, las vigentes de las actividades que tiene publicadas
DROP POLICY IF EXISTS "Students read clarifications of visible activities" ON aclaraciones_actividad;
CREATE POLICY "Students read clarifications of visible activities"
  ON aclaraciones_actividad FOR SELECT
  USING (retirada_at IS NULL AND student_can_see_activity(activity_id));

-- La dirección, todas las de su escuela (también las retiradas)
DROP POLICY IF EXISTS "Directors read school clarifications" ON aclaraciones_actividad;
CREATE POLICY "Directors read school clarifications"
  ON aclaraciones_actividad FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

-- Autor, escuela y fechas los pone la base; después de escrita, lo único
-- que cambia es que se retira (y no vuelve)
CREATE OR REPLACE FUNCTION sellar_aclaracion()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.autor_id := coalesce(auth.uid(), NEW.autor_id);
    NEW.school_id := (SELECT a.school_id FROM activities a WHERE a.id = NEW.activity_id);
    NEW.texto := trim(NEW.texto);
    NEW.created_at := now();
    NEW.retirada_at := NULL;
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.autor_id := OLD.autor_id;
  NEW.school_id := OLD.school_id;
  NEW.texto := OLD.texto;
  NEW.created_at := OLD.created_at;
  IF NEW.activity_id IS DISTINCT FROM OLD.activity_id THEN
    -- Solo la base la desata, cuando se borra la actividad: queda retirada
    IF NEW.activity_id IS NULL THEN
      NEW.retirada_at := coalesce(OLD.retirada_at, now());
    ELSE
      NEW.activity_id := OLD.activity_id;
    END IF;
  END IF;
  NEW.retirada_at := CASE WHEN OLD.retirada_at IS NOT NULL THEN OLD.retirada_at
                          WHEN NEW.retirada_at IS NOT NULL THEN now() END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sellar_aclaracion ON aclaraciones_actividad;
CREATE TRIGGER trg_sellar_aclaracion
  BEFORE INSERT OR UPDATE ON aclaraciones_actividad
  FOR EACH ROW EXECUTE FUNCTION sellar_aclaracion();

-- Una actividad con consultas o aclaraciones de su curso no se pasa a otra
-- materia o curso: lo que se habló con 3° A no tiene que aparecerle a 3° B
CREATE OR REPLACE FUNCTION actividad_con_charlas_no_se_muda()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.subject_id IS DISTINCT FROM OLD.subject_id OR NEW.course_id IS DISTINCT FROM OLD.course_id)
     AND (EXISTS (SELECT 1 FROM aclaraciones_actividad x WHERE x.activity_id = OLD.id)
          OR EXISTS (SELECT 1 FROM conversaciones c WHERE c.activity_id = OLD.id AND c.origen = 'consulta')) THEN
    RAISE EXCEPTION 'Esta actividad ya tiene consultas o aclaraciones de su curso: no se puede pasar a otra materia o curso. Si la necesitás en otro, creá una nueva.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actividad_con_charlas ON activities;
CREATE TRIGGER trg_actividad_con_charlas
  BEFORE UPDATE OF subject_id, course_id ON activities
  FOR EACH ROW EXECUTE FUNCTION actividad_con_charlas_no_se_muda();

-- ── 4. Lo que ve el panel de seguimiento ──
-- Con los permisos de quien llama (SECURITY INVOKER): las policies de
-- activities, activity_submissions, activity_events, enrollments, students
-- y la mensajería deciden qué ve. Un docente: sus actividades de esa materia
-- y curso, y sus consultas.

CREATE OR REPLACE FUNCTION seguimiento_curso(p_subject UUID, p_course UUID)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH acts AS (
    SELECT a.id, a.title, a.tipo, a.status, a.due_date, a.points, coalesce(a.published_at, a.created_at) AS publicada
    FROM activities a
    WHERE a.teacher_id = auth.uid() AND a.subject_id = p_subject AND a.course_id = p_course
      AND a.status <> 'draft'
      AND coalesce(a.published_at, a.created_at) >= date_trunc('year', now())
  ),
  alumnos AS (
    SELECT DISTINCT s.id, s.user_id, s.first_name, s.last_name
    FROM enrollments e JOIN students s ON s.id = e.student_id
    WHERE e.subject_id = p_subject AND e.course_id = p_course
  ),
  -- Solo de los inscriptos: si no, "31/30 entregaron"
  subs AS (
    SELECT sb.activity_id, sb.student_id, sb.status, sb.registro, sb.score, sb.updated_at
    FROM activity_submissions sb
    JOIN acts ON acts.id = sb.activity_id
    JOIN alumnos al ON al.id = sb.student_id
  ),
  consultas AS (
    SELECT c.id, c.activity_id, c.ultimo_mensaje_at,
           (SELECT st.id FROM conversacion_participantes cp JOIN students st ON st.user_id = cp.user_id
             WHERE cp.conversacion_id = c.id LIMIT 1) AS student_id,
           ult.autor_id AS ultimo_autor, ult.cuerpo AS ultimo_cuerpo, yo.archivada,
           (ult.autor_id IS DISTINCT FROM auth.uid() AND NOT yo.archivada) AS pendiente
    FROM conversaciones c
    JOIN conversacion_participantes yo ON yo.conversacion_id = c.id AND yo.user_id = auth.uid()
    JOIN acts ON acts.id = c.activity_id
    LEFT JOIN LATERAL (SELECT m.autor_id, m.cuerpo FROM mensajes m WHERE m.conversacion_id = c.id
                       ORDER BY m.created_at DESC LIMIT 1) ult ON true
    WHERE c.origen = 'consulta'
  )
  SELECT jsonb_build_object(
    'actividades', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', acts.id, 'titulo', acts.title, 'tipo', acts.tipo, 'estado', acts.status,
        'vence', acts.due_date, 'puntos', acts.points, 'publicada', acts.publicada,
        'entregaron', (SELECT count(*) FROM subs WHERE subs.activity_id = acts.id AND subs.status IN ('submitted', 'graded')),
        'sinCorregir', (SELECT count(*) FROM subs WHERE subs.activity_id = acts.id AND subs.status = 'submitted'),
        'enCurso', (SELECT count(*) FROM subs WHERE subs.activity_id = acts.id AND subs.status = 'in_progress'),
        'noEntrego', (SELECT count(*) FROM subs WHERE subs.activity_id = acts.id AND subs.registro = 'no_entrego'
                        AND subs.status NOT IN ('submitted', 'graded')),
        'consultasSinResponder', (SELECT count(*) FROM consultas q WHERE q.activity_id = acts.id AND q.pendiente)
      ) ORDER BY acts.publicada DESC)
      FROM acts), '[]'::jsonb),
    'estudiantes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', al.id, 'nombre', al.first_name, 'apellido', al.last_name,
        'entregadas', (SELECT count(*) FROM subs WHERE subs.student_id = al.id AND subs.status IN ('submitted', 'graded')),
        'enCurso', (SELECT count(*) FROM subs WHERE subs.student_id = al.id AND subs.status = 'in_progress'),
        -- Vencidas sin entregar (lo que más importa seguir)
        'atrasadas', (SELECT count(*) FROM acts
                       WHERE acts.status = 'published' AND acts.due_date < now()
                         AND NOT EXISTS (SELECT 1 FROM subs WHERE subs.activity_id = acts.id AND subs.student_id = al.id
                                           AND subs.status IN ('submitted', 'graded'))),
        -- Lo último que hizo en estas actividades: entregas, huella o una
        -- consulta (lo que escribe el docente no cuenta: 063)
        'ultimaActividad', greatest(
          (SELECT max(subs.updated_at) FROM subs WHERE subs.student_id = al.id),
          (SELECT max(ev.created_at) FROM activity_events ev JOIN acts ON acts.id = ev.activity_id WHERE ev.student_id = al.id),
          (SELECT max(m.created_at) FROM consultas q JOIN mensajes m ON m.conversacion_id = q.id
            WHERE q.student_id = al.id AND m.autor_id = al.user_id)),
        'consultasSinResponder', (SELECT count(*) FROM consultas q WHERE q.student_id = al.id AND q.pendiente)
      ) ORDER BY al.last_name, al.first_name)
      FROM alumnos al), '[]'::jsonb),
    'consultas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'conversacionId', q.id, 'activityId', q.activity_id,
        'actividad', (SELECT acts.title FROM acts WHERE acts.id = q.activity_id),
        'studentId', q.student_id,
        'estudiante', (SELECT al.first_name || ' ' || al.last_name FROM alumnos al WHERE al.id = q.student_id),
        'ultimo', left(q.ultimo_cuerpo, 280),
        'ultimoAt', q.ultimo_mensaje_at,
        'sinResponder', q.pendiente,
        -- La archivó sin responder: no se cuenta como pendiente, pero tampoco
        -- se muestra como respondida
        'archivada', q.archivada AND q.ultimo_autor IS DISTINCT FROM auth.uid()
      ) ORDER BY q.pendiente DESC, q.ultimo_mensaje_at DESC)
      FROM consultas q), '[]'::jsonb)
  )
$$;

REVOKE EXECUTE ON FUNCTION seguimiento_curso(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seguimiento_curso(UUID, UUID) TO authenticated;

-- Comprobación: una fila, todo true
SELECT
  NOT has_function_privilege('anon', 'consultar_actividad(uuid, text, uuid)', 'EXECUTE') AS consultar_sin_anonimos,
  NOT has_table_privilege('authenticated', 'consultas_recibidas', 'SELECT') AS recibidas_cerrada,
  NOT has_table_privilege('authenticated', 'aclaraciones_actividad', 'DELETE') AS aclaraciones_no_se_borran,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversaciones' AND column_name = 'activity_id') AS conversacion_con_actividad,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'consultar_actividad') AS consultar,
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'aclaraciones_actividad' AND policyname = 'Students read clarifications of visible activities') AS aclaraciones,
  NOT has_function_privilege('anon', 'seguimiento_curso(uuid, uuid)', 'EXECUTE') AS seguimiento_sin_anonimos;
