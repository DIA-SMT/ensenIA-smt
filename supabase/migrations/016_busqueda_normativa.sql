-- ════════════════════════════════════════════════════════════════════
--  ENSEÑIA SMT — 016: que la búsqueda de normativa encuentre
--
--  La 015 usaba websearch_to_tsquery, que exige TODAS las palabras. Con
--  eso, "qué hago si un chico falta muchos días" no encontraba el
--  protocolo de ausencias: la norma dice "estudiante", no "chico".
--  Verificado contra la base: 0 resultados en la pregunta más natural.
--
--  Dos pasadas. Primero la exacta, que es la que da buen ranking cuando
--  el docente usa las palabras de la norma. Si no encuentra nada, una
--  segunda con OR entre los lexemas: trae de más, pero ts_rank ordena y
--  el LIMIT recorta. Para el corpus de una escuela —decenas de normas,
--  no millones— es la decisión correcta.
--
--  Sigue siendo SECURITY INVOKER: la RLS de quien pregunta decide qué
--  entra, así que Migue no puede citarle a un estudiante un protocolo
--  reservado al equipo.
-- ════════════════════════════════════════════════════════════════════

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
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  tq_exacta tsquery;
  tq_amplia tsquery;
  n INT := GREATEST(1, LEAST(COALESCE(max_results, 5), 10));
BEGIN
  IF q IS NULL OR btrim(q) = '' THEN
    RETURN;
  END IF;

  tq_exacta := websearch_to_tsquery('spanish', q);

  -- Los mismos lexemas, pero unidos por OR. Si la consulta era solo
  -- palabras vacías, no queda ninguno y tq_amplia es NULL.
  SELECT string_agg(quote_literal(lex), ' | ')::tsquery
    INTO tq_amplia
    FROM unnest(tsvector_to_array(to_tsvector('spanish', q))) AS lex;

  -- 1ª pasada: todas las palabras.
  IF tq_exacta IS NOT NULL AND numnode(tq_exacta) > 0 THEN
    RETURN QUERY
      SELECT p.id, p.title, p.category, p.summary, p.body, p.source_url,
             p.effective_from,
             ts_rank(p.search_vector, tq_exacta) AS rank
      FROM school_policies p
      WHERE p.is_published
        AND p.search_vector @@ tq_exacta
      ORDER BY rank DESC, p.effective_from DESC NULLS LAST
      LIMIT n;
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- 2ª pasada: alguna de las palabras, ordenado por relevancia.
  IF tq_amplia IS NOT NULL AND numnode(tq_amplia) > 0 THEN
    RETURN QUERY
      SELECT p.id, p.title, p.category, p.summary, p.body, p.source_url,
             p.effective_from,
             ts_rank(p.search_vector, tq_amplia) AS rank
      FROM school_policies p
      WHERE p.is_published
        AND p.search_vector @@ tq_amplia
      ORDER BY rank DESC, p.effective_from DESC NULLS LAST
      LIMIT n;
  END IF;

  RETURN;
END;
$$;
