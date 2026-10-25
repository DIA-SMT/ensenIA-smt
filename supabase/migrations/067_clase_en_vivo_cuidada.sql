-- ═══════════════════════════════════════════════════════════════════
-- 067 — Clase en vivo: cuidar a los chicos (fase 5, parte 1)
--
-- La clase en vivo junta chicos, a veces invitados sin cuenta y un
-- proyector en la pared. Lo que entra tiene que controlarlo la base, no
-- el celular (el control del celular se saltea con la consola).
--
--  · Invitados: cerrar la sala los saca a todos (antes solo impedía que
--    entraran nuevos), el docente puede sacar a uno (y lo que mandó), y
--    no ven ni contestan una pregunta dirigida a un estudiante.
--  · Respuestas (estudiantes e invitados): solo a una actividad abierta de
--    esa misma clase, a la propia si es dirigida, con campos y largos
--    tope. Si un texto o una palabra suena a que la está pasando mal, no
--    se proyecta ni la ven los compañeros, y sale una alerta (docente y
--    dirección), como en la devolución anónima (058).
--  · Emojis: solo los de la botonera y uno cada 2 segundos (los
--    invitados ya lo tenían; los estudiantes podían mandar cualquier
--    texto, que se proyectaba).
--  · El informe de la IA nombra a los chicos: pasa a una tabla que solo
--    leen el docente de la clase y la dirección (en live_sessions lo
--    podía leer cualquier estudiante del curso: RLS filtra filas, no
--    columnas).
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. ¿El texto suena a que la está pasando mal? ──
-- El texto se normaliza (minúsculas, sin tildes, todo lo que no es letra o
-- número pasa a un espacio): "me pega." o "no quiero\nvivir" se escriben así
-- de verdad. Las frases se buscan desde el comienzo de una palabra.

