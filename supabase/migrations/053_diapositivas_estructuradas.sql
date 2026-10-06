-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 047: diapositivas como datos
--
--  Hasta acá las presentaciones se guardaban como el Markdown que escupió
--  el chat, y para mostrarlas había que reconstruir la estructura con
--  expresiones regulares. Eso funciona hasta que la IA cambia una coma.
--
--  Ahora las diapositivas se guardan como JSON: cada una con su tipo de
--  lámina, su título, sus puntos y la nota del docente. Es el mismo
--  camino que ya usan las placas de estudio (study_cards, migración 006).
--
--  extracted_text NO se toca: sigue guardando una versión en texto plano
--  del mazo, porque es el campo donde busca la biblioteca ("buscar por
--  título, tag o contenido"). Si el mazo viviera solo en JSON, las
--  presentaciones dejarían de aparecer en los resultados.
-- ═══════════════════════════════════════════════

ALTER TABLE library_materials
  ADD COLUMN IF NOT EXISTS slides JSONB;

COMMENT ON COLUMN library_materials.slides IS
  'Mazo de diapositivas estructurado. Si está, manda sobre extracted_text, '
  'que queda como copia en texto plano para la búsqueda de la biblioteca.';
