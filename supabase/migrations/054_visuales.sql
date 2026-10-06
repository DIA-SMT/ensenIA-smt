-- 054 — Diagramas y juegos de palabras como material
--
-- library_materials.visual guarda, ya armado y validado en el navegador del
-- docente:
--   { tipo: 'diagrama', variante, titulo, descripcion, nodos, conexiones, ramas, eventos }
--     (el dibujo en sí queda como PNG en storage_path: los chicos no bajan Mermaid)
--   { tipo: 'crucigrama', titulo, filas, columnas, celdas, palabras }
--   { tipo: 'criptograma', titulo, frase, pista, clave, reveladas }
--
-- Las mismas policies de library_materials (052) deciden quién lo ve: el
-- juego compartido lo juega el curso del material. Las respuestas viajan en
-- este JSON: es un juego para repasar, no una evaluación.

ALTER TABLE library_materials
  ADD COLUMN IF NOT EXISTS visual JSONB;
