-- ═══════════════════════════════════════════════════════════════════
-- 070 — El perfil del docente: quién es, su formación y lo que logró
--
--  · perfil_docente: una fila por docente. Una presentación corta, desde
--    qué año da clases y lo que le interesa (ESI, robótica, proyectos…).
--  · antecedentes_docente: títulos, capacitaciones, logros, proyectos y
--    publicaciones, uno por fila. Los carga el docente.
--  · Es del docente: lo ve y lo edita él. La dirección de sus escuelas lo
--    ve SOLO si el docente lo comparte (compartir_con_direccion, apagado de
--    entrada). Estudiantes y colegas no lo ven nunca.
--  · mi_recorrido_en_estudia(): lo que hizo en la app este año (temas dados,
--    materiales, actividades, clases en vivo), contado con sus propios
--    permisos. No se compara con nadie.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tablas ──

CREATE TABLE IF NOT EXISTS perfil_docente (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  sobre_mi TEXT NOT NULL DEFAULT '' CHECK (char_length(sobre_mi) <= 600),
  docente_desde SMALLINT CHECK (docente_desde BETWEEN 1960 AND 2100),
  intereses TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(intereses) <= 12 AND array_position(intereses, NULL) IS NULL),
  compartir_con_direccion BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS antecedentes_docente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('titulo', 'capacitacion', 'logro', 'proyecto', 'publicacion')),
  titulo TEXT NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 200),
  institucion TEXT NOT NULL DEFAULT '' CHECK (char_length(institucion) <= 200),
  anio SMALLINT CHECK (anio BETWEEN 1960 AND 2100),
  -- Capacitaciones: las horas reloj que figuran en la constancia
  horas SMALLINT CHECK (horas BETWEEN 1 AND 5000),
  detalle TEXT NOT NULL DEFAULT '' CHECK (char_length(detalle) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS antecedentes_docente_user_idx ON antecedentes_docente (user_id, tipo, anio DESC NULLS LAST);

-- ── 2. Reglas que no dependen de la app ──

-- Solo un docente o un directivo tiene perfil docente (un estudiante no)
CREATE OR REPLACE FUNCTION es_docente_o_directivo(p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_memberships
    WHERE user_id = p_user AND role IN ('docente', 'director')
  )
$$;
REVOKE EXECUTE ON FUNCTION es_docente_o_directivo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION es_docente_o_directivo(UUID) TO authenticated;

-- La fecha de cambio la pone el servidor; el dueño no se cambia
CREATE OR REPLACE FUNCTION cuidar_perfil_docente()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'El perfil no cambia de dueño' USING ERRCODE = '42501';
  END IF;
  NEW.sobre_mi := btrim(NEW.sobre_mi);
  -- Intereses sin vacíos ni repetidos, cada uno corto
  NEW.intereses := ARRAY(
    SELECT DISTINCT ON (lower(i)) left(btrim(i), 40)
    FROM unnest(NEW.intereses) AS i
    WHERE btrim(i) <> ''
    ORDER BY lower(i)
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cuidar_perfil_docente ON perfil_docente;
CREATE TRIGGER cuidar_perfil_docente
  BEFORE INSERT OR UPDATE ON perfil_docente
  FOR EACH ROW EXECUTE FUNCTION cuidar_perfil_docente();

-- Un antecedente no cambia de dueño ni de fecha de alta, y hay un tope por
-- docente (nadie tiene 300 títulos: es un error o un abuso)
CREATE OR REPLACE FUNCTION cuidar_antecedente_docente()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'El antecedente no cambia de dueño' USING ERRCODE = '42501';
    END IF;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_at := now();
    PERFORM pg_advisory_xact_lock(hashtext('antecedentes:' || NEW.user_id::text));
    IF (SELECT count(*) FROM antecedentes_docente WHERE user_id = NEW.user_id) >= 200 THEN
      RAISE EXCEPTION 'Llegaste al máximo de antecedentes' USING ERRCODE = '54000';
    END IF;
  END IF;
  NEW.titulo := btrim(NEW.titulo);
  NEW.institucion := btrim(NEW.institucion);
  NEW.detalle := btrim(NEW.detalle);
  -- Las horas son solo de las capacitaciones
  IF NEW.tipo <> 'capacitacion' THEN NEW.horas := NULL; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cuidar_antecedente_docente ON antecedentes_docente;
CREATE TRIGGER cuidar_antecedente_docente
  BEFORE INSERT OR UPDATE ON antecedentes_docente
  FOR EACH ROW EXECUTE FUNCTION cuidar_antecedente_docente();

-- ── 3. Quién ve y quién edita ──

ALTER TABLE perfil_docente ENABLE ROW LEVEL SECURITY;
ALTER TABLE antecedentes_docente ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON perfil_docente, antecedentes_docente FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON perfil_docente, antecedentes_docente FROM PUBLIC, authenticated;

DROP POLICY IF EXISTS "Teachers manage own profile" ON perfil_docente;
CREATE POLICY "Teachers manage own profile"
  ON perfil_docente FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND es_docente_o_directivo(auth.uid()));

-- La dirección de una escuela donde el docente trabaja, solo si lo compartió
DROP POLICY IF EXISTS "Directors read shared teacher profiles" ON perfil_docente;
CREATE POLICY "Directors read shared teacher profiles"
  ON perfil_docente FOR SELECT
  USING (compartir_con_direccion AND user_id <> auth.uid() AND is_managed_member(user_id));

DROP POLICY IF EXISTS "Teachers manage own background" ON antecedentes_docente;
CREATE POLICY "Teachers manage own background"
  ON antecedentes_docente FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND es_docente_o_directivo(auth.uid()));

