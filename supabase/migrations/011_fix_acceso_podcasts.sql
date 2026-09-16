-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 011: acceso a los podcasts
--
--  Los podcasts se guardan en `podcasts/<materialId>.mp3`, pero la única
--  política de lectura del bucket compara contra `storage_path`, que es
--  donde vive el archivo ORIGINAL del material. Resultado: el MP3 se
--  generaba bien y quedaba en Storage, pero nadie podía reproducirlo —
--  ni el docente que lo creó ni los estudiantes.
--
--  Tampoco se podían borrar: la política de escritura exige que el
--  archivo esté bajo la carpeta <teacherId>/, y los podcasts no lo están.
--  Por eso al eliminar un material su MP3 quedaba huérfano para siempre.
-- ═══════════════════════════════════════════════

-- Leer el podcast: el docente dueño, dirección, y los estudiantes de la
-- materia cuando el material está compartido (mismas reglas que el original).
CREATE POLICY "Read podcasts via materials RLS"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'library'
    AND EXISTS (
      SELECT 1 FROM library_materials m
      WHERE m.podcast_path = objects.name
        AND (
          m.teacher_id = auth.uid()
          OR (auth_role() = 'director' AND m.school_id = auth_school_id())
          OR (
            m.is_shared_with_students
            AND m.subject_id IN (
              SELECT e.subject_id FROM enrollments e WHERE e.student_id = auth_student_id()
            )
          )
        )
    )
  );

-- Borrar el podcast propio, para que eliminar un material no deje basura.
CREATE POLICY "Teachers delete own podcasts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'library'
    AND EXISTS (
      SELECT 1 FROM library_materials m
      WHERE m.podcast_path = objects.name AND m.teacher_id = auth.uid()
    )
  );
