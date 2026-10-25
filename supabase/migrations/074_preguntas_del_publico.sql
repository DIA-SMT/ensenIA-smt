-- ═══════════════════════════════════════════════════════════════════
-- 074 — Preguntas del público en la clase en vivo (estilo Mentimeter)
--
-- El docente abre las preguntas; los estudiantes del curso y los invitados
-- mandan las suyas desde el celular y votan las de los demás. Las más
-- votadas suben. El docente las destaca en el proyector, las marca como
-- respondidas o las saca.
--
--  · Anónimas entre ellos: a los celulares no viaja quién preguntó. El
--    docente sí lo ve (y el chico lo sabe: se le dice al preguntar).
--  · Lo que preocupa (texto_preocupa) no se muestra a nadie: queda
--    "retenida", sale la misma alerta que con las respuestas (067) y al que
--    la mandó le aparece como "esperando a tu docente". Al docente le llega
--    solo cuántas hay retenidas: su panel puede estar proyectado.
--  · "Revisarlas antes": con la moderación prendida, ninguna se ve hasta
--    que el docente la muestra.
--  · Topes: 5 preguntas por persona y por clase, una cada 15 segundos, y
--    200 en toda la clase.
--  · Una alerta ya cerrada no se reabre por la puerta de atrás: lo nuevo que
--    preocupa abre otra (también para las respuestas de la 067). Y los
--    caracteres invisibles ya no esconden una palabra del detector.
--  · Las tablas no se leen directo: todo pasa por estas funciones.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tablas ──

ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS preguntas_abiertas BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS preguntas_moderadas BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS live_preguntas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES live_guests(id) ON DELETE CASCADE,
  texto TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 200),
  -- pendiente: espera que el docente la muestre · retenida: preocupa (nadie la ve)
  estado TEXT NOT NULL DEFAULT 'visible'
    CHECK (estado IN ('pendiente', 'visible', 'respondida', 'oculta', 'retenida')),
  destacada BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((student_id IS NULL) <> (guest_id IS NULL))
);
CREATE INDEX IF NOT EXISTS live_preguntas_session ON live_preguntas(session_id, created_at);

