-- ════════════════════════════════════════════════════════════════════
--  SMT EstudIA — 015: normativa y protocolos de la escuela
--
--  Pedido de las escuelas (reunión del 26/8): "Carga sencilla de
--  normativa. Migue con información de protocolos y normativas."
--
--  Dos usos de la misma tabla:
--   · que dirección cargue reglamentos y protocolos escribiendo, sin
--     depender de subir un PDF que después nadie abre;
--   · que Migue pueda responder citando la norma que corresponde, con
--     búsqueda de texto completo en español.
--
--  La audiencia decide quién la ve: 'equipo' es puertas adentro
--  (docentes y dirección), 'comunidad' la ven además estudiantes y
--  familias. Un protocolo de actuación ante una situación de violencia
--  es del equipo; el acuerdo de convivencia lo tiene que poder leer
--  cualquiera.
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE policy_category AS ENUM (
  'reglamento',      -- reglamento interno, acuerdos de convivencia
  'protocolo',       -- cómo actuar ante una situación
  'circular',        -- comunicación oficial con vigencia
  'seguridad',       -- evacuación, emergencias
  'administrativo'   -- trámites, licencias, plazos
);

CREATE TYPE policy_audience AS ENUM ('equipo', 'comunidad');

CREATE TABLE school_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category policy_category NOT NULL DEFAULT 'protocolo',
  audience policy_audience NOT NULL DEFAULT 'equipo',
  -- En una frase: para qué sirve y cuándo se aplica. Es lo que Migue
  -- muestra como referencia cuando cita la norma.
  summary TEXT,
  body TEXT NOT NULL,
  -- Link a la resolución o al expediente oficial, si existe.
  source_url TEXT,
  effective_from DATE,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Búsqueda en español: Migue necesita encontrar "qué hago si un chico
  -- falta tres semanas" sin que nadie haya escrito esas palabras.
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(body, '')), 'C')
  ) STORED
);

CREATE INDEX idx_policies_school ON school_policies(school_id);
CREATE INDEX idx_policies_search ON school_policies USING GIN(search_vector);
CREATE INDEX idx_policies_published
  ON school_policies(school_id, audience) WHERE is_published;

ALTER TABLE school_policies ENABLE ROW LEVEL SECURITY;

-- Dirección escribe y ve todo lo de SU escuela, publicado o no.
CREATE POLICY "Directors manage school policies"
  ON school_policies FOR ALL
  USING (auth_role() = 'director' AND school_id = auth_school_id())
  WITH CHECK (auth_role() = 'director' AND school_id = auth_school_id());

-- El equipo docente lee lo publicado de su escuela, de cualquier audiencia.
CREATE POLICY "Teachers read published policies"
  ON school_policies FOR SELECT
  USING (
    auth_role() = 'docente'
    AND school_id = auth_school_id()
    AND is_published
  );

-- Estudiantes y familias, solo lo que la escuela marcó para la comunidad.
CREATE POLICY "Community reads community policies"
  ON school_policies FOR SELECT
  USING (
    auth_role() IN ('estudiante', 'padre')
    AND school_id = auth_school_id()
    AND is_published
    AND audience = 'comunidad'
  );

-- El servidor sella autoría y fechas; el cliente no las escribe.
CREATE OR REPLACE FUNCTION stamp_school_policy()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_at := now();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_policy_stamp
  BEFORE INSERT OR UPDATE ON school_policies
  FOR EACH ROW EXECUTE FUNCTION stamp_school_policy();

REVOKE INSERT, UPDATE ON school_policies FROM anon, authenticated;
GRANT INSERT (school_id, title, category, audience, summary, body, source_url,
              effective_from, is_published)
  ON school_policies TO authenticated;
GRANT UPDATE (title, category, audience, summary, body, source_url,
              effective_from, is_published)
  ON school_policies TO authenticated;

-- ── Búsqueda para Migue ──
-- SECURITY INVOKER a propósito: corre con la RLS de quien pregunta, así
-- que un estudiante nunca recupera un protocolo del equipo, ni siquiera
-- como fragmento dentro de una respuesta de la IA.
CREATE OR REPLACE FUNCTION search_school_policies(q TEXT, max_results INT DEFAULT 5)
RETURNS TABLE (
  id UUID,
  title TEXT,
  category policy_category,
  summary TEXT,
  body TEXT,
  source_url TEXT,
  effective_from DATE,
  rank REAL
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.id, p.title, p.category, p.summary, p.body, p.source_url,
         p.effective_from,
         ts_rank(p.search_vector, websearch_to_tsquery('spanish', q)) AS rank
  FROM school_policies p
  WHERE p.is_published
    AND p.search_vector @@ websearch_to_tsquery('spanish', q)
  ORDER BY rank DESC, p.effective_from DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(max_results, 10));
$$;
