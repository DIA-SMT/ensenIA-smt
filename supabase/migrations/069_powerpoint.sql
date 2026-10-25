-- ═══════════════════════════════════════════════════════════════════
-- 069 — Subir PowerPoint (.pptx) a Mis materiales
--
-- Lo primero que hace un docente en la app es subir lo que ya tiene, y
-- buena parte son presentaciones. Hasta acá el depósito solo aceptaba PDF,
-- Word, fotos y audio: el PowerPoint ni aparecía para elegir.
--
--  · file_type 'pptx': el material es una presentación. La app lee el texto
--    de cada diapositiva (y sus notas) en el equipo, sin IA, y lo guarda en
--    extracted_text: la IA lo usa para placas, preguntas y demás.
--  · El depósito "library" acepta el tipo de un .pptx. El tope sigue igual
--    (20 MiB; la app achica las imágenes de adentro si pasa de 11 MB).
--
-- Los formatos viejos (.ppt, .doc) no: la app explica cómo guardarlos en el
-- formato nuevo o como PDF.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE file_type ADD VALUE IF NOT EXISTS 'pptx';

UPDATE storage.buckets
   SET allowed_mime_types = array_append(allowed_mime_types,
         'application/vnd.openxmlformats-officedocument.presentationml.presentation')
 WHERE id = 'library'
   AND NOT ('application/vnd.openxmlformats-officedocument.presentationml.presentation' = ANY (allowed_mime_types));

-- Comprobación: una fila, todo true (sin usar el valor nuevo en esta misma transacción)
SELECT
  EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'file_type' AND e.enumlabel = 'pptx') AS tipo_pptx,
  (SELECT 'application/vnd.openxmlformats-officedocument.presentationml.presentation' = ANY (allowed_mime_types)
     FROM storage.buckets WHERE id = 'library') AS deposito_acepta_pptx;
