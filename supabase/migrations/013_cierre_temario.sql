-- ════════════════════════════════════════════════════════════════════
--  ENSEÑIA SMT — 013: cierre de la revisión del temario por trimestre
--
--  La 012 volvió planning_units contenido de cara a estudiantes y
--  familias. Eso movió el piso de tres cosas que hasta entonces eran
--  inocuas, y que la revisión adversarial encontró:
--
--   1. planning_classes delegaba su ESCRITURA en el SELECT de
--      planning_units. Al darle SELECT a los estudiantes, les dimos
--      INSERT, UPDATE y DELETE sobre la planificación de sus docentes.
--      Verificado en vivo: una alumna pudo modificar, insertar y borrar
--      clases de una unidad publicada de su materia.
--
--   2. planning_units nunca ató subject_id ni course_id en su WITH
--      CHECK. Mientras la unidad solo la veía su autor, daba igual;
--      ahora publica temario en el curso que diga la fila.
--
--   3. Las policies de tutores de la 012 resuelven un EXISTS sobre
--      enrollments, tabla en la que los tutores no tenían SELECT: el
--      temario y los criterios les llegaban SIEMPRE vacíos. Verificado
--      en vivo: la tutora ve a su hija y auth_guardian_student_ids()
--      devuelve el id, pero enrollments le devuelve 0 filas.
--
--  Además: el sello de autoría de evaluation_criteria pisaba created_by
--  en cada UPDATE, borrando quién redactó los criterios.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. planning_classes: la escritura es del docente dueño ──
-- Antes: "unit_id IN (SELECT id FROM planning_units)". Ese subselect
-- corre con la RLS de quien consulta, así que heredaba a CUALQUIERA que
-- pudiera leer la unidad. La lectura sí puede seguir heredando —el
-- estudiante necesita ver las clases de su temario—, la escritura no.

DROP POLICY IF EXISTS "Insert planning_classes via planning_units RLS" ON planning_classes;
DROP POLICY IF EXISTS "Update planning_classes via planning_units RLS" ON planning_classes;
DROP POLICY IF EXISTS "Delete planning_classes via planning_units RLS" ON planning_classes;

CREATE POLICY "Teachers insert classes of their own units"
  ON planning_classes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planning_units pu
      WHERE pu.id = planning_classes.unit_id
        AND pu.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers update classes of their own units"
  ON planning_classes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM planning_units pu
      WHERE pu.id = planning_classes.unit_id
        AND pu.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planning_units pu
      WHERE pu.id = planning_classes.unit_id
        AND pu.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers delete classes of their own units"
  ON planning_classes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM planning_units pu
      WHERE pu.id = planning_classes.unit_id
        AND pu.teacher_id = auth.uid()
    )
  );

-- ── 2. planning_units: publicar temario solo donde se dicta ──
-- Mismo binding que evaluation_criteria en la 012 y que term_grades en
-- la 011: materia+curso efectivamente asignados, y trimestre de la
-- propia escuela. Comprobado antes de aplicar: las 16 unidades de las
-- dos escuelas tienen su teacher_assignments, así que no bloquea nada
-- ya cargado.

DROP POLICY IF EXISTS "Teachers can insert their own planning" ON planning_units;
DROP POLICY IF EXISTS "Teachers can update their own planning" ON planning_units;

CREATE POLICY "Teachers can insert their own planning"
  ON planning_units FOR INSERT
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = planning_units.subject_id
        AND ta.course_id = planning_units.course_id
    )
    AND (
      term_id IS NULL
      OR EXISTS (
        SELECT 1 FROM academic_terms t
        WHERE t.id = planning_units.term_id
          AND t.school_id = auth_school_id()
      )
    )
  );

CREATE POLICY "Teachers can update their own planning"
  ON planning_units FOR UPDATE
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = planning_units.subject_id
        AND ta.course_id = planning_units.course_id
    )
    AND (
      term_id IS NULL
      OR EXISTS (
        SELECT 1 FROM academic_terms t
        WHERE t.id = planning_units.term_id
          AND t.school_id = auth_school_id()
      )
    )
  );

-- ── 3. Los tutores pueden leer la inscripción de sus hijos ──
-- Sin esto, las dos policies de tutores de la 012 nunca encuentran
-- nada: el temario y los criterios les llegan vacíos siempre.
-- Alcance: solo las filas de sus propios hijos.

DROP POLICY IF EXISTS "Guardians see enrollments of their children" ON enrollments;

CREATE POLICY "Guardians see enrollments of their children"
  ON enrollments FOR SELECT
  USING (student_id IN (SELECT auth_guardian_student_ids()));

-- ── 4. La autoría de los criterios no se reescribe al editar ──
-- created_by dice quién los redactó. Una materia puede tener dos
-- docentes (UNIQUE(teacher_id, subject_id, course_id) en la 001), y la
-- policy de la 012 deja editar a cualquiera de ellos: sin discriminar
-- TG_OP, la primera corrección ajena borraba al autor original.

CREATE OR REPLACE FUNCTION stamp_evaluation_criteria()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
