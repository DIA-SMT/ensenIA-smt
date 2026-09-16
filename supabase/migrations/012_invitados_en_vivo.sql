-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 012: invitados en la clase en vivo
--
--  Hasta acá, para responder en vivo hacía falta cuenta de auth y una
--  fila en students atada al curso. En una presentación, una jornada o
--  una visita eso no existe: la gente tiene un celular y nada más.
--
--  Esta migración agrega el ingreso por código: la sesión tiene un
--  código corto, se proyecta como QR, y el que escanea entra poniendo
--  su nombre. Sin cuenta, sin instalar nada.
--
--  Decisión de fondo: NO usamos el login anónimo de Supabase. El
--  trigger handle_new_user (001) crea un profiles con rol 'docente'
--  ante cualquier alta en auth.users — sesenta personas escaneando
--  serían sesenta docentes fantasma en el Panel de Dirección. En vez
--  de eso, todo el acceso de invitados pasa por funciones
--  SECURITY DEFINER que validan un token: la anon key no toca las
--  tablas directamente y no hace falta abrir ninguna policy.
-- ═══════════════════════════════════════════════

-- ══════════════════════════════════════
-- 1. Código de sala
-- ══════════════════════════════════════

ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS join_code TEXT;
-- El docente decide si abre la sala a invitados (default: no).
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS guests_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_join_code
  ON live_sessions(join_code) WHERE join_code IS NOT NULL;

-- Alfabeto sin caracteres que se confunden al dictarlos o tipearlos
-- (nada de O/0 ni I/1): el código se proyecta y alguien lo va a escribir
-- a mano porque la cámara no le lee el QR.
CREATE OR REPLACE FUNCTION gen_join_code()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
  i INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::INT, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM live_sessions WHERE join_code = code);
  END LOOP;
  RETURN code;
END $$;

-- Ojo: revocar solo a PUBLIC no alcanza. Supabase le da EXECUTE a anon y
-- authenticated por default privileges, asi que hay que nombrarlos.
REVOKE EXECUTE ON FUNCTION gen_join_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION live_sessions_assign_code()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.join_code IS NULL THEN
    NEW.join_code := gen_join_code();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS live_sessions_code ON live_sessions;
CREATE TRIGGER live_sessions_code BEFORE INSERT ON live_sessions
  FOR EACH ROW EXECUTE FUNCTION live_sessions_assign_code();

-- Las sesiones que ya existen también necesitan código.
UPDATE live_sessions SET join_code = gen_join_code() WHERE join_code IS NULL;

-- ══════════════════════════════════════
-- 2. Invitados
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS live_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  -- Credencial del dispositivo: queda en el localStorage del celular.
  -- Si recarga la página, sigue siendo el mismo participante.
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_guests_session ON live_guests(session_id);
CREATE INDEX IF NOT EXISTS live_guests_seen ON live_guests(session_id, last_seen_at DESC);

-- ── Respuestas y reacciones: ahora el autor es un estudiante O un invitado ──

ALTER TABLE live_responses ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE live_responses ADD COLUMN IF NOT EXISTS guest_id UUID
  REFERENCES live_guests(id) ON DELETE CASCADE;

