-- ════════════════════════════════════════════════════════════════════
--  ENSEÑIA SMT — 014: quién puede escribir qué
--
--  Tres cosas que salieron del panel adversarial de la 013.
--
--  (A) FUERA DEL TEMARIO, pero verificado en vivo y grave: la policy de
--      activities de la 003 es FOR ALL con el dueño como único test.
--      Cualquier estudiante puede insertarse una actividad diciendo que
--      la docente es él, y queda publicada para todo el curso. Peor: al
--      ser "dueño" hereda las policies de docente sobre
--      activity_submissions y activity_events, o sea que lee y califica
--      las entregas que sus compañeros hagan en esa actividad.
--      Comprobado con una cuenta de estudiante real: el INSERT devolvió
--      201 (la fila de prueba se borró en el acto).
--
--  (B) La 013 ató planning_units a teacher_assignments pero dejó
--      planning_classes atada solo a la autoría. Como las clases son lo
--      que estudiantes y familias efectivamente leen, un docente al que
--      le sacaron la materia seguía reescribiendo el temario publicado.
--
--  (C) La 013 dejó un estado sin salida: despublicar es poner term_id en
--      NULL, o sea un UPDATE, que el WITH CHECK nuevo bloquea si la
--      asignación ya no está. La unidad quedaba publicada para siempre y
--      lo único que el docente podía hacer era BORRARLA, con sus clases
--      por cascada. Retirar algo del temario no puede exigir destruirlo.
-- ════════════════════════════════════════════════════════════════════

-- ── A. Las actividades son de quien dicta la materia ──
-- Mismo binding que term_grades (011), evaluation_criteria (012) y
-- planning_units (013): autoría + materia y curso efectivamente
-- asignados. Un estudiante no tiene filas en teacher_assignments, así
-- que deja de poder crear actividades a nombre propio.

DROP POLICY IF EXISTS "Teachers manage own activities" ON activities;

CREATE POLICY "Teachers manage activities of their assignments"
  ON activities FOR ALL
  USING (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = activities.subject_id
        AND ta.course_id = activities.course_id
    )
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = activities.subject_id
        AND ta.course_id = activities.course_id
    )
  );

-- ── B. Las clases siguen la misma regla que su unidad ──
-- Sin esto, la regla "se publica temario solo donde se dicta" se saltea
-- por abajo: la unidad queda congelada pero su contenido no.

DROP POLICY IF EXISTS "Teachers insert classes of their own units" ON planning_classes;
DROP POLICY IF EXISTS "Teachers update classes of their own units" ON planning_classes;
DROP POLICY IF EXISTS "Teachers delete classes of their own units" ON planning_classes;

CREATE POLICY "Teachers insert classes of units they teach"
  ON planning_classes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planning_units pu
      JOIN teacher_assignments ta
        ON ta.teacher_id = pu.teacher_id
       AND ta.subject_id = pu.subject_id
       AND ta.course_id = pu.course_id
      WHERE pu.id = planning_classes.unit_id
        AND pu.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers update classes of units they teach"
  ON planning_classes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM planning_units pu
      JOIN teacher_assignments ta
        ON ta.teacher_id = pu.teacher_id
       AND ta.subject_id = pu.subject_id
       AND ta.course_id = pu.course_id
      WHERE pu.id = planning_classes.unit_id
        AND pu.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planning_units pu
      JOIN teacher_assignments ta
        ON ta.teacher_id = pu.teacher_id
       AND ta.subject_id = pu.subject_id
       AND ta.course_id = pu.course_id
      WHERE pu.id = planning_classes.unit_id
        AND pu.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers delete classes of units they teach"
  ON planning_classes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM planning_units pu
      JOIN teacher_assignments ta
        ON ta.teacher_id = pu.teacher_id
       AND ta.subject_id = pu.subject_id
       AND ta.course_id = pu.course_id
      WHERE pu.id = planning_classes.unit_id
        AND pu.teacher_id = auth.uid()
    )
  );

-- ── C. Retirar del temario siempre se puede ──
-- Publicar exige la asignación; despublicar, no. El autor puede sacar su
-- unidad del temario aunque ya no dicte la materia — que es justo cuando
-- más hace falta. Volver a publicarla sigue exigiendo la asignación.

DROP POLICY IF EXISTS "Teachers can update their own planning" ON planning_units;

CREATE POLICY "Teachers can update their own planning"
  ON planning_units FOR UPDATE
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND (
      term_id IS NULL
      OR (
        EXISTS (
          SELECT 1 FROM teacher_assignments ta
          WHERE ta.teacher_id = auth.uid()
            AND ta.subject_id = planning_units.subject_id
            AND ta.course_id = planning_units.course_id
        )
        AND EXISTS (
          SELECT 1 FROM academic_terms t
          WHERE t.id = planning_units.term_id
            AND t.school_id = auth_school_id()
        )
      )
    )
  );
