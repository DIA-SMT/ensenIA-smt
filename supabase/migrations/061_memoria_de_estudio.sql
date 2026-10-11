-- ═══════════════════════════════════════════════════════════════════
-- 061 — Memoria de estudio de EstudIA
--
-- Decisiones del usuario (oct 2026):
--  · La memoria es SOLO de estudio y SOLO de EstudIA (el tutor de Mi guía).
--    Migue no recuerda nada de una conversación a otra.
--  · El docente no la ve. La dirección la puede auditar, y cada vez que la
--    lee o borra algo queda registrado: quién, cuándo, de quién y por qué.
--  · Hace falta la autorización de la familia Y la del estudiante, sobre un
--    texto de consentimiento informado que revisa legal. Sin las dos,
--    EstudIA funciona igual, sin memoria.
--
-- Qué es la memoria: notas cortas por materia ("le cuesta", "ya maneja",
-- "le sirve"…) que escribe un modelo al terminar cada charla y que el
-- servidor filtra antes de guardar (edge function ia-chat). Sin nombres, sin
-- nada personal, familiar ni emocional: lo de bienestar sigue yendo por
-- wellbeing_signals, como en Migue.
--
-- Cuidado de menores:
--  · Revocar borra la memoria en el momento, y revocar nunca falla por falta
--    de un texto vigente.
--  · Lo que el chico charló ANTES de que la memoria estuviera activa no se
--    procesa nunca (memoria_activa_desde).
--  · La RLS filtra filas, no columnas: el motivo que escribe la dirección
--    vive en una tabla que el estudiante no lee. Él y su familia ven solo
--    las fechas de las revisiones.
--  · Un texto ya publicado no se edita: si cambia, es otra versión y hay
--    que volver a pedir la autorización.
--
-- Se puede correr más de una vez.
-- ═══════════════════════════════════════════════════════════════════


-- ══ 1. EstudIA: las respuestas de la IA las escribe solo el servidor ══
-- El servidor ya guardaba la respuesta real, pero cualquiera podía insertar
-- en su conversación un mensaje con role 'assistant'. Ahora el historial del
-- estudiante se arma desde la base, así que un turno "de la IA" inventado
-- (uno donde "aceptó" resolver la tarea) torcería la charla y la memoria.
-- Ninguna pantalla inserta otra cosa que mensajes del usuario.
DROP POLICY IF EXISTS "Insert chat messages via session ownership" ON chat_messages;
CREATE POLICY "Insert chat messages via session ownership"
  ON chat_messages FOR INSERT
  WITH CHECK (
    role = 'user'
    AND session_id IN (SELECT id FROM chat_sessions WHERE teacher_id = auth.uid())
  );

-- La hora la pone la base: con una fecha elegida, un mensaje propio se podía
-- meter entre dos turnos viejos de la IA y reacomodar la conversación.
CREATE OR REPLACE FUNCTION chat_message_hora_real()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_hora_real ON chat_messages;
CREATE TRIGGER trg_chat_message_hora_real
  BEFORE INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION chat_message_hora_real();


-- ══ 2. El texto del consentimiento, con versión ══

CREATE TABLE IF NOT EXISTS consentimiento_textos (
  version          TEXT PRIMARY KEY CHECK (char_length(version) BETWEEN 3 AND 40),
  titulo           TEXT NOT NULL,
  para_familia     TEXT NOT NULL,
  para_estudiante  TEXT NOT NULL,
  vigente          BOOLEAN NOT NULL DEFAULT false,
  publicado_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una sola versión vigente a la vez
CREATE UNIQUE INDEX IF NOT EXISTS consentimiento_textos_un_vigente
  ON consentimiento_textos (vigente) WHERE vigente;

ALTER TABLE consentimiento_textos ENABLE ROW LEVEL SECURITY;

-- Cualquiera con cuenta puede leer el texto vigente: es lo que se firma.
DROP POLICY IF EXISTS "Read current consent text" ON consentimiento_textos;
CREATE POLICY "Read current consent text"
  ON consentimiento_textos FOR SELECT
  USING (vigente OR is_superadmin());

-- El superadmin carga y corrige borradores. Publicar va SOLO por
-- publicar_consentimiento_memoria(): ninguna policy deja poner vigente ni
-- tocar algo ya publicado.
DROP POLICY IF EXISTS "Superadmin manages consent texts" ON consentimiento_textos;
DROP POLICY IF EXISTS "Superadmin drafts consent texts" ON consentimiento_textos;
CREATE POLICY "Superadmin drafts consent texts"
  ON consentimiento_textos FOR INSERT
  WITH CHECK (is_superadmin() AND NOT vigente AND publicado_at IS NULL);

DROP POLICY IF EXISTS "Superadmin edits consent drafts" ON consentimiento_textos;
CREATE POLICY "Superadmin edits consent drafts"
  ON consentimiento_textos FOR UPDATE
  USING (is_superadmin() AND NOT vigente AND publicado_at IS NULL)
  WITH CHECK (is_superadmin() AND NOT vigente AND publicado_at IS NULL);

DROP POLICY IF EXISTS "Superadmin deletes consent drafts" ON consentimiento_textos;
CREATE POLICY "Superadmin deletes consent drafts"
  ON consentimiento_textos FOR DELETE
  USING (is_superadmin() AND NOT vigente AND publicado_at IS NULL);

-- Lo que alguien ya firmó no puede cambiar debajo de su firma. Vale también
-- para quien entra con la service key: una vez publicado, ni el texto ni la
-- fecha de publicación cambian.
CREATE OR REPLACE FUNCTION consentimiento_texto_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.publicado_at IS NOT NULL OR OLD.vigente
      OR EXISTS (SELECT 1 FROM consentimientos_memoria WHERE version = OLD.version))
     AND (NEW.titulo IS DISTINCT FROM OLD.titulo
          OR NEW.para_familia IS DISTINCT FROM OLD.para_familia
          OR NEW.para_estudiante IS DISTINCT FROM OLD.para_estudiante
          OR NEW.version IS DISTINCT FROM OLD.version
          OR (OLD.publicado_at IS NOT NULL AND NEW.publicado_at IS DISTINCT FROM OLD.publicado_at)) THEN
    RAISE EXCEPTION 'Un texto ya publicado no se edita: cargá una versión nueva y publicala';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consentimiento_texto_inmutable ON consentimiento_textos;