DROP POLICY IF EXISTS "Directors read shared teacher background" ON antecedentes_docente;
CREATE POLICY "Directors read shared teacher background"
  ON antecedentes_docente FOR SELECT
  USING (
    user_id <> auth.uid()
    AND is_managed_member(user_id)
    AND EXISTS (
      SELECT 1 FROM perfil_docente p
      WHERE p.user_id = antecedentes_docente.user_id AND p.compartir_con_direccion
    )
  );

-- ── 4. Lo que hizo en la app este año ──
-- Con los permisos de quien llama (SECURITY INVOKER): cuenta solo lo suyo.

CREATE OR REPLACE FUNCTION mi_recorrido_en_estudia()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH desde AS (
    SELECT date_trunc('year', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires' AS inicio,
           extract(year FROM now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS anio
  )
  SELECT jsonb_build_object(
    'anio', (SELECT anio FROM desde),
    'temasDados', (
      SELECT count(*) FROM planning_classes c
      JOIN planning_units u ON u.id = c.unit_id
      WHERE u.teacher_id = auth.uid() AND c.is_complete
        AND (u.anio IS NULL OR u.anio = (SELECT anio FROM desde))
    ),
    'materiales', (
      SELECT count(*) FROM library_materials
      WHERE teacher_id = auth.uid() AND uploaded_at >= (SELECT inicio FROM desde)
    ),
    'actividades', (
      SELECT count(*) FROM activities
      WHERE teacher_id = auth.uid() AND status <> 'draft' AND created_at >= (SELECT inicio FROM desde)
    ),
    'clasesEnVivo', (
      SELECT count(*) FROM live_sessions
      WHERE teacher_id = auth.uid() AND status = 'ended' AND created_at >= (SELECT inicio FROM desde)
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION mi_recorrido_en_estudia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mi_recorrido_en_estudia() TO authenticated;

-- Comprobación: una fila, todo true
SELECT
  EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'perfil_docente' AND rowsecurity) AS perfil_con_rls,
  EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'antecedentes_docente' AND rowsecurity) AS antecedentes_con_rls,
  NOT has_table_privilege('anon', 'perfil_docente', 'SELECT') AS perfil_sin_anonimos,
  NOT has_table_privilege('anon', 'antecedentes_docente', 'SELECT') AS antecedentes_sin_anonimos,
  NOT has_function_privilege('anon', 'mi_recorrido_en_estudia()', 'EXECUTE') AS recorrido_sin_anonimos,
  (SELECT count(*) FROM pg_policies WHERE tablename IN ('perfil_docente', 'antecedentes_docente')) = 4 AS cuatro_reglas;