CREATE TABLE IF NOT EXISTS live_pregunta_votos (
  pregunta_id UUID NOT NULL REFERENCES live_preguntas(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES live_guests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((student_id IS NULL) <> (guest_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS live_pregunta_votos_estudiante ON live_pregunta_votos(pregunta_id, student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS live_pregunta_votos_invitado ON live_pregunta_votos(pregunta_id, guest_id) WHERE guest_id IS NOT NULL;

-- Sin políticas: nadie las lee ni escribe directo
ALTER TABLE live_preguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_pregunta_votos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON live_preguntas, live_pregunta_votos FROM anon, authenticated;

-- ── 2. Lo que preocupa: la misma alerta que las respuestas (067) ──

-- El detector, igual que en la 067, pero sin los caracteres invisibles
-- (antes se volvían un espacio: "mat\u200Barme" no se detectaba y se leía
-- "matarme") y con las mayúsculas acentuadas que faltaban
CREATE OR REPLACE FUNCTION texto_normalizado(p_texto TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ' ' || btrim(regexp_replace(
    lower(translate(regexp_replace(coalesce(p_texto, ''), '[\u00AD\u200B-\u200F\u2060\uFEFF]', '', 'g'),
                    'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙ', 'aeiouunAEIOUUNaeiouAEIOU')),
    '[^a-z0-9]+', ' ', 'g')) || ' '
$$;

-- Las respuestas que preocupan (067): igual, sin sumar a una alerta cerrada
CREATE OR REPLACE FUNCTION avisar_respuesta_que_preocupa()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ses live_sessions;
  st RECORD;
  v_texto TEXT := left(concat_ws(' ', NEW.payload->>'texto', NEW.payload->>'palabra'), 300);
  v_quien TEXT;
  v_titulo TEXT;
  v_alerta UUID;
BEGIN
  IF NOT NEW.payload ? 'oculta' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.payload ? 'oculta'
     AND left(concat_ws(' ', OLD.payload->>'texto', OLD.payload->>'palabra'), 300) = v_texto THEN
    RETURN NULL;
  END IF;
  SELECT * INTO ses FROM live_sessions WHERE id = NEW.session_id;

  IF NEW.student_id IS NOT NULL THEN
    SELECT s.id, s.first_name, s.last_name INTO st FROM students s WHERE s.id = NEW.student_id;
    v_quien := st.first_name || ' ' || st.last_name;
    v_titulo := 'Escribió algo que preocupa en la clase en vivo';
    SELECT a.id INTO v_alerta
      FROM alerts a JOIN alert_students x ON x.alert_id = a.id
     WHERE a.title = v_titulo AND a.teacher_id = ses.teacher_id AND x.student_id = st.id
       AND a.created_at >= ses.created_at AND a.status <> 'cerrada'
     ORDER BY a.created_at DESC LIMIT 1;
  ELSE
    -- Un invitado sin cuenta: una alerta por clase con todo lo de los invitados
    v_quien := 'El invitado "' || coalesce((SELECT g.display_name FROM live_guests g WHERE g.id = NEW.guest_id), 'sin nombre') || '"';
    v_titulo := 'Un invitado escribió algo que preocupa en la clase en vivo';
    SELECT a.id INTO v_alerta FROM alerts a
     WHERE a.title = v_titulo AND a.teacher_id = ses.teacher_id AND a.created_at >= ses.created_at
       AND a.status <> 'cerrada'
       AND a.message LIKE '%' || ses.title || '%'
     ORDER BY a.created_at DESC LIMIT 1;
  END IF;

  IF v_alerta IS NOT NULL THEN
    UPDATE alerts SET message = left(message || ' · Después, ' || v_quien || ': "' || v_texto || '"', 4000), is_read = false
     WHERE id = v_alerta;
    RETURN NULL;
  END IF;

  INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
  VALUES ('danger', 'system', v_titulo,
          v_quien || ' escribió en "' || ses.title || '": "' || v_texto
            || '". No se mostró en el proyector ni a sus compañeros.',
          'Hoy', ses.teacher_id, ses.school_id)
  RETURNING id INTO v_alerta;
  IF NEW.student_id IS NOT NULL THEN
    INSERT INTO alert_students (alert_id, student_id) VALUES (v_alerta, st.id);
    PERFORM notificar_a_direccion(
      ses.school_id, ses.teacher_id,
      'Un estudiante escribió algo que preocupa',
      v_quien || ' escribió en la clase en vivo "' || ses.title || '": "' || v_texto
        || '". Conviene una charla con el estudiante. Si escribe algo más en esta clase, se suma a la alerta del docente.');
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION avisar_pregunta_que_preocupa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ses live_sessions;
  st RECORD;
  v_texto TEXT := left(NEW.texto, 300);
  v_quien TEXT;
  v_titulo TEXT;
  v_alerta UUID;
BEGIN
  IF NEW.estado <> 'retenida' THEN RETURN NULL; END IF;
  SELECT * INTO ses FROM live_sessions WHERE id = NEW.session_id;

  IF NEW.student_id IS NOT NULL THEN
    SELECT s.id, s.first_name, s.last_name INTO st FROM students s WHERE s.id = NEW.student_id;
    v_quien := st.first_name || ' ' || st.last_name;
    v_titulo := 'Escribió algo que preocupa en la clase en vivo';
    SELECT a.id INTO v_alerta
      FROM alerts a JOIN alert_students x ON x.alert_id = a.id
     WHERE a.title = v_titulo AND a.teacher_id = ses.teacher_id AND x.student_id = st.id
       AND a.created_at >= ses.created_at AND a.status <> 'cerrada'
     ORDER BY a.created_at DESC LIMIT 1;
  ELSE
    v_quien := 'El invitado "' || coalesce((SELECT g.display_name FROM live_guests g WHERE g.id = NEW.guest_id), 'sin nombre') || '"';
    v_titulo := 'Un invitado escribió algo que preocupa en la clase en vivo';
    SELECT a.id INTO v_alerta FROM alerts a
     WHERE a.title = v_titulo AND a.teacher_id = ses.teacher_id AND a.created_at >= ses.created_at
       AND a.status <> 'cerrada'
       AND a.message LIKE '%' || ses.title || '%'
     ORDER BY a.created_at DESC LIMIT 1;
  END IF;

  IF v_alerta IS NOT NULL THEN
    UPDATE alerts SET message = left(message || ' · Después, ' || v_quien || ' preguntó: "' || v_texto || '"', 4000), is_read = false
     WHERE id = v_alerta;
    RETURN NULL;
  END IF;

  INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
  VALUES ('danger', 'system', v_titulo,
          v_quien || ' mandó como pregunta en "' || ses.title || '": "' || v_texto
            || '". No se mostró en el proyector ni a sus compañeros.',
          'Hoy', ses.teacher_id, ses.school_id)
  RETURNING id INTO v_alerta;
  IF NEW.student_id IS NOT NULL THEN
    INSERT INTO alert_students (alert_id, student_id) VALUES (v_alerta, st.id);
    PERFORM notificar_a_direccion(
      ses.school_id, ses.teacher_id,
      'Un estudiante escribió algo que preocupa',
      v_quien || ' mandó como pregunta en la clase en vivo "' || ses.title || '": "' || v_texto
        || '". Conviene una charla con el estudiante. Si escribe algo más en esta clase, se suma a la alerta del docente.');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_avisar_pregunta_que_preocupa ON live_preguntas;
CREATE TRIGGER trg_avisar_pregunta_que_preocupa
  AFTER INSERT ON live_preguntas
  FOR EACH ROW EXECUTE FUNCTION avisar_pregunta_que_preocupa();

-- ── 3. La lista: cada uno ve lo suyo ──

-- Interna. El docente ve el autor y las pendientes; cada participante, las
-- visibles y respondidas (sin autor), más las suyas que esperan (una
-- retenida le aparece como "pendiente": no se entera de que preocupó).
-- No cuenta lo de un invitado que el docente sacó de la sala.
CREATE OR REPLACE FUNCTION _lista_preguntas(p_session UUID, p_student UUID, p_guest UUID, p_docente BOOLEAN)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sacados AS (
    SELECT id FROM live_guests
     WHERE session_id = p_session AND expulsado_at IS NOT NULL AND coalesce(motivo_salida, 'sacado') = 'sacado'
  ),
  preguntas AS (
    SELECT p.*,
           (p_student IS NOT NULL AND p.student_id = p_student) OR (p_guest IS NOT NULL AND p.guest_id = p_guest) AS mia
      FROM live_preguntas p
     WHERE p.session_id = p_session
       AND (p.guest_id IS NULL OR p.guest_id NOT IN (SELECT id FROM sacados))
  ),
  votos AS (
    SELECT v.pregunta_id, count(*)::int AS n,
           bool_or((p_student IS NOT NULL AND v.student_id = p_student) OR (p_guest IS NOT NULL AND v.guest_id = p_guest)) AS mio
      FROM live_pregunta_votos v
      JOIN preguntas p ON p.id = v.pregunta_id
     WHERE v.guest_id IS NULL OR v.guest_id NOT IN (SELECT id FROM sacados)
     GROUP BY v.pregunta_id
  ),
  vistas AS (
    SELECT p.id, p.texto, p.destacada, p.created_at, p.mia,
           CASE WHEN p.estado = 'retenida' THEN 'pendiente' ELSE p.estado END AS estado,
           coalesce(v.n, 0) AS votos, coalesce(v.mio, false) AS vote,
           CASE WHEN p_docente THEN coalesce(st.first_name || ' ' || st.last_name, g.display_name || ' (invitado)') END AS autor
      FROM preguntas p
      LEFT JOIN votos v ON v.pregunta_id = p.id
      LEFT JOIN students st ON st.id = p.student_id
      LEFT JOIN live_guests g ON g.id = p.guest_id
     WHERE p.estado IN ('visible', 'respondida')
        OR (p.estado = 'pendiente' AND (p_docente OR p.mia))
        OR (p.estado = 'retenida' AND p.mia)
     -- Si son muchas, no se pierden las que esperan revisión ni las propias
     ORDER BY (p.mia OR (p_docente AND p.estado = 'pendiente')) DESC, p.destacada DESC, coalesce(v.n, 0) DESC, p.created_at
     LIMIT CASE WHEN p_docente THEN 200 ELSE 60 END
  )
  SELECT jsonb_build_object(
    'lista', coalesce((SELECT jsonb_agg(jsonb_build_object(
               'id', id, 'texto', texto, 'estado', estado, 'destacada', destacada, 'votos', votos,
               'vote', vote, 'mia', mia, 'autor', autor, 'creada', created_at)
               ORDER BY destacada DESC, votos DESC, created_at) FROM vistas), '[]'::jsonb),
    -- Solo al docente, y solo cuántas: el texto y el nombre van por la alerta
    'retenidas', CASE WHEN p_docente
                      THEN (SELECT count(*) FROM preguntas WHERE estado = 'retenida')::int ELSE 0 END
  )
$$;
REVOKE EXECUTE ON FUNCTION _lista_preguntas(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Docente de la clase o estudiante del curso (la usan los pedidos de estado y el resumen)
CREATE OR REPLACE FUNCTION live_preguntas(p_session UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ses live_sessions;
BEGIN
  SELECT * INTO ses FROM live_sessions WHERE id = p_session;
  IF ses.id IS NULL THEN RETURN NULL; END IF;
  IF ses.teacher_id = auth.uid() THEN
    RETURN _lista_preguntas(p_session, NULL, NULL, true);
  END IF;
  IF auth_student_id() IS NOT NULL AND ses.course_id = auth_student_course_id() AND ses.status = 'live' THEN
    RETURN _lista_preguntas(p_session, auth_student_id(), NULL, false);
  END IF;
  RAISE EXCEPTION 'Sin acceso a esta clase' USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION live_preguntas(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_preguntas(UUID) TO authenticated;

-- ── 4. Preguntar ──

-- Interna: los topes y el cuidado, iguales para estudiantes e invitados
CREATE OR REPLACE FUNCTION _preguntar(p_session UUID, p_student UUID, p_guest UUID, p_texto TEXT)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ses live_sessions;
  -- Sin caracteres invisibles: lo que se muestra es lo que miró el detector
  v_texto TEXT := btrim(regexp_replace(
    regexp_replace(coalesce(p_texto, ''), '[\u00AD\u200B-\u200F\u2060\uFEFF]', '', 'g'), '\s+', ' ', 'g'));
  v_cuantas INT;
  v_ultima TIMESTAMPTZ;
  v_id UUID;
BEGIN
  -- De a una por persona: dos pedidos a la vez no se saltean los topes
  PERFORM pg_advisory_xact_lock(hashtext('pregunta:' || p_session::text || ':' || coalesce(p_student, p_guest)::text));
  SELECT * INTO ses FROM live_sessions WHERE id = p_session;
  IF ses.id IS NULL OR ses.status <> 'live' OR NOT ses.preguntas_abiertas THEN
    RAISE EXCEPTION 'PREGUNTAS_CERRADAS' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_texto) < 3 THEN
    RAISE EXCEPTION 'PREGUNTA_VACIA' USING ERRCODE = '22023';
  END IF;
  v_texto := left(v_texto, 200);

  -- La misma otra vez (un reintento sin señal): vale la que ya está
  SELECT id INTO v_id FROM live_preguntas
   WHERE session_id = p_session AND texto = v_texto
     AND ((p_student IS NOT NULL AND student_id = p_student) OR (p_guest IS NOT NULL AND guest_id = p_guest))
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT count(*), max(created_at) INTO v_cuantas, v_ultima FROM live_preguntas
   WHERE session_id = p_session
     AND ((p_student IS NOT NULL AND student_id = p_student) OR (p_guest IS NOT NULL AND guest_id = p_guest));
  IF v_cuantas >= 5 THEN
    RAISE EXCEPTION 'DEMASIADAS_PREGUNTAS' USING ERRCODE = 'P0001';
  END IF;
  IF v_ultima > now() - interval '15 seconds' THEN
    RAISE EXCEPTION 'ESPERA_UN_MOMENTO' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM live_preguntas WHERE session_id = p_session) >= 200 THEN
    RAISE EXCEPTION 'DEMASIADAS_EN_LA_CLASE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO live_preguntas (session_id, student_id, guest_id, texto, estado)
  VALUES (p_session, p_student, p_guest, v_texto,
          CASE WHEN texto_preocupa(v_texto) THEN 'retenida'
               WHEN ses.preguntas_moderadas THEN 'pendiente'
               ELSE 'visible' END)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION _preguntar(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Estudiante: en la clase viva de su curso
CREATE OR REPLACE FUNCTION live_preguntar(p_session UUID, p_texto TEXT)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_st UUID := auth_student_id();
BEGIN
  IF v_st IS NULL OR NOT EXISTS (
    SELECT 1 FROM live_sessions WHERE id = p_session AND course_id = auth_student_course_id()
  ) THEN
    RAISE EXCEPTION 'Sin acceso a esta clase' USING ERRCODE = '42501';
  END IF;
  RETURN _preguntar(p_session, v_st, NULL, p_texto);
END;
$$;
REVOKE EXECUTE ON FUNCTION live_preguntar(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_preguntar(UUID, TEXT) TO authenticated;

-- Invitado: con su token y la sala abierta
CREATE OR REPLACE FUNCTION live_preguntar_invitado(p_token UUID, p_texto TEXT)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g live_guests;
BEGIN
  SELECT * INTO g FROM live_guests WHERE token = p_token;
  IF g.id IS NULL OR g.expulsado_at IS NOT NULL THEN RAISE EXCEPTION 'INVITADO_DESCONOCIDO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM live_sessions WHERE id = g.session_id AND guests_enabled) THEN
    RAISE EXCEPTION 'PREGUNTAS_CERRADAS' USING ERRCODE = 'P0001';
  END IF;
  RETURN _preguntar(g.session_id, NULL, g.id, p_texto);
END;
$$;
REVOKE EXECUTE ON FUNCTION live_preguntar_invitado(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION live_preguntar_invitado(UUID, TEXT) TO anon, authenticated;

-- ── 5. Votar (una vez por pregunta; la propia no) ──

CREATE OR REPLACE FUNCTION _votar_pregunta(p_pregunta UUID, p_session UUID, p_student UUID, p_guest UUID, p_voto BOOLEAN)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p live_preguntas;
BEGIN
  SELECT * INTO p FROM live_preguntas WHERE id = p_pregunta AND session_id = p_session;
  IF p.id IS NULL OR p.estado <> 'visible'
     OR NOT EXISTS (SELECT 1 FROM live_sessions WHERE id = p_session AND status = 'live') THEN
    RAISE EXCEPTION 'PREGUNTA_NO_DISPONIBLE' USING ERRCODE = 'P0001';
  END IF;
  IF (p_student IS NOT NULL AND p.student_id = p_student) OR (p_guest IS NOT NULL AND p.guest_id = p_guest) THEN
    RAISE EXCEPTION 'PREGUNTA_PROPIA' USING ERRCODE = 'P0001';
  END IF;
  IF p_voto THEN
    INSERT INTO live_pregunta_votos (pregunta_id, student_id, guest_id) VALUES (p_pregunta, p_student, p_guest)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM live_pregunta_votos
     WHERE pregunta_id = p_pregunta
       AND ((p_student IS NOT NULL AND student_id = p_student) OR (p_guest IS NOT NULL AND guest_id = p_guest));
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION _votar_pregunta(UUID, UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION live_votar_pregunta(p_pregunta UUID, p_voto BOOLEAN)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_st UUID := auth_student_id();
  v_ses UUID;
BEGIN
  SELECT p.session_id INTO v_ses FROM live_preguntas p
    JOIN live_sessions s ON s.id = p.session_id
   WHERE p.id = p_pregunta AND s.course_id = auth_student_course_id();
  IF v_st IS NULL OR v_ses IS NULL THEN
    RAISE EXCEPTION 'PREGUNTA_NO_DISPONIBLE' USING ERRCODE = 'P0001';
  END IF;
  PERFORM _votar_pregunta(p_pregunta, v_ses, v_st, NULL, p_voto);
END;
$$;
REVOKE EXECUTE ON FUNCTION live_votar_pregunta(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_votar_pregunta(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION live_votar_pregunta_invitado(p_token UUID, p_pregunta UUID, p_voto BOOLEAN)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g live_guests;
BEGIN
  SELECT * INTO g FROM live_guests WHERE token = p_token;
  IF g.id IS NULL OR g.expulsado_at IS NOT NULL THEN RAISE EXCEPTION 'INVITADO_DESCONOCIDO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM live_sessions WHERE id = g.session_id AND guests_enabled) THEN
    RAISE EXCEPTION 'PREGUNTA_NO_DISPONIBLE' USING ERRCODE = 'P0001';
  END IF;
  PERFORM _votar_pregunta(p_pregunta, g.session_id, NULL, g.id, p_voto);
END;
$$;
REVOKE EXECUTE ON FUNCTION live_votar_pregunta_invitado(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION live_votar_pregunta_invitado(UUID, UUID, BOOLEAN) TO anon, authenticated;

-- ── 6. El docente modera ──
-- mostrar (una pendiente) · destacar / no_destacar (en el proyector, una a la
-- vez) · respondida · volver (una respondida, a la lista) · ocultar
CREATE OR REPLACE FUNCTION live_moderar_pregunta(p_pregunta UUID, p_accion TEXT)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p live_preguntas;
BEGIN
  SELECT q.* INTO p FROM live_preguntas q
    JOIN live_sessions s ON s.id = q.session_id
   WHERE q.id = p_pregunta AND s.teacher_id = auth.uid();
  -- Una retenida no se modera desde acá: va por la alerta
  IF p.id IS NULL OR p.estado = 'retenida' THEN
    RAISE EXCEPTION 'PREGUNTA_NO_DISPONIBLE' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM live_sessions WHERE id = p.session_id FOR UPDATE;
  CASE p_accion
    WHEN 'mostrar' THEN
      UPDATE live_preguntas SET estado = 'visible' WHERE id = p.id AND estado = 'pendiente';
    WHEN 'destacar' THEN
      UPDATE live_preguntas SET destacada = false WHERE session_id = p.session_id AND destacada AND id <> p.id;
      UPDATE live_preguntas SET destacada = true, estado = CASE WHEN estado = 'pendiente' THEN 'visible' ELSE estado END
       WHERE id = p.id AND estado IN ('pendiente', 'visible');
    WHEN 'no_destacar' THEN
      UPDATE live_preguntas SET destacada = false WHERE id = p.id;
    WHEN 'respondida' THEN
      UPDATE live_preguntas SET estado = 'respondida', destacada = false WHERE id = p.id AND estado IN ('pendiente', 'visible');
    WHEN 'volver' THEN
      UPDATE live_preguntas SET estado = 'visible' WHERE id = p.id AND estado = 'respondida';
    WHEN 'ocultar' THEN
      UPDATE live_preguntas SET estado = 'oculta', destacada = false WHERE id = p.id;
    ELSE
      RAISE EXCEPTION 'ACCION_DESCONOCIDA' USING ERRCODE = '22023';
  END CASE;
END;
$$;
REVOKE EXECUTE ON FUNCTION live_moderar_pregunta(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_moderar_pregunta(UUID, TEXT) TO authenticated;

-- ── 7. Las preguntas viajan con los pedidos de estado (uno por vuelta) ──

-- El estudiante: igual que en la 073, con las preguntas
CREATE OR REPLACE FUNCTION live_estado_alumno(p_session UUID DEFAULT NULL, p_medallas_desde TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_st UUID := auth_student_id();
  ses live_sessions;
  act live_activities_alumno;
  mine JSONB;
  v_resultados JSONB;
  v_medalla JSONB;
BEGIN
  IF v_st IS NULL THEN
    RAISE EXCEPTION 'Solo para estudiantes' USING ERRCODE = '42501';
  END IF;

  IF p_session IS NOT NULL THEN
    SELECT * INTO ses FROM live_sessions WHERE id = p_session;
    IF ses.id IS NOT NULL AND ses.status = 'ended' THEN
      RETURN jsonb_build_object('estado', 'terminada', 'sessionId', ses.id, 'titulo', ses.title);
    END IF;
  END IF;
  -- La que venía ya no se ve (o no venía ninguna): la viva de su curso
  IF ses.id IS NULL THEN
    SELECT * INTO ses FROM live_sessions
     WHERE course_id = auth_student_course_id() AND status = 'live'
     LIMIT 1;
  END IF;
  IF ses.id IS NULL OR clase_en_vivo_olvidada(ses.id) THEN
    RETURN jsonb_build_object('estado', 'sin_clase');
  END IF;

  -- Presencia: late con el mismo pedido, a lo sumo cada 25 s. Se mira antes
  -- de escribir: un INSERT … ON CONFLICT bloquea y escribe aunque no cambie
  -- nada, y esto corre en cada vuelta de cada celular.
  IF NOT EXISTS (
    SELECT 1 FROM live_presence
     WHERE session_id = ses.id AND student_id = v_st AND last_seen_at > now() - interval '25 seconds'
  ) THEN
    INSERT INTO live_presence (session_id, student_id, last_seen_at)
    VALUES (ses.id, v_st, now())
    ON CONFLICT (session_id, student_id) DO UPDATE SET last_seen_at = now();
  END IF;

  -- La vista del alumno no trae la correcta del quiz hasta que se revela
  SELECT * INTO act FROM live_activities_alumno
   WHERE session_id = ses.id ORDER BY created_at DESC LIMIT 1;

  IF act.id IS NOT NULL THEN
    SELECT payload INTO mine FROM live_responses WHERE activity_id = act.id AND student_id = v_st;
    -- Los resultados se le muestran después de responder: antes, ni viajan
    IF mine IS NOT NULL AND act.status <> 'closed' THEN
      v_resultados := get_live_results(act.id);
    END IF;
  END IF;

  IF p_medallas_desde IS NOT NULL THEN
    SELECT jsonb_build_object(
             'id', sa.id, 'student_id', sa.student_id, 'teacher_id', sa.teacher_id, 'subject_id', sa.subject_id,
             'badge_code', sa.badge_code, 'message', sa.message, 'created_at', sa.created_at,
             'profiles', CASE WHEN p.id IS NULL THEN NULL
                              ELSE jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name) END)
      INTO v_medalla
      FROM student_awards sa
      LEFT JOIN profiles p ON p.id = sa.teacher_id
     WHERE sa.student_id = v_st AND sa.created_at > p_medallas_desde
     ORDER BY sa.created_at DESC
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'estado', 'en_vivo',
    'session', to_jsonb(ses),
    'activity', CASE WHEN act.id IS NULL THEN NULL ELSE to_jsonb(act) END,
    'myAnswer', mine,
    'results', v_resultados,
    'medalla', v_medalla,
    -- Las preguntas del público, sin autor (074)
    'preguntas', live_preguntas(ses.id),
    -- La hora del servidor: la cuenta regresiva no depende del reloj del celular (073)
    'ahora', now()
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION live_estado_alumno(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_estado_alumno(UUID, TIMESTAMPTZ) TO authenticated;

-- El docente: igual que en la 073, con las preguntas
CREATE OR REPLACE FUNCTION live_estado_docente(p_session UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  ses live_sessions;
  act live_activities;
  v_resultados JSONB;
  v_olvidada BOOLEAN;
BEGIN
  SELECT * INTO ses FROM live_sessions WHERE id = p_session AND teacher_id = auth.uid();
  IF ses.id IS NULL THEN RETURN NULL; END IF;

  -- Primero si quedó olvidada (el docente que vuelve al otro día no la
  -- revive sin querer: la app se la cierra); después, que está mirando,
  -- a lo sumo una vez por minuto
  v_olvidada := ses.status = 'live' AND clase_en_vivo_olvidada(ses.id);
  IF ses.status = 'live' AND NOT v_olvidada
     AND (ses.docente_visto_at IS NULL OR ses.docente_visto_at < now() - interval '60 seconds') THEN
    UPDATE live_sessions SET docente_visto_at = now() WHERE id = ses.id;
  END IF;

  SELECT * INTO act FROM live_activities WHERE session_id = ses.id ORDER BY created_at DESC LIMIT 1;
  IF act.id IS NOT NULL AND act.status <> 'closed' THEN
    v_resultados := get_live_results(act.id);
  END IF;

  RETURN jsonb_build_object(
    'session', to_jsonb(ses),
    'activity', CASE WHEN act.id IS NULL THEN NULL ELSE to_jsonb(act) END,
    'results', v_resultados,
    'olvidada', v_olvidada,
    -- Los emojis del último minuto (con la hora del servidor, no la del equipo)
    'reacciones', CASE WHEN ses.reactions_enabled THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('emoji', r.emoji, 'createdAt', r.created_at) ORDER BY r.created_at DESC)
        FROM (SELECT emoji, created_at FROM live_reactions
               WHERE session_id = ses.id AND created_at > now() - interval '60 seconds'
               ORDER BY created_at DESC LIMIT 60) r), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'invitados', CASE WHEN ses.guests_enabled THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'nombre', g.display_name, 'vistoAt', g.last_seen_at) ORDER BY g.created_at)
        FROM live_guests g WHERE g.session_id = ses.id AND g.expulsado_at IS NULL), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    -- Estudiantes vistos en los últimos 90 s
    'conectados', coalesce((
      SELECT jsonb_agg(lp.student_id) FROM live_presence lp
       WHERE lp.session_id = ses.id AND lp.last_seen_at > now() - interval '90 seconds'), '[]'::jsonb),
    -- Las preguntas del público, con autor (074)
    'preguntas', live_preguntas(ses.id),
    -- La hora del servidor, para la cuenta regresiva de la competencia (073)
    'ahora', now()
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION live_estado_docente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_estado_docente(UUID) TO authenticated;

-- El invitado: igual que en la 073, con las preguntas
CREATE OR REPLACE FUNCTION live_guest_state(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g live_guests;
  ses live_sessions;
  act live_activities;
  safe_config JSONB;
  mine JSONB;
BEGIN
  SELECT * INTO g FROM live_guests WHERE token = p_token;
  IF g.id IS NULL THEN RAISE EXCEPTION 'INVITADO_DESCONOCIDO'; END IF;
  IF g.expulsado_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'expulsado', 'motivo', coalesce(g.motivo_salida, 'sacado'));
  END IF;

  IF g.last_seen_at < now() - interval '30 seconds' THEN
    UPDATE live_guests SET last_seen_at = now() WHERE id = g.id;
  END IF;

  SELECT * INTO ses FROM live_sessions WHERE id = g.session_id;
  IF ses.status <> 'live' THEN
    RETURN jsonb_build_object('status', 'ended');
  END IF;
  -- Cerrar la sala a invitados saca a los que ya estaban
  IF NOT ses.guests_enabled THEN
    RETURN jsonb_build_object('status', 'cerrada');
  END IF;

  SELECT * INTO act FROM live_activities
   WHERE session_id = ses.id ORDER BY created_at DESC LIMIT 1;

  -- Una pregunta dirigida a un estudiante no es para los invitados
  IF act.id IS NULL OR act.status = 'closed' OR act.target_student_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'idle',
      'title', ses.title,
      'reactionsEnabled', ses.reactions_enabled,
      -- Las preguntas del público (074)
      'preguntasAbiertas', ses.preguntas_abiertas,
      'preguntas', _lista_preguntas(ses.id, NULL, g.id, false),
      'ahora', now()
    );
  END IF;

  safe_config := act.config;
  IF act.kind = 'quiz' AND act.status <> 'revealed' THEN
    safe_config := safe_config - 'correctId';
  END IF;

  SELECT payload INTO mine FROM live_responses
   WHERE activity_id = act.id AND guest_id = g.id;

  RETURN jsonb_build_object(
    'status', 'active',
    'title', ses.title,
    'reactionsEnabled', ses.reactions_enabled,
    'activity', jsonb_build_object(
      'id', act.id, 'kind', act.kind,
      'config', safe_config, 'status', act.status,
      'creada', act.created_at
    ),
    'myAnswer', mine,
    'results', live_results_json(act.id, false),
    'preguntasAbiertas', ses.preguntas_abiertas,
    'preguntas', _lista_preguntas(ses.id, NULL, g.id, false),
    'ahora', now()
  );
END $$;

-- Comprobación: una fila, todo true
SELECT
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_avisar_pregunta_que_preocupa') AS preocupa_avisa,
  texto_preocupa(E'me quiero mat\u200Bar') AND texto_preocupa('NO QUIERO VIVIR') AS detector_sin_invisibles,
  NOT has_table_privilege('authenticated', 'live_preguntas', 'SELECT') AS tabla_cerrada,
  NOT has_table_privilege('anon', 'live_pregunta_votos', 'INSERT') AS votos_cerrados,
  NOT has_function_privilege('authenticated', '_lista_preguntas(uuid, uuid, uuid, boolean)', 'EXECUTE') AS lista_interna,
  NOT has_function_privilege('anon', 'live_preguntar(uuid, text)', 'EXECUTE') AS preguntar_con_cuenta,
  has_function_privilege('anon', 'live_preguntar_invitado(uuid, text)', 'EXECUTE') AS invitados_con_token,
  NOT has_function_privilege('anon', 'live_moderar_pregunta(uuid, text)', 'EXECUTE') AS moderar_solo_docente;