ALTER TABLE live_responses DROP CONSTRAINT IF EXISTS live_responses_one_author;
ALTER TABLE live_responses ADD CONSTRAINT live_responses_one_author
  CHECK (num_nonnulls(student_id, guest_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS live_responses_guest_unique
  ON live_responses(activity_id, guest_id) WHERE guest_id IS NOT NULL;

ALTER TABLE live_reactions ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE live_reactions ADD COLUMN IF NOT EXISTS guest_id UUID
  REFERENCES live_guests(id) ON DELETE CASCADE;

ALTER TABLE live_reactions DROP CONSTRAINT IF EXISTS live_reactions_one_author;
ALTER TABLE live_reactions ADD CONSTRAINT live_reactions_one_author
  CHECK (num_nonnulls(student_id, guest_id) = 1);

-- ── RLS: los invitados nunca tocan estas tablas (van por las funciones).
-- Acá solo definimos quién los VE desde adentro de la app. ──

ALTER TABLE live_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers view guests of own sessions" ON live_guests;
CREATE POLICY "Teachers view guests of own sessions"
  ON live_guests FOR SELECT
  USING (session_id IN (SELECT id FROM live_sessions WHERE teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Directors view school guests" ON live_guests;
CREATE POLICY "Directors view school guests"
  ON live_guests FOR SELECT
  USING (
    auth_role() = 'director'
    AND session_id IN (SELECT id FROM live_sessions WHERE school_id = auth_school_id())
  );

-- Con invitados anónimos, lo que escriben en "respuesta libre" y "nube
-- de palabras" termina proyectado en una pantalla frente a una sala.
-- El docente tiene que poder borrar una respuesta sin cortar la clase.
DROP POLICY IF EXISTS "Teachers delete responses of own sessions" ON live_responses;
CREATE POLICY "Teachers delete responses of own sessions"
  ON live_responses FOR DELETE
  USING (session_id IN (SELECT id FROM live_sessions WHERE teacher_id = auth.uid()));
GRANT DELETE ON live_responses TO authenticated;

-- ══════════════════════════════════════
-- 3. Agregación de resultados (compartida)
--
-- Antes esto vivía suelto dentro de get_live_results. Ahora lo usan
-- dos caminos — el de la app (con sesión) y el de los invitados (sin
-- sesión) — y tienen que mostrar exactamente el mismo número en la
-- pantalla proyectada y en el celular.
-- ══════════════════════════════════════

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

  -- El denominador es la gente que está en la sala. Con invitados,
  -- contar los estudiantes del curso mostraría "40 de 8" en el
  -- proyector: el curso no tiene nada que ver con quién vino.
  IF ses.guests_enabled THEN
    SELECT count(*) INTO participants
      FROM live_guests
     WHERE session_id = ses.id AND last_seen_at > now() - interval '2 minutes';
  ELSE
    SELECT count(*) INTO participants FROM students WHERE course_id = ses.course_id;
  END IF;

  SELECT count(*) INTO responded FROM live_responses WHERE activity_id = p_activity;
  -- Alguien puede responder y cerrar el navegador: nunca mostramos
  -- "42 de 39", que es justo lo que se ve desde el fondo de la sala.
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

  -- Devolvemos el id de cada texto para que el docente pueda borrar
  -- uno puntual sin frenar la clase.
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
    AND r.payload ? 'texto' AND btrim(r.payload->>'texto') <> '';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('word', w, 'n', n) ORDER BY n DESC), '[]'::jsonb)
  INTO words
  FROM (
    SELECT lower(btrim(payload->>'palabra')) AS w, count(*) AS n
      FROM live_responses
     WHERE activity_id = p_activity AND payload ? 'palabra' AND btrim(payload->>'palabra') <> ''
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

-- Sin esto queda expuesta con p_include_names a eleccion del que llama:
-- devolveria nombre y apellido junto al texto libre de cada alumno.
REVOKE EXECUTE ON FUNCTION live_results_json(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Reescrita: delega la agregación y suma a dirección, que en la 010
-- recibió acceso a las tablas pero seguía rebotando contra este RPC.
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
  is_director BOOLEAN;
BEGIN
  SELECT * INTO act FROM live_activities WHERE id = p_activity;
  IF act.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO ses FROM live_sessions WHERE id = act.session_id;

  is_teacher  := (ses.teacher_id = auth.uid());
  is_student  := (ses.course_id = auth_student_course_id());
  is_director := (auth_role() = 'director' AND ses.school_id = auth_school_id());

  IF NOT is_teacher AND NOT is_student AND NOT is_director THEN
    RAISE EXCEPTION 'Sin acceso a esta actividad';
  END IF;

  RETURN live_results_json(p_activity, is_teacher OR is_director);
END $$;

-- ══════════════════════════════════════
-- 4. Puerta de entrada de los invitados
--
-- Estas cuatro funciones son lo único que la anon key puede llamar.
-- Validan el token en cada llamada: no hay policy abierta ni tabla
-- expuesta. Si mañana sacamos el modo invitados, se revocan cuatro
-- GRANTs y no queda nada colgando.
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION join_live_session(p_code TEXT, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ses live_sessions;
  g live_guests;
  clean_name TEXT;
  cupo INT;
BEGIN
  SELECT * INTO ses FROM live_sessions
   WHERE join_code = upper(btrim(p_code))
     AND status = 'live'
     AND guests_enabled;

  IF ses.id IS NULL THEN
    RAISE EXCEPTION 'SALA_NO_DISPONIBLE';
  END IF;

  SELECT count(*) INTO cupo FROM live_guests WHERE session_id = ses.id;
  IF cupo >= 300 THEN
    RAISE EXCEPTION 'SALA_LLENA';
  END IF;

  clean_name := left(btrim(coalesce(p_name, '')), 40);
  IF clean_name = '' THEN clean_name := 'Invitado'; END IF;

  INSERT INTO live_guests (session_id, display_name)
  VALUES (ses.id, clean_name)
  RETURNING * INTO g;

  RETURN jsonb_build_object(
    'token', g.token,
    'guestId', g.id,
    'sessionId', ses.id,
    'title', ses.title,
    'displayName', g.display_name
  );
END $$;

-- Un solo llamado por poll: estado + actividad + resultados + mi respuesta.
-- El celular de un invitado puede estar con datos móviles flojos, así que
-- todo lo que necesita viene junto.
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

  -- Marca de presencia: alimenta el contador de conectados del proyector.
  -- Solo escribimos si la marca ya quedó vieja: con 60 celulares
  -- polleando cada 2,5s serían 24 UPDATE por segundo sobre la misma
  -- tabla, todos para no cambiar nada.
  IF g.last_seen_at < now() - interval '30 seconds' THEN
    UPDATE live_guests SET last_seen_at = now() WHERE id = g.id;
  END IF;

  SELECT * INTO ses FROM live_sessions WHERE id = g.session_id;
  IF ses.status <> 'live' THEN
    RETURN jsonb_build_object('status', 'ended');
  END IF;

  SELECT * INTO act FROM live_activities
   WHERE session_id = ses.id ORDER BY created_at DESC LIMIT 1;

  IF act.id IS NULL OR act.status = 'closed' THEN
    RETURN jsonb_build_object(
      'status', 'idle',
      'title', ses.title,
      'reactionsEnabled', ses.reactions_enabled
    );
  END IF;

  -- La respuesta correcta no viaja al celular hasta que el docente
  -- la revela: si va en el JSON, cualquiera la lee desde el navegador.
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
    -- Sin nombres: entre participantes siempre es anónimo.
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
  clean JSONB := '{}'::jsonb;
  sel JSONB;
BEGIN
  SELECT * INTO g FROM live_guests WHERE token = p_token;
  IF g.id IS NULL THEN RAISE EXCEPTION 'INVITADO_DESCONOCIDO'; END IF;

  SELECT a.* INTO act FROM live_activities a
    JOIN live_sessions s ON s.id = a.session_id
   WHERE a.id = p_activity AND a.session_id = g.session_id AND s.status = 'live';

  IF act.id IS NULL THEN RAISE EXCEPTION 'ACTIVIDAD_NO_DISPONIBLE'; END IF;
  IF act.status <> 'active' THEN RAISE EXCEPTION 'ACTIVIDAD_CERRADA'; END IF;

  -- Whitelist de campos y topes de largo. Lo que escribe un anónimo
  -- termina proyectado en una pantalla: no guardamos JSON arbitrario.
  IF p_payload ? 'opcion' THEN
    clean := clean || jsonb_build_object('opcion', left(p_payload->>'opcion', 40));
  END IF;
  IF p_payload ? 'feeling' AND p_payload->>'feeling'
     IN ('genial', 'bien', 'neutral', 'confundido', 'frustrado') THEN
    clean := clean || jsonb_build_object('feeling', p_payload->>'feeling');
  END IF;
  IF p_payload ? 'texto' THEN
    clean := clean || jsonb_build_object('texto', left(btrim(p_payload->>'texto'), 280));
  END IF;
  IF p_payload ? 'palabra' THEN
    clean := clean || jsonb_build_object('palabra', left(btrim(p_payload->>'palabra'), 30));
  END IF;
  IF p_payload ? 'selected' THEN
    SELECT jsonb_agg(v) INTO sel FROM (
      SELECT left(value, 40) AS v
        FROM jsonb_array_elements_text(p_payload->'selected') LIMIT 20
    ) t;
    clean := clean || jsonb_build_object('selected', COALESCE(sel, '[]'::jsonb));
  END IF;

  IF clean = '{}'::jsonb THEN RAISE EXCEPTION 'RESPUESTA_VACIA'; END IF;

  INSERT INTO live_responses (activity_id, session_id, guest_id, payload)
  VALUES (p_activity, g.session_id, g.id, clean)
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
  ultima TIMESTAMPTZ;
BEGIN
  SELECT * INTO g FROM live_guests WHERE token = p_token;
  IF g.id IS NULL THEN RAISE EXCEPTION 'INVITADO_DESCONOCIDO'; END IF;

  SELECT * INTO ses FROM live_sessions
   WHERE id = g.session_id AND status = 'live' AND reactions_enabled;
  IF ses.id IS NULL THEN RAISE EXCEPTION 'REACCIONES_CERRADAS'; END IF;

  -- Solo la botonera del docente. Sin esto, cualquiera manda el
  -- emoji que se le ocurra y aparece proyectado en la pared.
  IF p_emoji NOT IN ('👏', '💡', '😮', '🔥', '🐢', '❓') THEN
    RAISE EXCEPTION 'EMOJI_NO_PERMITIDO';
  END IF;

  -- Freno de spam del lado del servidor: el cooldown del cliente se
  -- saltea con abrir la consola del navegador.
  SELECT max(created_at) INTO ultima FROM live_reactions WHERE guest_id = g.id;
  IF ultima IS NOT NULL AND ultima > now() - interval '2 seconds' THEN
    RETURN;
  END IF;

  INSERT INTO live_reactions (session_id, guest_id, emoji)
  VALUES (g.session_id, g.id, p_emoji);
END $$;

-- ── Lo único abierto a la anon key ──
GRANT EXECUTE ON FUNCTION join_live_session(TEXT, TEXT)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION live_guest_state(UUID)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_live_guest_response(UUID, UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION send_live_guest_reaction(UUID, TEXT)          TO anon, authenticated;