CREATE TRIGGER trg_consentimiento_texto_inmutable
  BEFORE UPDATE ON consentimiento_textos
  FOR EACH ROW EXECUTE FUNCTION consentimiento_texto_inmutable();

-- Publicar una versión (superadmin). Un borrador no se publica: obliga a
-- cargar la versión que aprobó legal con su propio nombre.
CREATE OR REPLACE FUNCTION publicar_consentimiento_memoria(p_version TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Solo la administración municipal publica el texto del consentimiento';
  END IF;
  IF p_version ILIKE '%borrador%' THEN
    RAISE EXCEPTION 'Un borrador no se publica: cargá la versión aprobada por legal con otro nombre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM consentimiento_textos WHERE version = p_version) THEN
    RAISE EXCEPTION 'No existe la versión %', p_version;
  END IF;
  -- Volver a una versión reemplazada reactivaría autorizaciones viejas con
  -- su fecha vieja: lo charlado mientras tanto entraría a la memoria.
  IF EXISTS (SELECT 1 FROM consentimiento_textos WHERE version = p_version AND publicado_at IS NOT NULL AND NOT vigente) THEN
    RAISE EXCEPTION 'Esa versión ya fue reemplazada: cargá una nueva y publicala';
  END IF;
  UPDATE consentimiento_textos SET vigente = false WHERE vigente AND version <> p_version;
  UPDATE consentimiento_textos
  SET vigente = true, publicado_at = coalesce(publicado_at, now())
  WHERE version = p_version;
  RETURN p_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION publicar_consentimiento_memoria(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION publicar_consentimiento_memoria(TEXT) TO authenticated;


-- ══ 3. Las autorizaciones ══
-- Una fila por respuesta, nunca se editan ni se borran: lo que vale es la
-- última de cada uno (familia y estudiante). Revocar es otra fila.

CREATE TABLE IF NOT EXISTS consentimientos_memoria (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  quien            TEXT NOT NULL CHECK (quien IN ('familia', 'estudiante')),
  acepta           BOOLEAN NOT NULL,
  -- Para revocar no hace falta un texto vigente
  version          TEXT REFERENCES consentimiento_textos(version),
  via              TEXT NOT NULL CHECK (via IN ('app', 'papel')),
  -- Familia desde la app: qué familiar
  guardian_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Papel: quién firmó y su vínculo; lo carga la dirección
  firmante         TEXT CHECK (char_length(firmante) <= 120),
  vinculo          TEXT CHECK (char_length(vinculo) <= 60),
  registrado_por   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Desempate: dos respuestas en la misma transacción tienen el mismo created_at
  seq              BIGINT GENERATED ALWAYS AS IDENTITY,
  CHECK (NOT acepta OR version IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS consentimientos_memoria_ultimo_idx
  ON consentimientos_memoria (student_id, quien, created_at DESC, seq DESC);

-- Sin policies: nadie lee ni escribe filas directo. Todo pasa por las
-- funciones de abajo, que validan quién es quién.
ALTER TABLE consentimientos_memoria ENABLE ROW LEVEL SECURITY;


-- ══ 4. La memoria ══

CREATE TABLE IF NOT EXISTS memoria_estudio (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  -- Una de sus materias, o NULL para "cómo aprende" en general
  materia     TEXT CHECK (char_length(materia) <= 80),
  tipo        TEXT NOT NULL CHECK (tipo IN ('trabajo', 'cuesta', 'maneja', 'sirve', 'prefiere')),
  texto       TEXT NOT NULL CHECK (char_length(texto) BETWEEN 3 AND 200),
  veces       INT NOT NULL DEFAULT 1 CHECK (veces >= 1),
  primera_vez DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  ultima_vez  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memoria_estudio_student_idx ON memoria_estudio (student_id, materia);

ALTER TABLE memoria_estudio ENABLE ROW LEVEL SECURITY;

-- El chico ve todo lo suyo y lo puede borrar. Escribe solo el servidor.
-- Ni el docente ni la dirección tienen policy: la dirección lee por
-- revisar_memoria_estudio(), que deja registro.
DROP POLICY IF EXISTS "Student reads own study memory" ON memoria_estudio;
CREATE POLICY "Student reads own study memory"
  ON memoria_estudio FOR SELECT
  USING (student_id = auth_student_id());

DROP POLICY IF EXISTS "Student deletes own study memory" ON memoria_estudio;
CREATE POLICY "Student deletes own study memory"
  ON memoria_estudio FOR DELETE
  USING (student_id = auth_student_id());

-- Hasta dónde se procesó cada conversación. Solo el servidor (sin
-- policies): si viviera en chat_sessions, el chico la podría mover, porque
-- su policy FOR ALL no ata columnas.
CREATE TABLE IF NOT EXISTS memoria_estudio_proceso (
  session_id      UUID PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  procesado_hasta TIMESTAMPTZ NOT NULL
);

ALTER TABLE memoria_estudio_proceso ENABLE ROW LEVEL SECURITY;


-- ══ 5. ¿Está activa? Desde cuándo ══
-- Activa = la última respuesta de la familia y la del estudiante aceptan la
-- versión vigente. Devuelve el momento de la más reciente de las dos: lo
-- charlado antes no se procesa. Si se revoca y se vuelve a aceptar, la
-- fecha se corre y lo del medio tampoco.
CREATE OR REPLACE FUNCTION memoria_activa_desde(p_student UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH ultima AS (
    SELECT DISTINCT ON (quien) quien, acepta, version, created_at
    FROM consentimientos_memoria
    WHERE student_id = p_student
    ORDER BY quien, created_at DESC, seq DESC
  )
  SELECT CASE
    WHEN count(*) FILTER (
      WHERE acepta AND version = (SELECT version FROM consentimiento_textos WHERE vigente)
    ) = 2
    THEN max(created_at)
  END
  FROM ultima
$$;

REVOKE EXECUTE ON FUNCTION memoria_activa_desde(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION memoria_activa_desde(UUID) TO service_role;


-- ══ 6. Revocar borra, y nada se escribe sin autorización ══
-- La revocación y cada escritura de memoria toman el mismo candado por
-- estudiante. Sin esto, una charla que el servidor estaba procesando (espera
-- unos segundos al modelo) podía guardar notas DESPUÉS de que la familia
-- revocó: el borrado ya había pasado y las notas nuevas quedaban.

CREATE OR REPLACE FUNCTION memoria_candado(p_student UUID)
RETURNS VOID
LANGUAGE sql
AS $$ SELECT pg_advisory_xact_lock(hashtext('memoria_estudio:' || p_student::text)) $$;
REVOKE EXECUTE ON FUNCTION memoria_candado(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION memoria_revocada_borrar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM memoria_candado(NEW.student_id);
  DELETE FROM memoria_estudio WHERE student_id = NEW.student_id;
  DELETE FROM memoria_estudio_proceso WHERE student_id = NEW.student_id;
  RETURN NEW;
END;
$$;

-- Escribir memoria (o marcar una charla como procesada) solo con la
-- autorización vigente. Después del candado, la consulta ve lo que la
-- revocación ya confirmó. Sin autorización la fila se descarta en silencio:
-- el servidor no tiene nada que hacer con ella.
CREATE OR REPLACE FUNCTION memoria_solo_si_activa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM memoria_candado(NEW.student_id);
  IF memoria_activa_desde(NEW.student_id) IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memoria_solo_si_activa ON memoria_estudio;
CREATE TRIGGER trg_memoria_solo_si_activa
  BEFORE INSERT OR UPDATE ON memoria_estudio
  FOR EACH ROW EXECUTE FUNCTION memoria_solo_si_activa();

DROP TRIGGER IF EXISTS trg_memoria_proceso_solo_si_activa ON memoria_estudio_proceso;
CREATE TRIGGER trg_memoria_proceso_solo_si_activa
  BEFORE INSERT OR UPDATE ON memoria_estudio_proceso
  FOR EACH ROW EXECUTE FUNCTION memoria_solo_si_activa();

DROP TRIGGER IF EXISTS trg_memoria_revocada ON consentimientos_memoria;
CREATE TRIGGER trg_memoria_revocada
  AFTER INSERT ON consentimientos_memoria
  FOR EACH ROW
  WHEN (NOT NEW.acepta)
  EXECUTE FUNCTION memoria_revocada_borrar();


-- ══ 7. Vencimiento ══
-- Lo que no se repite en 90 días se borra, y el 1° de marzo (arranque del
-- ciclo lectivo) se borra todo lo del ciclo anterior. Lo llama el servidor
-- antes de leer la memoria de un chico, y pg_cron una vez por día si está.
CREATE OR REPLACE FUNCTION limpiar_memoria_estudio(p_student UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoy DATE := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  inicio_ciclo DATE := make_date(
    extract(year FROM hoy)::int - CASE WHEN extract(month FROM hoy) >= 3 THEN 0 ELSE 1 END, 3, 1);
  n INT;
BEGIN
  DELETE FROM memoria_estudio
  WHERE (p_student IS NULL OR student_id = p_student)
    AND (ultima_vez < hoy - 90 OR ultima_vez < inicio_ciclo);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION limpiar_memoria_estudio(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION limpiar_memoria_estudio(UUID) TO service_role;

-- El servidor "reclama" un tramo de conversación antes de procesarlo, así
-- dos pedidos seguidos no lo cuentan dos veces. Devuelve la marca anterior
-- (para devolverla si el modelo falla) o ok=false si ya lo tomó otro.
CREATE OR REPLACE FUNCTION reclamar_proceso_memoria(p_session UUID, p_student UUID, p_hasta TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes TIMESTAMPTZ;
BEGIN
  SELECT procesado_hasta INTO v_antes
  FROM memoria_estudio_proceso WHERE session_id = p_session
  FOR UPDATE;

  IF FOUND THEN
    IF v_antes >= p_hasta THEN
      RETURN jsonb_build_object('ok', false);
    END IF;
    UPDATE memoria_estudio_proceso SET procesado_hasta = p_hasta WHERE session_id = p_session;
    RETURN jsonb_build_object('ok', true, 'antes', v_antes);
  END IF;

  INSERT INTO memoria_estudio_proceso (session_id, student_id, procesado_hasta)
  VALUES (p_session, p_student, p_hasta)
  ON CONFLICT (session_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'antes', NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION reclamar_proceso_memoria(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reclamar_proceso_memoria(UUID, UUID, TIMESTAMPTZ) TO service_role;


-- ══ 8. Registro de lo que hace la dirección ══

CREATE TABLE IF NOT EXISTS memoria_estudio_revisiones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  -- Si se borra al estudiante, el registro queda (con su nombre copiado):
  -- borrar a un chico no puede borrar quién leyó su memoria.
  student_id  UUID REFERENCES students(id) ON DELETE SET NULL,
  estudiante  TEXT NOT NULL CHECK (char_length(estudiante) <= 160),
  director_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  director    TEXT NOT NULL CHECK (char_length(director) <= 160),
  accion      TEXT NOT NULL CHECK (accion IN ('leer', 'borrar')),
  motivo      TEXT NOT NULL CHECK (char_length(motivo) BETWEEN 5 AND 300),
  -- Al borrar: materia y tipo, nunca el texto (si era algo que no tenía que
  -- estar, guardarlo acá sería no borrarlo)
  detalle     TEXT CHECK (char_length(detalle) <= 120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memoria_revisiones_escuela_idx
  ON memoria_estudio_revisiones (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memoria_revisiones_estudiante_idx
  ON memoria_estudio_revisiones (student_id, created_at DESC);

-- Sin policies: la dirección lo lee por revisiones_memoria_escuela(); el
-- chico y su familia, solo las fechas, por estado_memoria_estudio().
ALTER TABLE memoria_estudio_revisiones ENABLE ROW LEVEL SECURITY;

-- ¿La persona logueada es de la dirección de la escuela de este chico?
-- Nunca NULL: auth_role() es NULL para una cuenta sin membresía que
-- coincida, y un "IF NOT NULL" no frena nada.
CREATE OR REPLACE FUNCTION dirige_escuela_de(p_student UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth_role() = 'director' AND student_school(p_student) = auth_school_id(), false)
$$;
REVOKE EXECUTE ON FUNCTION dirige_escuela_de(UUID) FROM PUBLIC, anon, authenticated;

-- Los nombres se copian al registro: tiene que seguir legible aunque se
-- borre la cuenta o al estudiante.
CREATE OR REPLACE FUNCTION nombre_estudiante(p_student UUID)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT left(coalesce((SELECT first_name || ' ' || last_name FROM students WHERE id = p_student), 'Estudiante'), 160)
$$;
REVOKE EXECUTE ON FUNCTION nombre_estudiante(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nombre_perfil(p_user UUID)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT left(coalesce(nullif(trim((SELECT first_name || ' ' || last_name FROM profiles WHERE id = p_user)), ''), 'Dirección'), 160)
$$;
REVOKE EXECUTE ON FUNCTION nombre_perfil(UUID) FROM PUBLIC, anon, authenticated;


-- ══ 9. Estado, para el chico, su familia y la dirección ══

CREATE OR REPLACE FUNCTION estado_memoria_estudio(p_student UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st UUID := coalesce(p_student, auth_student_id());
  v_texto consentimiento_textos%ROWTYPE;
  v_fam consentimientos_memoria%ROWTYPE;
  v_est consentimientos_memoria%ROWTYPE;
BEGIN
  IF v_st IS NULL THEN
    RAISE EXCEPTION 'Falta el estudiante';
  END IF;
  IF NOT coalesce(v_st = auth_student_id()
                  OR v_st IN (SELECT auth_guardian_student_ids())
                  OR dirige_escuela_de(v_st), false) THEN
    RAISE EXCEPTION 'No podés ver la memoria de este estudiante';
  END IF;

  SELECT * INTO v_texto FROM consentimiento_textos WHERE vigente;
  SELECT * INTO v_fam FROM consentimientos_memoria
    WHERE student_id = v_st AND quien = 'familia' ORDER BY created_at DESC, seq DESC LIMIT 1;
  SELECT * INTO v_est FROM consentimientos_memoria
    WHERE student_id = v_st AND quien = 'estudiante' ORDER BY created_at DESC, seq DESC LIMIT 1;

  RETURN jsonb_build_object(
    'texto', CASE WHEN v_texto.version IS NULL THEN NULL ELSE jsonb_build_object(
      'version', v_texto.version,
      'titulo', v_texto.titulo,
      'paraFamilia', v_texto.para_familia,
      'paraEstudiante', v_texto.para_estudiante,
      'publicado', v_texto.publicado_at) END,
    'familia', CASE WHEN v_fam.id IS NULL THEN NULL ELSE jsonb_build_object(
      'acepta', v_fam.acepta,
      'via', v_fam.via,
      'fecha', v_fam.created_at,
      'vigente', v_fam.acepta AND v_fam.version IS NOT DISTINCT FROM v_texto.version) END,
    'estudiante', CASE WHEN v_est.id IS NULL THEN NULL ELSE jsonb_build_object(
      'acepta', v_est.acepta,
      'via', v_est.via,
      'fecha', v_est.created_at,
      'vigente', v_est.acepta AND v_est.version IS NOT DISTINCT FROM v_texto.version) END,
    'activa', memoria_activa_desde(v_st) IS NOT NULL,
    'items', (SELECT count(*) FROM memoria_estudio WHERE student_id = v_st),
    -- Solo las fechas: el motivo es de la dirección
    'revisiones', coalesce((
      SELECT jsonb_agg(jsonb_build_object('fecha', r.created_at, 'accion', r.accion) ORDER BY r.created_at DESC)
      FROM (SELECT created_at, accion FROM memoria_estudio_revisiones
            WHERE student_id = v_st ORDER BY created_at DESC LIMIT 10) r
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION estado_memoria_estudio(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION estado_memoria_estudio(UUID) TO authenticated;


-- ══ 10. Responder desde la app (el chico o su familia) ══

-- Sin p_student: el estudiante logueado responde por sí mismo.
-- p_version: la versión del texto que la persona leyó. Para aceptar tiene
-- que ser la vigente: si se publicó otra mientras tenía la pantalla abierta,
-- no se registra que aceptó algo que no vio.
DROP FUNCTION IF EXISTS dar_consentimiento_memoria(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION dar_consentimiento_memoria(p_student UUID, p_acepta BOOLEAN, p_version TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st UUID := coalesce(p_student, auth_student_id());
  v_quien TEXT;
  v_version TEXT;
BEGIN
  IF v_st IS NULL OR p_acepta IS NULL THEN
    RAISE EXCEPTION 'Falta la respuesta';
  END IF;
  -- El chico, con su propia cuenta de estudiante. La familia, con una cuenta
  -- de familia de esa escuela vinculada al chico (el superadmin no: podría
  -- darse una membresía de familia y autorizar por otro).
  IF v_st = auth_student_id() AND auth_role() = 'estudiante' THEN
    v_quien := 'estudiante';
  ELSIF v_st IN (SELECT auth_guardian_student_ids())
        AND NOT is_superadmin()
        AND is_member_as(auth.uid(), student_school(v_st), 'padre') THEN
    v_quien := 'familia';
  ELSE
    RAISE EXCEPTION 'Solo el estudiante o su familia pueden responder esto';
  END IF;

  SELECT version INTO v_version FROM consentimiento_textos WHERE vigente;
  IF p_acepta AND v_version IS NULL THEN
    RAISE EXCEPTION 'Todavía no hay un texto de consentimiento publicado';
  END IF;
  IF p_acepta AND p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'El texto cambió mientras lo leías. Volvé a abrirlo para ver la versión nueva.';
  END IF;

  INSERT INTO consentimientos_memoria
    (student_id, school_id, quien, acepta, version, via, guardian_user_id, registrado_por)
  VALUES
    (v_st, student_school(v_st), v_quien, p_acepta, v_version, 'app',
     CASE WHEN v_quien = 'familia' THEN auth.uid() END, auth.uid());

  RETURN estado_memoria_estudio(v_st);
END;
$$;

REVOKE EXECUTE ON FUNCTION dar_consentimiento_memoria(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dar_consentimiento_memoria(UUID, BOOLEAN, TEXT) TO authenticated;


-- ══ 11. Papel firmado (lo carga la dirección) ══
-- Muchas familias no van a entrar a la app. La autorización del chico, en
-- cambio, la da él desde Mi guía; en papel la dirección solo carga que la
-- retira (por ejemplo, si lo pidió en persona).

-- p_version: la versión impresa en el papel firmado. Para autorizar tiene
-- que ser la vigente.
DROP FUNCTION IF EXISTS registrar_consentimiento_papel(UUID, TEXT, BOOLEAN, TEXT, TEXT);
CREATE OR REPLACE FUNCTION registrar_consentimiento_papel(
  p_student UUID, p_quien TEXT, p_acepta BOOLEAN, p_firmante TEXT DEFAULT NULL, p_vinculo TEXT DEFAULT NULL,
  p_version TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version TEXT;
  v_firmante TEXT := nullif(left(trim(coalesce(p_firmante, '')), 120), '');
  v_vinculo TEXT := nullif(left(trim(coalesce(p_vinculo, '')), 60), '');
BEGIN
  IF NOT dirige_escuela_de(p_student) THEN
    RAISE EXCEPTION 'Solo la dirección de la escuela del estudiante puede cargar esto';
  END IF;
  IF p_quien NOT IN ('familia', 'estudiante') OR p_acepta IS NULL THEN
    RAISE EXCEPTION 'Datos incompletos';
  END IF;
  IF p_acepta AND p_quien <> 'familia' THEN
    RAISE EXCEPTION 'El estudiante acepta desde su cuenta, en Mi guía';
  END IF;
  IF p_quien = 'familia' AND v_firmante IS NULL THEN
    RAISE EXCEPTION 'Falta el nombre de quien firmó';
  END IF;

  SELECT version INTO v_version FROM consentimiento_textos WHERE vigente;
  IF p_acepta AND v_version IS NULL THEN
    RAISE EXCEPTION 'Todavía no hay un texto de consentimiento publicado';
  END IF;
  IF p_acepta AND p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'El papel tiene que ser de la versión vigente del texto (%). Si firmaron otra, hay que volver a pedirla.', v_version;
  END IF;

  INSERT INTO consentimientos_memoria
    (student_id, school_id, quien, acepta, version, via, firmante, vinculo, registrado_por)
  VALUES
    (p_student, student_school(p_student), p_quien, p_acepta, v_version, 'papel',
     v_firmante, v_vinculo, auth.uid());

  RETURN estado_memoria_estudio(p_student);
END;
$$;

REVOKE EXECUTE ON FUNCTION registrar_consentimiento_papel(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_consentimiento_papel(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated;


-- ══ 12. La dirección: lista, revisión y borrado, todo con registro ══

CREATE OR REPLACE FUNCTION memoria_estudio_escuela()
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := auth_school_id();
  v_vigente TEXT;
BEGIN
  IF auth_role() IS DISTINCT FROM 'director' OR v_school IS NULL THEN
    RAISE EXCEPTION 'Solo la dirección ve esto';
  END IF;
  SELECT version INTO v_vigente FROM consentimiento_textos WHERE vigente;

  RETURN jsonb_build_object(
    'version', v_vigente,
    'estudiantes', coalesce((
      SELECT jsonb_agg(fila ORDER BY curso, apellido, nombre)
      FROM (
        SELECT
          coalesce(c.name, 'Sin curso') AS curso, s.last_name AS apellido, s.first_name AS nombre,
          jsonb_build_object(
            'id', s.id,
            'nombre', s.first_name,
            'apellido', s.last_name,
            'curso', coalesce(c.name, 'Sin curso'),
            'cursoId', s.course_id,
            'familia', (
              SELECT jsonb_build_object(
                'acepta', f.acepta, 'via', f.via, 'fecha', f.created_at,
                'firmante', f.firmante, 'vinculo', f.vinculo,
                'vigente', f.acepta AND f.version IS NOT DISTINCT FROM v_vigente)
              FROM consentimientos_memoria f
              WHERE f.student_id = s.id AND f.quien = 'familia'
              ORDER BY f.created_at DESC, f.seq DESC LIMIT 1),
            'estudiante', (
              SELECT jsonb_build_object(
                'acepta', e.acepta, 'via', e.via, 'fecha', e.created_at,
                'vigente', e.acepta AND e.version IS NOT DISTINCT FROM v_vigente)
              FROM consentimientos_memoria e
              WHERE e.student_id = s.id AND e.quien = 'estudiante'
              ORDER BY e.created_at DESC, e.seq DESC LIMIT 1),
            'activa', memoria_activa_desde(s.id) IS NOT NULL,
            'items', (SELECT count(*) FROM memoria_estudio m WHERE m.student_id = s.id),
            'ultimaRevision', (SELECT max(r.created_at) FROM memoria_estudio_revisiones r WHERE r.student_id = s.id)
          ) AS fila
        FROM students s
        LEFT JOIN courses c ON c.id = s.course_id
        WHERE s.school_id = v_school
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION memoria_estudio_escuela() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION memoria_estudio_escuela() TO authenticated;

-- Leer la memoria de un chico: siempre con motivo, siempre queda registrado
CREATE OR REPLACE FUNCTION revisar_memoria_estudio(p_student UUID, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motivo TEXT := left(trim(coalesce(p_motivo, '')), 300);
BEGIN
  IF NOT dirige_escuela_de(p_student) THEN
    RAISE EXCEPTION 'Solo la dirección de la escuela del estudiante puede revisar su memoria';
  END IF;
  IF char_length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'Escribí el motivo de la revisión';
  END IF;

  INSERT INTO memoria_estudio_revisiones (school_id, student_id, estudiante, director_id, director, accion, motivo)
  VALUES (student_school(p_student), p_student, nombre_estudiante(p_student),
          auth.uid(), nombre_perfil(auth.uid()), 'leer', v_motivo);

  RETURN jsonb_build_object('items', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', m.id, 'materia', m.materia, 'tipo', m.tipo, 'texto', m.texto, 'veces', m.veces,
      'primeraVez', m.primera_vez, 'ultimaVez', m.ultima_vez)
      ORDER BY m.materia NULLS LAST, m.tipo, m.ultima_vez DESC)
    FROM memoria_estudio m WHERE m.student_id = p_student
  ), '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION revisar_memoria_estudio(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION revisar_memoria_estudio(UUID, TEXT) TO authenticated;

-- Borrar algo que no tenía que estar
CREATE OR REPLACE FUNCTION borrar_memoria_direccion(p_item UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item memoria_estudio%ROWTYPE;
  v_motivo TEXT := left(trim(coalesce(p_motivo, '')), 300);
BEGIN
  SELECT * INTO v_item FROM memoria_estudio WHERE id = p_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese dato ya no está en la memoria';
  END IF;
  IF NOT dirige_escuela_de(v_item.student_id) THEN
    RAISE EXCEPTION 'Solo la dirección de la escuela del estudiante puede borrar esto';
  END IF;
  IF char_length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'Escribí el motivo';
  END IF;

  DELETE FROM memoria_estudio WHERE id = p_item;
  -- A la escuela actual del chico (la nota pudo nacer en otra)
  INSERT INTO memoria_estudio_revisiones (school_id, student_id, estudiante, director_id, director, accion, motivo, detalle)
  VALUES (student_school(v_item.student_id), v_item.student_id, nombre_estudiante(v_item.student_id),
          auth.uid(), nombre_perfil(auth.uid()), 'borrar', v_motivo,
          left(coalesce(v_item.materia, 'Cómo aprende') || ' · ' || v_item.tipo, 120));
END;
$$;

REVOKE EXECUTE ON FUNCTION borrar_memoria_direccion(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION borrar_memoria_direccion(UUID, TEXT) TO authenticated;

-- El registro completo de la escuela (todas las direcciones se ven entre sí)
CREATE OR REPLACE FUNCTION revisiones_memoria_escuela(p_limite INT DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_role() IS DISTINCT FROM 'director' OR auth_school_id() IS NULL THEN
    RAISE EXCEPTION 'Solo la dirección ve esto';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'fecha', r.created_at,
      'accion', r.accion,
      'motivo', r.motivo,
      'detalle', r.detalle,
      'director', r.director,
      'estudiante', r.estudiante,
      'curso', c.name) ORDER BY r.created_at DESC)
    FROM (SELECT * FROM memoria_estudio_revisiones
          WHERE school_id = auth_school_id()
          ORDER BY created_at DESC
          LIMIT least(greatest(coalesce(p_limite, 100), 1), 500)) r
    LEFT JOIN students s ON s.id = r.student_id
    LEFT JOIN courses c ON c.id = s.course_id
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION revisiones_memoria_escuela(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION revisiones_memoria_escuela(INT) TO authenticated;


-- ══ 13. El borrador del texto (NO vigente) ══
-- Es el borrador para que revise legal (docs/consentimiento-memoria-estudio.md).
-- No se puede publicar con este nombre: cuando esté aprobado, se carga como
-- otra versión (por ejemplo '2026-11-v1') y se publica con
-- SELECT publicar_consentimiento_memoria('2026-11-v1');
INSERT INTO consentimiento_textos (version, titulo, para_familia, para_estudiante)
VALUES (
  '2026-10-borrador',
  'Memoria de estudio de EstudIA',
  $familia$EstudIA es el tutor de estudio de la app SMT EstudIA. Hoy, cada vez que su hijo o hija abre una charla nueva, EstudIA empieza de cero. Con la memoria de estudio, EstudIA recuerda cómo estudia: qué temas trabajó, qué le costó, qué ya maneja y qué explicaciones le sirvieron. Así puede retomar donde quedó y explicarle mejor.

**Qué se guarda.** Notas cortas por materia, por ejemplo: "Matemática · Le cuesta aplicar un signo menos delante de un paréntesis" o "Le sirven los ejemplos con plata". También se usan los resultados de las prácticas que hace en la app.

**Qué NO se guarda.** La memoria está hecha para no guardar nombres de personas, datos de contacto ni nada de su vida personal, familiar, de salud o de cómo se siente: la app filtra lo que lo parezca antes de guardar, y si alguna vez aparece algo así, se puede borrar. Tampoco se guarda lo que haya charlado con Migue. Si en una charla cuenta algo que preocupa sobre su bienestar, eso no va a la memoria: sigue el mismo camino que hoy, que es avisar al equipo de la escuela.

**Quién lo ve.** Su hijo o hija ve todo lo que EstudIA recuerda y puede borrarlo cuando quiera. Los docentes no lo ven. La dirección de la escuela puede revisarlo para controlar que se use bien; cada revisión queda registrada con fecha y motivo, y ustedes y su hijo o hija ven la fecha.

**Para qué NO se usa.** No se usa para poner notas, evaluar ni sancionar. No se comparte con otras escuelas ni con terceros.

**Dónde se procesa.** Para responder, EstudIA usa un modelo de inteligencia artificial (Claude, de la empresa Anthropic) a través del intermediario OpenRouter, en servidores de Amazon Web Services o Google Cloud que están fuera de la Argentina, principalmente en Estados Unidos. La app usa solo servicios que no guardan lo que se les envía ni lo usan para entrenar modelos. Antes de enviar cada mensaje, la app saca el nombre del estudiante, el de la escuela y los datos de contacto (teléfonos, correos, documentos). Las notas de la memoria viajan con cada charla y se guardan en la base de datos de la app.

**Cuánto dura.** Lo que no se repite en 90 días se borra solo. Al empezar cada ciclo lectivo (1° de marzo) se borra todo lo del año anterior.

**Es voluntario.** Si no autorizan, EstudIA funciona igual, sin memoria. Pueden retirar la autorización en cualquier momento desde la app o en la escuela, y la memoria se borra en el momento. Su hijo o hija también tiene que aceptar, y también puede retirarse cuando quiera.

**Sus derechos.** Pueden pedir ver, corregir o borrar estos datos en la dirección de la escuela (Ley 25.326 de Protección de Datos Personales).$familia$,
  $estudiante$Si aceptás, EstudIA va a recordar cómo estudiás: qué temas trabajaste, qué te costó, qué ya te sale y qué ejemplos te sirven. Así no arranca de cero cada vez.

- Está hecha para no guardar nombres ni nada de tu vida personal, tu familia o cómo te sentís. Si alguna vez ves algo así, borralo.
- Lo que recuerda lo ves vos, entero, y lo podés borrar cuando quieras.
- Tus docentes no lo ven. La dirección lo puede revisar para controlar que se use bien, y vos ves cuándo lo hizo.
- No se usa para ponerte notas.
- Para responderte, EstudIA usa una inteligencia artificial que funciona fuera del país. Le manda estas notas sin tu nombre, y ese servicio no guarda lo que recibe.
- Lo que no se repite en 90 días se borra solo, y todo se borra cuando empieza el ciclo lectivo.
- Tu familia también tiene que aceptar. Si no aceptás, EstudIA funciona igual, sin memoria. Podés cambiar de idea cuando quieras.$estudiante$
)
ON CONFLICT (version) DO NOTHING;


-- ══ 14. Limpieza diaria, si hay pg_cron (best effort, como la 023) ══
DO $cron$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('estudia-limpiar-memoria', '30 6 * * *', 'SELECT limpiar_memoria_estudio()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible (%). La memoria igual se limpia cada vez que el chico usa EstudIA.', SQLERRM;
END
$cron$;


-- Comprobación: tiene que dar todo true
SELECT
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages'
          AND policyname = 'Insert chat messages via session ownership'
          AND with_check ILIKE '%role%') AS solo_mensajes_del_usuario,
  -- Otra policy de escritura (creada a mano) anularía la restricción de arriba
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages'
              AND cmd IN ('INSERT', 'UPDATE', 'ALL')
              AND policyname <> 'Insert chat messages via session ownership') AS sin_otra_escritura_en_chat,
  EXISTS (SELECT 1 FROM consentimiento_textos WHERE version = '2026-10-borrador' AND NOT vigente) AS borrador_cargado_sin_publicar,
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('consentimientos_memoria', 'memoria_estudio_proceso', 'memoria_estudio_revisiones')) AS sin_lectura_directa,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'revisar_memoria_estudio') AS auditoria;