CREATE OR REPLACE FUNCTION texto_normalizado(p_texto TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ' ' || btrim(regexp_replace(
    lower(translate(coalesce(p_texto, ''), 'áéíóúüñÁÉÍÓÚÜÑàèìòù', 'aeiouunAEIOUUNaeiou')),
    '[^a-z0-9]+', ' ', 'g')) || ' '
$$;

-- En primera persona: alguien cuenta que la está pasando mal. Se oculta y se
-- avisa. (No "me toca": en clase es "es mi turno". No las palabras del tema
-- solas: "el acoso escolar" es una respuesta normal en ESI o Historia.)
CREATE OR REPLACE FUNCTION texto_preocupa(p_texto TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT texto_normalizado(p_texto) ~ (' (quiero morir|me quiero matar|me voy a matar|matarme|me mato|suicidarme|me suicido|me voy a suicidar'
    || '|no quiero vivir|no quiero seguir|no quiero estar viv|no aguanto mas|me corto|cortarme|me corte|me lastimo|lastimarme|me autolesion'
    || '|me pega|me golpea|me lastima|me maltrata|me abusa|abusa de mi|abusan de mi|abusaron de mi|abuso de mi|me manosea|me toco sin|me tocan sin'
    || '|me acosa|me amenaza|me hacen bull|me hacen bul|me odio|nadie me quiere|me quiero escapar|me quiero ir de (mi )?casa|ya no quiero estar)')
$$;

-- Más amplia, para la devolución anónima (058): ahí "hay bullying en el
-- curso" es justamente lo que hay que leer, y no se proyecta en ningún lado
CREATE OR REPLACE FUNCTION texto_preocupa_amplio(p_texto TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT texto_preocupa(p_texto)
      OR texto_normalizado(p_texto) ~ ' (suicid|autolesi|abus|acos|bullying|bulling|bulin|violenc|violac|maltrat|me toca |me tocan )'
$$;

-- ── 1. Invitados ──

ALTER TABLE live_guests ADD COLUMN IF NOT EXISTS expulsado_at TIMESTAMPTZ;
-- Por qué salió: 'sacado' (lo sacó el docente) o 'sala_cerrada'
ALTER TABLE live_guests ADD COLUMN IF NOT EXISTS motivo_salida TEXT;

-- Cerrar la sala saca a los que estaban y cambia el código: reabrirla no los
-- devuelve, y un enlace o una foto del QR que circule ya no sirve
CREATE OR REPLACE FUNCTION cerrar_sala_a_invitados()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.guests_enabled AND NOT NEW.guests_enabled THEN
    UPDATE live_guests SET expulsado_at = now(), motivo_salida = 'sala_cerrada'
     WHERE session_id = NEW.id AND expulsado_at IS NULL;
    NEW.join_code := gen_join_code();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cerrar_sala_a_invitados ON live_sessions;
CREATE TRIGGER trg_cerrar_sala_a_invitados
  BEFORE UPDATE OF guests_enabled ON live_sessions
  FOR EACH ROW EXECUTE FUNCTION cerrar_sala_a_invitados();

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
      'reactionsEnabled', ses.reactions_enabled
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
      'config', safe_config, 'status', act.status
    ),
    'myAnswer', mine,
    'results', live_results_json(act.id, false)
  );
END $$;

CREATE OR REPLACE FUNCTION submit_live_guest_response(
  p_token UUID, p_activity UUID, p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g live_guests;
  act live_activities;
BEGIN
  SELECT * INTO g FROM live_guests WHERE token = p_token;
  IF g.id IS NULL OR g.expulsado_at IS NOT NULL THEN RAISE EXCEPTION 'INVITADO_DESCONOCIDO'; END IF;

  SELECT a.* INTO act FROM live_activities a
    JOIN live_sessions s ON s.id = a.session_id
   WHERE a.id = p_activity AND a.session_id = g.session_id AND s.status = 'live' AND s.guests_enabled;

  IF act.id IS NULL OR act.target_student_id IS NOT NULL THEN RAISE EXCEPTION 'ACTIVIDAD_NO_DISPONIBLE'; END IF;
  IF act.status <> 'active' THEN RAISE EXCEPTION 'ACTIVIDAD_CERRADA'; END IF;

  -- Campos, largos y textos que preocupan: los revisa cuidar_respuesta_en_vivo
  INSERT INTO live_responses (activity_id, session_id, guest_id, payload)
  VALUES (p_activity, g.session_id, g.id, coalesce(p_payload, '{}'::jsonb))
  ON CONFLICT (activity_id, guest_id) WHERE guest_id IS NOT NULL
  DO UPDATE SET payload = EXCLUDED.payload, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION send_live_guest_reaction(p_token UUID, p_emoji TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g live_guests;
  ses live_sessions;
BEGIN
  SELECT * INTO g FROM live_guests WHERE token = p_token;
  IF g.id IS NULL OR g.expulsado_at IS NOT NULL THEN RAISE EXCEPTION 'INVITADO_DESCONOCIDO'; END IF;

  SELECT * INTO ses FROM live_sessions
   WHERE id = g.session_id AND status = 'live' AND reactions_enabled AND guests_enabled;
  IF ses.id IS NULL THEN RAISE EXCEPTION 'REACCIONES_CERRADAS'; END IF;

  -- Botonera y freno de 2 segundos: los revisa cuidar_reaccion_en_vivo
  INSERT INTO live_reactions (session_id, guest_id, emoji)
  VALUES (g.session_id, g.id, p_emoji);
END $$;

-- El docente saca a un invitado: no vuelve a ver la clase y se borra lo
-- que mandó (estaba proyectado)
CREATE OR REPLACE FUNCTION sacar_invitado(p_guest UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion UUID;
BEGIN
  UPDATE live_guests g SET expulsado_at = coalesce(g.expulsado_at, now()), motivo_salida = coalesce(g.motivo_salida, 'sacado')
    FROM live_sessions s
   WHERE g.id = p_guest AND s.id = g.session_id AND s.teacher_id = auth.uid()
  RETURNING g.session_id INTO v_sesion;
  IF v_sesion IS NULL THEN
    RAISE EXCEPTION 'Ese invitado no está en una clase tuya.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM live_responses WHERE guest_id = p_guest;
  DELETE FROM live_reactions WHERE guest_id = p_guest;
  -- Código nuevo: con el enlace o el QR viejo no vuelve a entrar con otro
  -- nombre (si está en el aula y escanea el nuevo, sí: ahí, cerrar la sala)
  UPDATE live_sessions SET join_code = gen_join_code() WHERE id = v_sesion;
END $$;

-- Sacar una palabra de la nube (todas las respuestas con esa palabra):
-- la nube muestra palabras agrupadas, no respuestas sueltas
CREATE OR REPLACE FUNCTION sacar_palabra_en_vivo(p_activity UUID, p_palabra TEXT)
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM live_activities a JOIN live_sessions s ON s.id = a.session_id
                 WHERE a.id = p_activity AND s.teacher_id = auth.uid()) THEN
    RAISE EXCEPTION 'Esa actividad no es de una clase tuya.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM live_responses
   WHERE activity_id = p_activity AND lower(btrim(payload->>'palabra')) = lower(btrim(p_palabra));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION sacar_invitado(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sacar_invitado(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION sacar_palabra_en_vivo(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sacar_palabra_en_vivo(UUID, TEXT) TO authenticated;

-- ── 2. Respuestas: lo que entra, lo controla la base ──

CREATE OR REPLACE FUNCTION cuidar_respuesta_en_vivo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act live_activities;
  ses live_sessions;
  p JSONB := coalesce(NEW.payload, '{}'::jsonb);
  clean JSONB := '{}'::jsonb;
  sel JSONB;
  ids TEXT[];
  v_texto TEXT;
BEGIN
  SELECT * INTO act FROM live_activities WHERE id = NEW.activity_id;
  -- La actividad tiene que ser de esa misma clase (antes alcanzaba con que
  -- la clase fuera del curso del estudiante)
  IF act.id IS NULL OR act.session_id IS DISTINCT FROM NEW.session_id THEN
    RAISE EXCEPTION 'ACTIVIDAD_NO_DISPONIBLE' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO ses FROM live_sessions WHERE id = act.session_id;
  IF ses.status IS DISTINCT FROM 'live' OR act.status <> 'active' THEN
    RAISE EXCEPTION 'ACTIVIDAD_CERRADA' USING ERRCODE = 'P0001';
  END IF;
  -- Dirigida: solo contesta ese estudiante
  IF act.target_student_id IS NOT NULL AND NEW.student_id IS DISTINCT FROM act.target_student_id THEN
    RAISE EXCEPTION 'ACTIVIDAD_NO_DISPONIBLE' USING ERRCODE = '42501';
  END IF;

  -- Solo lo que corresponde al tipo de pregunta, y con tope: lo que se
  -- escribe puede terminar proyectado. Las opciones, solo las de la pregunta
  -- (si no, un texto cualquiera viaja como "opción" a todos los celulares).
  ids := ARRAY(SELECT o->>'id' FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(act.config->'options') = 'array' THEN act.config->'options' ELSE '[]'::jsonb END) o);
  IF act.kind IN ('quiz', 'encuesta') AND (p->>'opcion') = ANY (ids) THEN
    clean := jsonb_build_object('opcion', p->>'opcion');
  ELSIF act.kind = 'chips' AND jsonb_typeof(p->'selected') = 'array' THEN
    SELECT coalesce(jsonb_agg(DISTINCT v), '[]'::jsonb) INTO sel
      FROM jsonb_array_elements_text(p->'selected') v WHERE v = ANY (ids);
    clean := jsonb_build_object('selected', sel);
  ELSIF act.kind = 'checkin' AND p->>'feeling' IN ('genial', 'bien', 'neutral', 'confundido', 'frustrado') THEN
    clean := jsonb_build_object('feeling', p->>'feeling');
  ELSIF act.kind = 'texto' AND btrim(coalesce(p->>'texto', '')) <> '' THEN
    clean := jsonb_build_object('texto', left(btrim(p->>'texto'), 300));
  ELSIF act.kind = 'nube' AND btrim(coalesce(p->>'palabra', '')) <> '' THEN
    clean := jsonb_build_object('palabra', left(btrim(p->>'palabra'), 30));
  END IF;
  IF clean = '{}'::jsonb THEN
    RAISE EXCEPTION 'RESPUESTA_VACIA' USING ERRCODE = '22023';
  END IF;

  -- Las fechas las pone la base (ordenan los textos y alimentan las señales)
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();

  v_texto := concat_ws(' ', clean->>'texto', clean->>'palabra');
  IF v_texto <> '' AND texto_preocupa(v_texto) THEN
    -- No se proyecta ni la ven los compañeros (live_results_json); el
    -- aviso sale de avisar_respuesta_que_preocupa, con la fila ya guardada
    clean := clean || '{"oculta": true}'::jsonb;
  END IF;

  NEW.payload := clean;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cuidar_respuesta_en_vivo ON live_responses;
-- Cualquier cambio (también de fechas) pasa por acá
CREATE TRIGGER trg_cuidar_respuesta_en_vivo
  BEFORE INSERT OR UPDATE ON live_responses
  FOR EACH ROW EXECUTE FUNCTION cuidar_respuesta_en_vivo();

-- Después de guardar (no antes: un "insertar o actualizar" corre el
-- trigger de insertar aunque termine actualizando, y avisaría dos veces).
-- Una sola alerta por chico y por clase: cada texto nuevo que preocupa se
-- SUMA a esa alerta (y la vuelve a marcar sin leer); nunca se descarta. La
-- dirección se entera con la primera. Reenviar lo mismo no repite nada.
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
       AND a.created_at >= ses.created_at
     ORDER BY a.created_at DESC LIMIT 1;
  ELSE
    -- Un invitado sin cuenta: una alerta por clase con todo lo de los invitados
    v_quien := 'El invitado "' || coalesce((SELECT g.display_name FROM live_guests g WHERE g.id = NEW.guest_id), 'sin nombre') || '"';
    v_titulo := 'Un invitado escribió algo que preocupa en la clase en vivo';
    SELECT a.id INTO v_alerta FROM alerts a
     WHERE a.title = v_titulo AND a.teacher_id = ses.teacher_id AND a.created_at >= ses.created_at
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

DROP TRIGGER IF EXISTS trg_avisar_respuesta_que_preocupa ON live_responses;
CREATE TRIGGER trg_avisar_respuesta_que_preocupa
  AFTER INSERT OR UPDATE OF payload ON live_responses
  FOR EACH ROW EXECUTE FUNCTION avisar_respuesta_que_preocupa();

-- ── 3. Emojis: los de la botonera, uno cada 2 segundos ──

CREATE OR REPLACE FUNCTION cuidar_reaccion_en_vivo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ultima TIMESTAMPTZ;
BEGIN
  IF NEW.emoji IS NULL OR NEW.emoji NOT IN ('👏', '💡', '😮', '🔥', '🐢', '❓') THEN
    RAISE EXCEPTION 'EMOJI_NO_PERMITIDO' USING ERRCODE = '22023';
  END IF;
  -- La hora la pone la base (si no, mandando una hora vieja se saltea el
  -- freno) y de a uno por autor (dos pedidos a la vez no pasan los dos)
  NEW.created_at := now();
  PERFORM pg_advisory_xact_lock(hashtext('reaccion|' || coalesce(NEW.student_id::text, NEW.guest_id::text, '')));
  SELECT max(created_at) INTO ultima FROM live_reactions
   WHERE session_id = NEW.session_id
     AND ((NEW.student_id IS NOT NULL AND student_id = NEW.student_id)
       OR (NEW.guest_id IS NOT NULL AND guest_id = NEW.guest_id));
  -- Muy seguido: no se guarda (sin error, como el freno de la 012)
  IF ultima IS NOT NULL AND ultima > now() - interval '2 seconds' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cuidar_reaccion_en_vivo ON live_reactions;
CREATE TRIGGER trg_cuidar_reaccion_en_vivo
  BEFORE INSERT ON live_reactions
  FOR EACH ROW EXECUTE FUNCTION cuidar_reaccion_en_vivo();

-- ── 4. Resultados: lo retenido no viaja ──
-- Ni el texto ni QUIÉN lo escribió: el panel del docente puede estar en la
-- pantalla del aula. Al docente (y a la dirección) solo le llega cuántas
-- respuestas se retuvieron; el texto y el nombre van por la alerta. A
-- compañeros e invitados ni eso, ni en la cuenta de "respondieron" (con
-- una pregunta dirigida, "1 de N" con el tablero vacío delataba al chico).

CREATE OR REPLACE FUNCTION live_results_json(p_activity UUID, p_include_names BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act live_activities;
  ses live_sessions;
  participants INT;
  responded INT;
  counts JSONB;
  texts JSONB;
  words JSONB;
  retenidas INT;
BEGIN
  SELECT * INTO act FROM live_activities WHERE id = p_activity;
  IF act.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO ses FROM live_sessions WHERE id = act.session_id;

  IF ses.guests_enabled THEN
    SELECT count(*) INTO participants
      FROM live_guests
     WHERE session_id = ses.id AND last_seen_at > now() - interval '2 minutes' AND expulsado_at IS NULL;
  ELSE
    SELECT count(*) INTO participants FROM students WHERE course_id = ses.course_id;
  END IF;

  SELECT count(*) FILTER (WHERE payload ? 'oculta'), count(*) FILTER (WHERE p_include_names OR NOT payload ? 'oculta')
    INTO retenidas, responded
    FROM live_responses WHERE activity_id = p_activity;
  participants := GREATEST(participants, responded);

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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'name', CASE WHEN p_include_names
                 THEN COALESCE(s.first_name || ' ' || s.last_name, g.display_name)
                 ELSE NULL END,
    'text', left(r.payload->>'texto', 300)
  ) ORDER BY r.updated_at), '[]'::jsonb)
  INTO texts
  FROM live_responses r
  LEFT JOIN students s ON s.id = r.student_id
  LEFT JOIN live_guests g ON g.id = r.guest_id
  WHERE r.activity_id = p_activity
    AND r.payload ? 'texto' AND btrim(r.payload->>'texto') <> ''
    AND NOT r.payload ? 'oculta';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('word', w, 'n', n) ORDER BY n DESC), '[]'::jsonb)
  INTO words
  FROM (
    SELECT lower(btrim(payload->>'palabra')) AS w, count(*) AS n
      FROM live_responses
     WHERE activity_id = p_activity AND payload ? 'palabra' AND btrim(payload->>'palabra') <> ''
       AND NOT payload ? 'oculta'
     GROUP BY 1 ORDER BY n DESC LIMIT 40
  ) t;

  RETURN jsonb_build_object(
    'activityId', act.id,
    'kind', act.kind,
    'status', act.status,
    'courseTotal', participants,
    'responded', responded,
    'counts', counts,
    'texts', texts,
    'words', words,
    -- Solo para el docente y la dirección: cuántas se retuvieron, sin quién
    'retenidas', CASE WHEN p_include_names THEN retenidas ELSE 0 END
  );
END $$;

REVOKE EXECUTE ON FUNCTION live_results_json(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ── 4b. La devolución anónima (058), con el detector arreglado ──
-- Tenía la misma lista adentro, con los mismos huecos ("me pega." no la
-- disparaba). Igual que en la 058, salvo esa línea.

CREATE OR REPLACE FUNCTION dar_devolucion(p_origen TEXT, p_ref UUID, p_valor INT, p_comentario TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st UUID := auth_student_id();
  v_teacher UUID;
  v_subject UUID;
  v_course UUID;
  v_school UUID;
  v_comentario TEXT := nullif(left(trim(coalesce(p_comentario, '')), 300), '');
  v_riesgo BOOLEAN := false;
  v_avisados INT;
BEGIN
  IF v_st IS NULL THEN RAISE EXCEPTION 'Solo los estudiantes dan devoluciones'; END IF;
  IF p_valor NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  IF p_origen = 'actividad' THEN
    -- Una tarea que entregó
    SELECT a.teacher_id, a.subject_id, a.course_id, a.school_id
      INTO v_teacher, v_subject, v_course, v_school
    FROM activities a
    WHERE a.id = p_ref
      AND EXISTS (SELECT 1 FROM activity_submissions s
                  WHERE s.activity_id = a.id AND s.student_id = v_st AND s.status IN ('submitted', 'graded'));
  ELSIF p_origen = 'clase_en_vivo' THEN
    -- Una clase en vivo de su curso en la que estuvo
    SELECT ls.teacher_id, ls.subject_id, ls.course_id, ls.school_id
      INTO v_teacher, v_subject, v_course, v_school
    FROM live_sessions ls
    WHERE ls.id = p_ref
      AND ls.course_id = auth_student_course_id()
      AND EXISTS (SELECT 1 FROM live_presence lp WHERE lp.session_id = ls.id AND lp.student_id = v_st);
  ELSIF p_origen = 'clase_enviada' THEN
    -- Una clase que le mandaron
    SELECT ce.teacher_id, ce.subject_id, ce.course_id, ce.school_id
      INTO v_teacher, v_subject, v_course, v_school
    FROM clases_enviadas ce
    WHERE ce.id = p_ref
      AND student_sees_material(ce.subject_id, ce.course_id, ce.teacher_id);
  ELSE
    RAISE EXCEPTION 'Origen inválido';
  END IF;

  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa clase o tarea para vos';
  END IF;

  -- ¿El comentario suena a que la está pasando mal? (sin tildes, minúsculas)
  IF v_comentario IS NOT NULL THEN
    -- 067: texto normalizado (puntuación, saltos de línea) y lista amplia
    v_riesgo := texto_preocupa_amplio(v_comentario);
  END IF;

  INSERT INTO devoluciones (school_id, teacher_id, subject_id, course_id, student_id, origen, ref_id, valor, comentario)
  VALUES (v_school, v_teacher, v_subject, v_course, v_st, p_origen, p_ref, p_valor,
          CASE WHEN v_riesgo THEN NULL ELSE v_comentario END)
  ON CONFLICT (student_id, origen, ref_id)
  DO UPDATE SET valor = EXCLUDED.valor, comentario = EXCLUDED.comentario, created_at = now();

  IF v_riesgo THEN
    -- A la dirección, sin nombre: el curso, la materia y lo que escribió.
    -- Remitente: el docente de esa clase (la columna no admite vacío, y poner
    -- al chico rompería el anonimato).
    v_avisados := notificar_a_direccion(
      v_school, v_teacher,
      'Un estudiante escribió algo que preocupa',
      'En una devolución anónima de ' || coalesce((SELECT name FROM courses WHERE id = v_course), 'un curso')
        || ' (' || coalesce((SELECT name FROM subjects WHERE id = v_subject), 'una materia') || ') un estudiante escribió: "'
        || v_comentario || '". Es anónimo: conviene una charla con el curso o con su preceptoría.'
    );
    -- Sin directivos cargados, que no quede sin nadie que lo lea: al docente
    IF COALESCE(v_avisados, 0) = 0 THEN
      INSERT INTO notifications (from_user_id, to_user_id, title, message, priority, school_id)
      VALUES (v_teacher, v_teacher, 'Un estudiante escribió algo que preocupa',
              'En una devolución anónima un estudiante de tu curso escribió: "' || v_comentario
              || '". Es anónimo: conviene una charla con el curso y avisar a la escuela.', 'high', v_school);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'riesgo', v_riesgo);
END;
$$;

REVOKE EXECUTE ON FUNCTION dar_devolucion(TEXT, UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dar_devolucion(TEXT, UUID, INT, TEXT) TO authenticated;

-- ── 5. El informe de la IA, aparte ──

CREATE TABLE IF NOT EXISTS live_session_informes (
  session_id UUID PRIMARY KEY REFERENCES live_sessions(id) ON DELETE CASCADE,
  informe    TEXT NOT NULL CHECK (char_length(informe) BETWEEN 1 AND 20000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE live_session_informes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON live_session_informes FROM anon;

DROP POLICY IF EXISTS "Teacher manages report of own session" ON live_session_informes;
CREATE POLICY "Teacher manages report of own session"
  ON live_session_informes FOR ALL
  USING (EXISTS (SELECT 1 FROM live_sessions s WHERE s.id = live_session_informes.session_id AND s.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM live_sessions s WHERE s.id = live_session_informes.session_id AND s.teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Directors read school session reports" ON live_session_informes;
CREATE POLICY "Directors read school session reports"
  ON live_session_informes FOR SELECT
  USING (auth_role() = 'director' AND EXISTS (
    SELECT 1 FROM live_sessions s WHERE s.id = live_session_informes.session_id AND s.school_id = auth_school_id()));

-- Lo que ya había pasa a la tabla nueva y la columna se va
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'live_sessions' AND column_name = 'ai_summary') THEN
    EXECUTE $q$
      INSERT INTO live_session_informes (session_id, informe)
      SELECT id, left(ai_summary, 20000) FROM live_sessions WHERE coalesce(btrim(ai_summary), '') <> ''
      ON CONFLICT (session_id) DO NOTHING
    $q$;
    EXECUTE 'ALTER TABLE live_sessions DROP COLUMN ai_summary';
  END IF;
END $$;

-- El resumen (042), igual, con el informe de la tabla nueva
CREATE OR REPLACE FUNCTION live_session_summary(p_session UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s live_sessions%ROWTYPE;
  v_fin TIMESTAMPTZ;
  r JSONB;
BEGIN
  SELECT * INTO s FROM live_sessions WHERE id = p_session;
  IF NOT FOUND OR s.teacher_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;
  v_fin := COALESCE(s.ended_at, now());

  WITH
  curso AS (
    SELECT st.id, st.first_name, st.last_name FROM students st WHERE st.course_id = s.course_id
  ),
  acts AS (
    SELECT a.* FROM live_activities a WHERE a.session_id = s.id
  ),
  resp AS (
    SELECT lr.*, a.kind, a.config
    FROM live_responses lr JOIN acts a ON a.id = lr.activity_id
  ),
  reac AS (
    SELECT * FROM live_reactions WHERE session_id = s.id
  ),
  medallas AS (
    SELECT sa.* FROM student_awards sa
    WHERE sa.teacher_id = s.teacher_id
      AND sa.student_id IN (SELECT id FROM curso)
      AND sa.created_at BETWEEN s.created_at AND v_fin
  )
  SELECT jsonb_build_object(
    'sesion', jsonb_build_object(
      'id', s.id, 'titulo', s.title, 'inicio', s.created_at, 'fin', s.ended_at,
      'minutos', GREATEST(1, round(extract(epoch FROM (v_fin - s.created_at)) / 60)::int),
      'ai_summary', (SELECT i.informe FROM live_session_informes i WHERE i.session_id = s.id)
    ),
    'material', (
      SELECT CASE
        WHEN s.class_id IS NOT NULL THEN
          (SELECT jsonb_build_object('tipo', 'tema', 'titulo', c.title, 'unidad', u.title)
           FROM planning_classes c JOIN planning_units u ON u.id = c.unit_id WHERE c.id = s.class_id)
        WHEN s.material_id IS NOT NULL THEN
          (SELECT jsonb_build_object('tipo', 'material', 'titulo', m.title)
           FROM library_materials m WHERE m.id = s.material_id)
      END
    ),
    'totales', jsonb_build_object(
      'curso', (SELECT count(*) FROM curso),
      'conectados', (SELECT count(*) FROM live_presence p WHERE p.session_id = s.id AND p.student_id IN (SELECT id FROM curso)),
      'participaron', (SELECT count(DISTINCT student_id) FROM resp WHERE student_id IS NOT NULL),
      'actividades', (SELECT count(*) FROM acts),
      'invitados', (SELECT count(*) FROM live_guests g WHERE g.session_id = s.id),
      'medallas', (SELECT count(*) FROM medallas)
    ),
    'actividades', (
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'orden')::int), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'orden', row_number() OVER (ORDER BY a.created_at),
          'tipo', a.kind,
          'pregunta', a.config->>'question',
          'dirigida', a.target_student_id IS NOT NULL,
          'grupal', COALESCE((a.config->>'groupMode')::boolean, false),
          'respondieron', (SELECT count(*) FROM resp WHERE resp.activity_id = a.id),
          'aciertos', CASE WHEN a.kind = 'quiz' AND a.config ? 'correctId' THEN
              (SELECT count(*) FROM resp WHERE resp.activity_id = a.id AND resp.payload->>'opcion' = a.config->>'correctId')
            END,
          'correcta', CASE WHEN a.kind = 'quiz' THEN
              (SELECT o->>'label' FROM jsonb_array_elements(a.config->'options') o WHERE o->>'id' = a.config->>'correctId')
            END
        ) AS x
        FROM acts a
      ) t
    ),
    'alumnos', (
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'respuestas')::int DESC, x->>'nombre'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', c.id,
          'nombre', c.first_name || ' ' || c.last_name,
          'conectado', EXISTS (SELECT 1 FROM live_presence p WHERE p.session_id = s.id AND p.student_id = c.id),
          'respuestas', (SELECT count(*) FROM resp WHERE resp.student_id = c.id),
          'preguntas', (SELECT count(*) FROM resp WHERE resp.student_id = c.id AND resp.kind = 'quiz' AND resp.config ? 'correctId'),
          'aciertos', (SELECT count(*) FROM resp WHERE resp.student_id = c.id AND resp.kind = 'quiz'
                         AND resp.payload->>'opcion' = resp.config->>'correctId'),
          'reacciones', (SELECT count(*) FROM reac WHERE reac.student_id = c.id),
          'medallas', (SELECT count(*) FROM medallas WHERE medallas.student_id = c.id)
        ) AS x
        FROM curso c
      ) t
    ),
    'reacciones', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('emoji', emoji, 'n', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT emoji, count(*) AS n FROM reac GROUP BY emoji) t
    ),
    'animo', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('estado', estado, 'n', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT payload->>'feeling' AS estado, count(*) AS n FROM resp
            WHERE kind = 'checkin' AND payload ? 'feeling' GROUP BY 1) t
    ),
    'medallas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('medalla', badge_code, 'n', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT badge_code, count(*) AS n FROM medallas GROUP BY badge_code) t
    )
  ) INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION live_session_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_session_summary(UUID) TO authenticated;

-- Comprobación: una fila, todo true
SELECT
  NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'live_sessions' AND column_name = 'ai_summary') AS informe_fuera_de_la_sesion,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cuidar_respuesta_en_vivo') AS respuestas_cuidadas,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cuidar_reaccion_en_vivo') AS emojis_cuidados,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_guests' AND column_name = 'expulsado_at') AS invitados_se_sacan,
  NOT has_function_privilege('anon', 'sacar_invitado(uuid)', 'EXECUTE') AS sacar_sin_anonimos,
  texto_preocupa('mi papá me pega.') AND texto_preocupa(E'no quiero\nvivir') AND texto_preocupa('Nadie  me quiere!!')
    AND NOT texto_preocupa('mañana me toca exponer') AND NOT texto_preocupa('el acoso escolar es un problema')
    AND texto_preocupa_amplio('hay bullying en el curso') AS detecta;
