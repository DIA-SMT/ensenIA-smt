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

-- ── 0. ¿El texto suena a que la está pasando mal? (misma lista que la 058) ──

CREATE OR REPLACE FUNCTION texto_preocupa(p_texto TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(
    lower(translate(p_texto, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) || ' '
      ~ '(quiero morir|me quiero matar|matarme|suicid|no quiero vivir|me corto|cortarme|autolesi|lastimarme|me lastimo|me pegan|me pega |me golpea|abusa|abuso|me acosa|acoso|bullying|me tocan|me toca |me amenaza|me odio|nadie me quiere)',
    false)
$$;

-- ── 1. Invitados ──

ALTER TABLE live_guests ADD COLUMN IF NOT EXISTS expulsado_at TIMESTAMPTZ;

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
    RETURN jsonb_build_object('status', 'expulsado');
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
BEGIN
  UPDATE live_guests g SET expulsado_at = coalesce(g.expulsado_at, now())
    FROM live_sessions s
   WHERE g.id = p_guest AND s.id = g.session_id AND s.teacher_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese invitado no está en una clase tuya.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM live_responses WHERE guest_id = p_guest;
  DELETE FROM live_reactions WHERE guest_id = p_guest;
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

  -- Solo estos campos y con tope: lo que se escribe puede terminar proyectado
  IF p ? 'opcion' THEN
    clean := clean || jsonb_build_object('opcion', left(p->>'opcion', 40));
  END IF;
  IF p ? 'feeling' AND p->>'feeling' IN ('genial', 'bien', 'neutral', 'confundido', 'frustrado') THEN
    clean := clean || jsonb_build_object('feeling', p->>'feeling');
  END IF;
  IF p ? 'texto' THEN
    clean := clean || jsonb_build_object('texto', left(btrim(p->>'texto'), 300));
  END IF;
  IF p ? 'palabra' THEN
    clean := clean || jsonb_build_object('palabra', left(btrim(p->>'palabra'), 30));
  END IF;
  IF p ? 'selected' AND jsonb_typeof(p->'selected') = 'array' THEN
    SELECT jsonb_agg(v) INTO sel FROM (
      SELECT left(value, 40) AS v FROM jsonb_array_elements_text(p->'selected') LIMIT 20
    ) t;
    clean := clean || jsonb_build_object('selected', coalesce(sel, '[]'::jsonb));
  END IF;
  IF clean = '{}'::jsonb THEN
    RAISE EXCEPTION 'RESPUESTA_VACIA' USING ERRCODE = '22023';
  END IF;

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
CREATE TRIGGER trg_cuidar_respuesta_en_vivo
  BEFORE INSERT OR UPDATE OF payload, activity_id, session_id, student_id, guest_id ON live_responses
  FOR EACH ROW EXECUTE FUNCTION cuidar_respuesta_en_vivo();

-- Después de guardar (no antes: un "insertar o actualizar" corre el
-- trigger de insertar aunque termine actualizando, y avisaría dos veces).
-- Una alerta por texto nuevo: reenviar lo mismo o cambiar de opción no la repite.
CREATE OR REPLACE FUNCTION avisar_respuesta_que_preocupa()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ses live_sessions;
  st RECORD;
  v_texto TEXT := concat_ws(' ', NEW.payload->>'texto', NEW.payload->>'palabra');
  v_alerta UUID;
BEGIN
  IF NOT NEW.payload ? 'oculta' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.payload ? 'oculta'
     AND concat_ws(' ', OLD.payload->>'texto', OLD.payload->>'palabra') = v_texto THEN
    RETURN NULL;
  END IF;
  SELECT * INTO ses FROM live_sessions WHERE id = NEW.session_id;
  IF NEW.student_id IS NOT NULL THEN
    SELECT s.id, s.first_name, s.last_name INTO st FROM students s WHERE s.id = NEW.student_id;
    INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
    VALUES ('danger', 'system', 'Escribió algo que preocupa en la clase en vivo',
            st.first_name || ' ' || st.last_name || ' escribió en "' || ses.title || '": "' || left(v_texto, 300)
              || '". No se mostró en el proyector ni a sus compañeros.',
            'Hoy', ses.teacher_id, ses.school_id)
    RETURNING id INTO v_alerta;
    INSERT INTO alert_students (alert_id, student_id) VALUES (v_alerta, st.id);
    PERFORM notificar_a_direccion(
      ses.school_id, ses.teacher_id,
      'Un estudiante escribió algo que preocupa',
      st.first_name || ' ' || st.last_name || ' escribió en la clase en vivo "' || ses.title || '": "'
        || left(v_texto, 300) || '". Conviene una charla con el estudiante.');
  ELSE
    -- Un invitado sin cuenta: al docente, que está en la clase
    INSERT INTO notifications (from_user_id, to_user_id, title, message, priority, school_id)
    VALUES (ses.teacher_id, ses.teacher_id, 'Un invitado escribió algo que preocupa',
            'En "' || ses.title || '" un invitado escribió: "' || left(v_texto, 300)
              || '". No se proyectó. Podés sacarlo de la sala desde el panel.',
            'high', ses.school_id);
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

-- ── 4. Resultados: lo oculto no se proyecta ni lo ven los compañeros ──
-- Al docente (y a la dirección) le llega marcado y sin el texto: su panel
-- puede estar en la pantalla del aula. El texto le llega por la alerta.

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

  SELECT count(*) INTO responded FROM live_responses WHERE activity_id = p_activity;
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
    'text', CASE WHEN r.payload ? 'oculta' THEN NULL ELSE left(r.payload->>'texto', 300) END,
    'oculta', r.payload ? 'oculta'
  ) ORDER BY r.updated_at), '[]'::jsonb)
  INTO texts
  FROM live_responses r
  LEFT JOIN students s ON s.id = r.student_id
  LEFT JOIN live_guests g ON g.id = r.guest_id
  WHERE r.activity_id = p_activity
    AND r.payload ? 'texto' AND btrim(r.payload->>'texto') <> ''
    AND (p_include_names OR NOT r.payload ? 'oculta');

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
    'words', words
  );
END $$;

REVOKE EXECUTE ON FUNCTION live_results_json(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

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
  texto_preocupa('nadie me quiere') AND NOT texto_preocupa('me encanta esta clase') AS detecta;
