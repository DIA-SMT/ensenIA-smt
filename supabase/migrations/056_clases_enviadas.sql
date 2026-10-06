-- 056 — Clases armadas enviadas al curso
--
-- El docente arma la clase de un tema (diapositivas, juego, diagrama, apunte,
-- tarea), la revisa y la manda al curso de una vez. Esta tabla agrupa lo que
-- se mandó junto, para que los chicos lo vean como "la clase de hoy" y no
-- como cinco materiales sueltos en una lista.
--
-- Lo que se ve de cada pieza lo siguen decidiendo sus propias reglas: el
-- material compartido (student_sees_material, 052) y la vista
-- student_activities (019). Acá solo están los ids: si una pieza se borra o se
-- deja de compartir, desaparece de la clase sin tocar esta fila.

CREATE TABLE IF NOT EXISTS clases_enviadas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id   UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  -- El tema de la planificación del que salió (si salió de uno)
  class_id     UUID REFERENCES planning_classes(id) ON DELETE SET NULL,
  titulo       TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 200),
  material_ids UUID[] NOT NULL DEFAULT '{}' CHECK (cardinality(material_ids) <= 12),
  activity_id  UUID REFERENCES activities(id) ON DELETE SET NULL,
  enviada_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clases_enviadas_curso_idx ON clases_enviadas (course_id, subject_id, enviada_at DESC);
CREATE INDEX IF NOT EXISTS clases_enviadas_docente_idx ON clases_enviadas (teacher_id, enviada_at DESC);

ALTER TABLE clases_enviadas ENABLE ROW LEVEL SECURITY;

-- El docente: las suyas, y solo para un curso y materia que dicta
DROP POLICY IF EXISTS "Teacher manages own sent classes" ON clases_enviadas;
CREATE POLICY "Teacher manages own sent classes"
  ON clases_enviadas FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND auth_role() = 'docente'
    AND school_id = auth_school_id()
    AND teaches(subject_id, course_id)
  );

-- La dirección: las de su escuela
DROP POLICY IF EXISTS "Director reads school sent classes" ON clases_enviadas;
CREATE POLICY "Director reads school sent classes"
  ON clases_enviadas FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

-- El estudiante: las de su curso en una materia que cursa
DROP POLICY IF EXISTS "Student reads sent classes of their course" ON clases_enviadas;
CREATE POLICY "Student reads sent classes of their course"
  ON clases_enviadas FOR SELECT
  USING (auth_role() = 'estudiante' AND student_sees_material(subject_id, course_id, teacher_id));
