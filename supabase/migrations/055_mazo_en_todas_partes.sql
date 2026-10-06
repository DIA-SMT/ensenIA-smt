-- 055 — El mismo mazo en todas partes
--
-- Las diapositivas estructuradas (library_materials.slides, 053) solo se
-- veían enteras en el editor. Para que la clase en vivo y los celulares de
-- los chicos muestren las mismas láminas:
--
-- 1) live_class_material devuelve también slides, tags, la materia y visual
--    (el juego o el diagrama, 054).
-- 2) Las imágenes de las láminas (rutas dentro de slides) se pueden leer
--    con las mismas reglas que el material: el docente dueño, la dirección
--    de la escuela, los estudiantes del curso si está compartido
--    (student_sees_material, 052) y los del curso de la clase en vivo
--    mientras el docente lo muestra. Antes solo las veía el docente: en el
--    celular de los chicos la lámina de imagen salía vacía.

-- ¿Esta ruta del bucket es la imagen de alguna lámina de este mazo?
CREATE OR REPLACE FUNCTION ruta_en_mazo(p_slides JSONB, p_ruta TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_slides IS NOT NULL AND jsonb_path_exists(
    p_slides,
    '$.diapositivas[*].imagen.ruta ? (@ == $r)',
    jsonb_build_object('r', p_ruta)
  )
$$;

-- 1) El material de la clase en vivo, con su mazo
CREATE OR REPLACE FUNCTION live_class_material(p_session UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s live_sessions%ROWTYPE;
  r JSONB;
BEGIN
  SELECT * INTO s FROM live_sessions WHERE id = p_session;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- El docente de la clase siempre; el alumno, solo si es de ese curso, la
  -- clase sigue en vivo y el docente lo está mostrando.
  IF s.teacher_id IS DISTINCT FROM auth.uid() AND NOT (
    s.status = 'live' AND s.material_visible AND s.course_id = auth_student_course_id()
  ) THEN
    RETURN NULL;
  END IF;

  IF s.class_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'tipo', 'tema',
             'id', c.id,
             'titulo', c.title,
             'unidad', u.title,
             'objetivos', to_jsonb(COALESCE(c.objectives, '{}'::text[])),
             'contenido', c.content
           ) INTO r
    FROM planning_classes c JOIN planning_units u ON u.id = c.unit_id
    WHERE c.id = s.class_id;
  ELSIF s.material_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'tipo', 'material',
             'id', m.id,
             'titulo', m.title,
             'descripcion', m.description,
             'file_type', m.file_type,
             'file_name', m.file_name,
             'storage_path', m.storage_path,
             'video_url', m.video_url,
             'texto', m.extracted_text,
             'slides', m.slides,
             'tags', to_jsonb(COALESCE(m.tags, '{}'::text[])),
             'materia', m.subject_name,
             'visual', m.visual
           ) INTO r
    FROM library_materials m
    WHERE m.id = s.material_id;
  END IF;

  RETURN r;
END;
$$;

-- 2a) Archivos de la clase en vivo: el archivo del material o una imagen de sus láminas
CREATE OR REPLACE FUNCTION is_live_class_file(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM live_sessions ls
    JOIN library_materials m ON m.id = ls.material_id
    WHERE (m.storage_path = p_name OR ruta_en_mazo(m.slides, p_name))
      AND ls.status = 'live'
      AND ls.material_visible
      AND ls.course_id = auth_student_course_id()
  )
$$;

-- 2b) Imágenes de las láminas de un material compartido o de la escuela
DROP POLICY IF EXISTS "Read slide images via materials RLS" ON storage.objects;
CREATE POLICY "Read slide images via materials RLS"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'library'
    AND EXISTS (
      SELECT 1 FROM library_materials m
      -- Las imágenes se guardan en la carpeta del docente: acota la búsqueda
      WHERE m.teacher_id::text = (storage.foldername(objects.name))[1]
        AND ruta_en_mazo(m.slides, objects.name)
        AND (
          (auth_role() = 'director' AND m.school_id = auth_school_id())
          OR (m.is_shared_with_students AND student_sees_material(m.subject_id, m.course_id, m.teacher_id))
        )
    )
  );
