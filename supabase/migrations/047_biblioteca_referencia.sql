-- ═══════════════════════════════════════════════════════════════════
-- 047 — Biblioteca de referencia (normativa, NAP, ESI y técnicas)
--
-- La normativa de cada escuela ya existía (school_policies, 028/029).
-- Faltaba lo COMÚN a todas: leyes y resoluciones nacionales, provinciales
-- y municipales, los Núcleos de Aprendizajes Prioritarios, los
-- lineamientos de Educación Sexual Integral y una guía de técnicas
-- pedagógicas. La carga la Dirección de Innovación (superadmin) una vez
-- y la consultan la IA del Laboratorio, Crear, Migue y la planificación.
--
-- No es "entrenar" al modelo: la IA busca acá en cada pedido y cita la
-- fuente. Cuando cambia una resolución, se cambia el documento.
--
--  · referencias: el documento, con su capa (nacional, provincial,
--    municipal, técnica), tipo, número de norma, áreas y años a los que
--    aplica, vigencia y audiencia ('equipo' o 'comunidad', como 028).
--  · referencia_fragmentos: el documento partido en secciones, con
--    búsqueda en español. Un NAP es un fragmento: así se puede vincular
--    uno por uno a los temas de la planificación.
--  · planificacion_nap: qué NAP trabaja cada tema (lo marca el docente).
--
-- Lectura: solo lo PUBLICADO y VIGENTE; lo de 'equipo' no lo ve un
-- estudiante ni una familia. Escritura: solo superadmin.
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE referencia_capa AS ENUM ('nacional', 'provincial', 'municipal', 'tecnica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE referencia_tipo AS ENUM ('ley', 'resolucion', 'nap', 'esi', 'diseno_curricular', 'tecnica', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "Físico-Química", "fisicoquímica", "FÍSICA": para comparar áreas sin
-- depender de acentos, mayúsculas ni guiones (sin la extensión unaccent).
CREATE OR REPLACE FUNCTION normalizar_area(t TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT regexp_replace(lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '', 'g')
$$;

CREATE TABLE IF NOT EXISTS referencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capa referencia_capa NOT NULL,
  tipo referencia_tipo NOT NULL DEFAULT 'otro',
  titulo TEXT NOT NULL CHECK (length(btrim(titulo)) BETWEEN 3 AND 300),
  -- "Ley 26.150", "Res. CFE 340/18": lo que la IA cita
  numero TEXT,
  organismo TEXT,
  fecha DATE,
  vigente BOOLEAN NOT NULL DEFAULT true,
  fuente_url TEXT CHECK (fuente_url IS NULL OR fuente_url ~* '^https?://'),
  -- Vacío = aplica a todas las áreas / todos los años
  areas TEXT[] NOT NULL DEFAULT '{}',
  anios INT[] NOT NULL DEFAULT '{}' CHECK (anios <@ ARRAY[1,2,3,4,5,6,7]),
  audiencia policy_audience NOT NULL DEFAULT 'equipo',
  publicada BOOLEAN NOT NULL DEFAULT false,
  -- En una o dos frases: qué es y para qué sirve (lo que se ve en la lista)
  resumen TEXT,
  creado_por UUID REFERENCES profiles(id),
  actualizado_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referencias_publicadas ON referencias(capa, tipo) WHERE publicada AND vigente;

CREATE TABLE IF NOT EXISTS referencia_fragmentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referencia_id UUID NOT NULL REFERENCES referencias(id) ON DELETE CASCADE,
  orden INT NOT NULL DEFAULT 0,
  -- Título de la sección ("Matemática · 1° año · Números", "Eje: Cuidar el cuerpo")
  seccion TEXT,
  texto TEXT NOT NULL CHECK (length(btrim(texto)) > 0 AND length(texto) <= 6000),
  -- Copia del título y número del documento (lo mantiene un trigger): la
  -- búsqueda pesa más si la consulta coincide con la norma o la sección.
  doc_titulo TEXT NOT NULL DEFAULT '',
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(doc_titulo, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(seccion, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(texto, '')), 'C')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ref_frag_doc ON referencia_fragmentos(referencia_id, orden);
CREATE INDEX IF NOT EXISTS idx_ref_frag_search ON referencia_fragmentos USING GIN(search_vector);

-- ── doc_titulo siempre al día ──
CREATE OR REPLACE FUNCTION ref_fragmento_doc_titulo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT concat_ws(' · ', r.numero, r.titulo) INTO NEW.doc_titulo
  FROM referencias r WHERE r.id = NEW.referencia_id;
  NEW.doc_titulo := coalesce(NEW.doc_titulo, '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ref_fragmento_doc_titulo ON referencia_fragmentos;
CREATE TRIGGER trg_ref_fragmento_doc_titulo
  BEFORE INSERT OR UPDATE OF referencia_id ON referencia_fragmentos
  FOR EACH ROW EXECUTE FUNCTION ref_fragmento_doc_titulo();

CREATE OR REPLACE FUNCTION referencia_al_cambiar()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.actualizado_por := auth.uid();
  IF NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.numero IS DISTINCT FROM OLD.numero THEN
    UPDATE referencia_fragmentos
       SET doc_titulo = concat_ws(' · ', NEW.numero, NEW.titulo)
     WHERE referencia_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referencia_al_cambiar ON referencias;
CREATE TRIGGER trg_referencia_al_cambiar
  BEFORE UPDATE ON referencias
  FOR EACH ROW EXECUTE FUNCTION referencia_al_cambiar();

-- ── RLS ──
ALTER TABLE referencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE referencia_fragmentos ENABLE ROW LEVEL SECURITY;

-- Lo publicado y vigente: el equipo lo ve todo; estudiantes y familias,
-- solo lo de 'comunidad'. El superadmin ve además borradores y derogadas.
DROP POLICY IF EXISTS "Leer referencias publicadas" ON referencias;
CREATE POLICY "Leer referencias publicadas"
  ON referencias FOR SELECT
  USING (
    is_superadmin()
    OR (
      publicada AND vigente
      AND (audiencia = 'comunidad' OR auth_role() IN ('docente', 'director'))
    )
  );

DROP POLICY IF EXISTS "Superadmin gestiona referencias" ON referencias;
CREATE POLICY "Superadmin gestiona referencias"
  ON referencias FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Un fragmento se ve si se ve su documento (la subconsulta pasa por la
-- RLS de referencias). Escribir: solo superadmin, con su propia policy.
DROP POLICY IF EXISTS "Leer fragmentos de referencias visibles" ON referencia_fragmentos;
CREATE POLICY "Leer fragmentos de referencias visibles"
  ON referencia_fragmentos FOR SELECT
  USING (EXISTS (SELECT 1 FROM referencias r WHERE r.id = referencia_id));

DROP POLICY IF EXISTS "Superadmin gestiona fragmentos" ON referencia_fragmentos;
CREATE POLICY "Superadmin gestiona fragmentos"
  ON referencia_fragmentos FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- ── Búsqueda para la IA ──
-- Dos pasadas como search_school_policies (029): primero todas las
-- palabras; si no hay nada, alguna. SECURITY INVOKER: la RLS de quien
-- pregunta decide qué entra. Solo publicado y vigente (los borradores del
-- superadmin nunca le llegan a la IA).
CREATE OR REPLACE FUNCTION buscar_referencias(
  q TEXT,
  p_area TEXT DEFAULT NULL,
  p_anio INT DEFAULT NULL,
  p_tipos referencia_tipo[] DEFAULT NULL,
  max_results INT DEFAULT 6
)
RETURNS TABLE (
  fragmento_id UUID,
  referencia_id UUID,
  titulo TEXT,
  numero TEXT,
  capa referencia_capa,
  tipo referencia_tipo,
  seccion TEXT,
  texto TEXT,
  fuente_url TEXT,
  rank REAL
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  tq_exacta tsquery;
  tq_amplia tsquery;
  n INT := GREATEST(1, LEAST(COALESCE(max_results, 6), 12));
  area_n TEXT := NULLIF(normalizar_area(p_area), '');
BEGIN
  IF q IS NULL OR btrim(q) = '' THEN
    RETURN;
  END IF;

  tq_exacta := websearch_to_tsquery('spanish', left(q, 2000));
  SELECT string_agg(quote_literal(lex), ' | ')::tsquery
    INTO tq_amplia
    FROM unnest(tsvector_to_array(to_tsvector('spanish', left(q, 2000)))) AS lex;

  FOR pasada IN 1..2 LOOP
    CONTINUE WHEN pasada = 1 AND (tq_exacta IS NULL OR numnode(tq_exacta) = 0);
    CONTINUE WHEN pasada = 2 AND (tq_amplia IS NULL OR numnode(tq_amplia) = 0);
    RETURN QUERY
      SELECT f.id, r.id, r.titulo, r.numero, r.capa, r.tipo, f.seccion, f.texto, r.fuente_url,
             ts_rank(f.search_vector, CASE WHEN pasada = 1 THEN tq_exacta ELSE tq_amplia END) AS rank
      FROM referencia_fragmentos f
      JOIN referencias r ON r.id = f.referencia_id
      WHERE r.publicada AND r.vigente
        AND f.search_vector @@ (CASE WHEN pasada = 1 THEN tq_exacta ELSE tq_amplia END)
        AND (p_tipos IS NULL OR r.tipo = ANY (p_tipos))
        AND (p_anio IS NULL OR r.anios = '{}' OR p_anio = ANY (r.anios))
        AND (area_n IS NULL OR r.areas = '{}' OR EXISTS (
              SELECT 1 FROM unnest(r.areas) a
              WHERE area_n LIKE '%' || normalizar_area(a) || '%'
                 OR normalizar_area(a) LIKE '%' || area_n || '%'))
      ORDER BY rank DESC, r.capa, f.orden
      LIMIT n;
    EXIT WHEN FOUND;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION buscar_referencias(TEXT, TEXT, INT, referencia_tipo[], INT) FROM anon;

-- ── Qué NAP trabaja cada tema de la planificación ──
CREATE TABLE IF NOT EXISTS planificacion_nap (
  class_id UUID NOT NULL REFERENCES planning_classes(id) ON DELETE CASCADE,
  fragmento_id UUID NOT NULL REFERENCES referencia_fragmentos(id) ON DELETE CASCADE,
  creado_por UUID REFERENCES profiles(id) DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, fragmento_id)
);

CREATE INDEX IF NOT EXISTS idx_planificacion_nap_frag ON planificacion_nap(fragmento_id);

ALTER TABLE planificacion_nap ENABLE ROW LEVEL SECURITY;

-- ¿Este tema es de una unidad que yo doy? (mismo criterio que la 027)
CREATE OR REPLACE FUNCTION es_mi_tema(p_class UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM planning_classes c
    JOIN planning_units pu ON pu.id = c.unit_id
    JOIN teacher_assignments ta
      ON ta.teacher_id = pu.teacher_id AND ta.subject_id = pu.subject_id AND ta.course_id = pu.course_id
    WHERE c.id = p_class AND pu.teacher_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS "Docente ve los NAP de sus temas" ON planificacion_nap;
CREATE POLICY "Docente ve los NAP de sus temas"
  ON planificacion_nap FOR SELECT
  USING (es_mi_tema(class_id));

DROP POLICY IF EXISTS "Dirección ve los NAP de su escuela" ON planificacion_nap;
CREATE POLICY "Dirección ve los NAP de su escuela"
  ON planificacion_nap FOR SELECT
  USING (
    auth_role() = 'director' AND EXISTS (
      SELECT 1 FROM planning_classes c JOIN planning_units pu ON pu.id = c.unit_id
      WHERE c.id = class_id AND course_school(pu.course_id) = auth_school_id()
    )
  );

-- Vincular: tema propio y un NAP publicado que el docente puede ver
DROP POLICY IF EXISTS "Docente vincula NAP a sus temas" ON planificacion_nap;
CREATE POLICY "Docente vincula NAP a sus temas"
  ON planificacion_nap FOR INSERT
  WITH CHECK (
    es_mi_tema(class_id)
    AND creado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM referencia_fragmentos f JOIN referencias r ON r.id = f.referencia_id
      WHERE f.id = fragmento_id AND r.publicada AND r.vigente
    )
  );

DROP POLICY IF EXISTS "Docente desvincula NAP de sus temas" ON planificacion_nap;
CREATE POLICY "Docente desvincula NAP de sus temas"
  ON planificacion_nap FOR DELETE
  USING (es_mi_tema(class_id));
