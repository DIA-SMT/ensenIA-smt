-- ═══════════════════════════════════════════════════════════════════
-- 022 — Varias escuelas por persona, superadmin y gestión por escuela
--
-- Hasta ahora cada usuario tenía una escuela y un rol fijos en profiles,
-- y todo (escuelas, cursos, materias, docentes, alumnos, familias) se
-- cargaba con los seeds. Esta migración arma la base para gestionarlo
-- desde la app:
--
--  · school_memberships: quién pertenece a qué escuela y con qué rol. Es
--    la fuente de verdad. Un docente puede estar en varias escuelas, o
--    ser docente en una y director en otra.
--  · profiles.school_id / profiles.role pasan a ser la escuela ACTIVA:
--    una de sus membresías. Todas las policies existentes usan
--    auth_school_id()/auth_role(), así que siguen funcionando sin tocar;
--    cambiar de escuela es elegir otra membresía (switch_school).
--  · auth_school_id()/auth_role() validan contra la membresía: si a
--    alguien lo sacan de una escuela, pierde el acceso en el acto.
--  · superadmin: gestiona escuelas y todo lo administrativo de cada una.
--    No ve datos sensibles de los chicos (observaciones, check-ins,
--    notas): ninguna policy de esas tablas lo menciona.
--  · director: gestiona su escuela (cursos, materias, docentes y sus
--    asignaciones, alumnos, familias). No crea directores.
--  · los alumnos se inscriben solos en las materias de su curso.
--
-- Requiere la 021 (valor 'superadmin' del enum) ya aplicada.
-- ═══════════════════════════════════════════════════════════════════

-- ══ 1. Perfiles ══

-- El superadmin no pertenece a una escuela
ALTER TABLE profiles ALTER COLUMN school_id DROP NOT NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_school_required;
ALTER TABLE profiles ADD CONSTRAINT profiles_school_required
  CHECK (role = 'superadmin' OR school_id IS NOT NULL);

-- DNI: identifica a la persona y es el usuario de los alumnos
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dni TEXT UNIQUE;
-- Clave inicial generada por la escuela: se cambia al primer ingreso
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- ══ 2. Membresías ══

CREATE TABLE IF NOT EXISTS school_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  role user_role NOT NULL CHECK (role <> 'superadmin'),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Un rol por escuela (el director que además da clases, entra como director)
  UNIQUE (user_id, school_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_school ON school_memberships(school_id, role);

ALTER TABLE school_memberships ENABLE ROW LEVEL SECURITY;

-- Los usuarios que ya existen quedan con su escuela y rol de siempre
INSERT INTO school_memberships (user_id, school_id, role)
SELECT id, school_id, role FROM profiles
WHERE role <> 'superadmin' AND school_id IS NOT NULL
ON CONFLICT (user_id, school_id) DO NOTHING;

-- ══ 3. Quién soy: validado contra la membresía ══

CREATE OR REPLACE FUNCTION auth_school_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.school_id FROM profiles p
  WHERE p.id = auth.uid()
    AND EXISTS (SELECT 1 FROM school_memberships m
                WHERE m.user_id = p.id AND m.school_id = p.school_id AND m.role = p.role)
$$;

CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role FROM profiles p
  WHERE p.id = auth.uid()
    AND (p.role = 'superadmin'
         OR EXISTS (SELECT 1 FROM school_memberships m
                    WHERE m.user_id = p.id AND m.school_id = p.school_id AND m.role = p.role))
$$;

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
$$;

-- ¿Puedo gestionar esta escuela? Superadmin, o director de ella (activa o no).
CREATE OR REPLACE FUNCTION manages_school(p_school UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_superadmin() OR EXISTS (
    SELECT 1 FROM school_memberships
    WHERE user_id = auth.uid() AND school_id = p_school AND role = 'director'
  )
$$;

-- ¿Esta persona es <rol> en esta escuela?
CREATE OR REPLACE FUNCTION is_member_as(p_user UUID, p_school UUID, p_role user_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_memberships
    WHERE user_id = p_user AND school_id = p_school AND role = p_role
  )
$$;

-- ¿Esta persona es de mi escuela activa? / ¿de alguna escuela que gestiono?
-- SECURITY DEFINER a propósito: adentro de una policy, un EXISTS sobre
-- school_memberships pasaría por su RLS, y un docente solo ve sus
-- propias membresías (no vería a sus colegas).
CREATE OR REPLACE FUNCTION shares_active_school(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_memberships
    WHERE user_id = p_user AND school_id = auth_school_id()
  )
$$;

CREATE OR REPLACE FUNCTION is_managed_member(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_superadmin() OR EXISTS (
    SELECT 1 FROM school_memberships m
    JOIN school_memberships me
      ON me.school_id = m.school_id AND me.user_id = auth.uid() AND me.role = 'director'
    WHERE m.user_id = p_user
  )
$$;

CREATE OR REPLACE FUNCTION course_school(p_course UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT school_id FROM courses WHERE id = p_course $$;

CREATE OR REPLACE FUNCTION subject_school(p_subject UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT school_id FROM subjects WHERE id = p_subject $$;

CREATE OR REPLACE FUNCTION student_school(p_student UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT school_id FROM students WHERE id = p_student $$;

-- ══ 4. Alta de usuarios y protección del perfil ══

-- Rol, escuela, DNI y "cambiar clave" vienen de app_metadata (solo lo
-- escribe la service role, 017). Además deja creada la membresía.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r user_role := COALESCE((NEW.raw_app_meta_data->>'role')::user_role, 'estudiante');
  s UUID := (NEW.raw_app_meta_data->>'school_id')::UUID;
BEGIN
  INSERT INTO public.profiles
    (id, email, first_name, last_name, role, school_id, avatar_initials, dni, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    r,
    s,
    COALESCE(NEW.raw_user_meta_data->>'avatar_initials', ''),
    NULLIF(NEW.raw_app_meta_data->>'dni', ''),
    COALESCE((NEW.raw_app_meta_data->>'must_change_password')::BOOLEAN, false)
  );
  IF r <> 'superadmin' AND s IS NOT NULL THEN
    INSERT INTO public.school_memberships (user_id, school_id, role) VALUES (NEW.id, s, r)
    ON CONFLICT (user_id, school_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Reemplaza la de la 017. Desde la app:
--  · id, email y DNI no se tocan (el DNI es el usuario: se cambia por
--    la función de servidor, junto con la cuenta);
--  · rol + escuela solo pueden pasar a otra membresía propia: es cambiar
--    de escuela activa. Nadie puede darse un rol que no tiene, ni
--    hacerse superadmin (no hay membresías de superadmin).
CREATE OR REPLACE FUNCTION protect_profile_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.dni IS DISTINCT FROM OLD.dni
  THEN
    RAISE EXCEPTION 'El email y el DNI del perfil no se pueden cambiar desde la app'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.school_id IS DISTINCT FROM OLD.school_id)
     AND NOT is_member_as(NEW.id, NEW.school_id, NEW.role)
  THEN
    RAISE EXCEPTION 'Solo se puede pasar a una escuela y rol que la persona ya tenga'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Cambiar de escuela activa (el rol es el de esa membresía)
CREATE OR REPLACE FUNCTION switch_school(p_school UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r user_role;
BEGIN
  SELECT role INTO r FROM school_memberships
  WHERE user_id = auth.uid() AND school_id = p_school;
  IF r IS NULL THEN
    RAISE EXCEPTION 'No pertenecés a esa escuela' USING ERRCODE = '42501';
  END IF;
  UPDATE profiles SET school_id = p_school, role = r WHERE id = auth.uid();
END;
$$;

-- Al sacar a alguien de una escuela: se va lo que dependía de eso, y si
-- era su escuela activa pasa a otra de las suyas (si tiene).
CREATE OR REPLACE FUNCTION on_membership_removed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  other RECORD;
BEGIN
  IF OLD.role = 'docente' THEN
    DELETE FROM teacher_assignments ta
    USING courses c
    WHERE ta.course_id = c.id AND c.school_id = OLD.school_id AND ta.teacher_id = OLD.user_id;
  ELSIF OLD.role = 'padre' THEN
    DELETE FROM student_guardians sg
    USING students s
    WHERE sg.student_id = s.id AND s.school_id = OLD.school_id AND sg.guardian_user_id = OLD.user_id;
  END IF;

  SELECT school_id, role INTO other FROM school_memberships
  WHERE user_id = OLD.user_id AND id <> OLD.id
  ORDER BY created_at LIMIT 1;

  IF other.school_id IS NOT NULL THEN
    UPDATE profiles SET school_id = other.school_id, role = other.role
    WHERE id = OLD.user_id AND school_id = OLD.school_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_removed ON school_memberships;
CREATE TRIGGER trg_membership_removed
  AFTER DELETE ON school_memberships
  FOR EACH ROW EXECUTE FUNCTION on_membership_removed();

-- ══ 5. Inscripción automática ══
-- Un alumno cursa todas las materias que se dan en su curso (las que
-- tienen docente asignado). Se mantiene sola: al dar de alta o cambiar
-- de curso a un alumno, y al asignar una materia nueva a un curso.

CREATE OR REPLACE FUNCTION gen_enrollment_code(p_subject UUID, p_course UUID)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  n INT;
BEGIN
  -- "Física" en 4° A → FIS4A-01, como los códigos de los seeds
  SELECT left(regexp_replace(translate(upper(sb.name), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z]', '', 'g'), 3)
         || c.year || regexp_replace(upper(c.division), '[^A-Z0-9]', '', 'g')
    INTO prefix
  FROM subjects sb, courses c
  WHERE sb.id = p_subject AND c.id = p_course;

  SELECT COALESCE(max(substring(enrollment_code FROM '-([0-9]+)$')::INT), 0) + 1 INTO n
  FROM enrollments WHERE subject_id = p_subject AND course_id = p_course;

  RETURN prefix || '-' || lpad(n::TEXT, 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION enroll_student_in_course(p_student UUID, p_course UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub UUID;
BEGIN
  FOR sub IN SELECT DISTINCT subject_id FROM teacher_assignments WHERE course_id = p_course LOOP
    INSERT INTO enrollments (student_id, subject_id, course_id, enrollment_code, school_id)
    VALUES (p_student, sub, p_course, gen_enrollment_code(sub, p_course), course_school(p_course))
    ON CONFLICT (student_id, subject_id, course_id) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION on_student_course_set()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.course_id IS NOT DISTINCT FROM OLD.course_id THEN RETURN NEW; END IF;
    -- Cambió de curso: deja de ver las materias del anterior
    DELETE FROM enrollments WHERE student_id = NEW.id AND course_id = OLD.course_id;
    UPDATE courses SET student_count = (SELECT count(*) FROM students WHERE course_id = OLD.course_id)
    WHERE id = OLD.course_id;
  END IF;
  PERFORM enroll_student_in_course(NEW.id, NEW.course_id);
  UPDATE courses SET student_count = (SELECT count(*) FROM students WHERE course_id = NEW.course_id)
  WHERE id = NEW.course_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_course_set ON students;
CREATE TRIGGER trg_student_course_set
  AFTER INSERT OR UPDATE OF course_id ON students
  FOR EACH ROW EXECUTE FUNCTION on_student_course_set();

CREATE OR REPLACE FUNCTION on_student_removed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE courses SET student_count = (SELECT count(*) FROM students WHERE course_id = OLD.course_id)
  WHERE id = OLD.course_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_removed ON students;
CREATE TRIGGER trg_student_removed
  AFTER DELETE ON students
  FOR EACH ROW EXECUTE FUNCTION on_student_removed();

-- Materia nueva en un curso: los alumnos del curso quedan inscriptos
CREATE OR REPLACE FUNCTION on_assignment_added()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st UUID;
BEGIN
  FOR st IN SELECT id FROM students WHERE course_id = NEW.course_id LOOP
    INSERT INTO enrollments (student_id, subject_id, course_id, enrollment_code, school_id)
    VALUES (st, NEW.subject_id, NEW.course_id, gen_enrollment_code(NEW.subject_id, NEW.course_id), course_school(NEW.course_id))
    ON CONFLICT (student_id, subject_id, course_id) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_added ON teacher_assignments;
CREATE TRIGGER trg_assignment_added
  AFTER INSERT ON teacher_assignments
  FOR EACH ROW EXECUTE FUNCTION on_assignment_added();

-- ══ 6. Policies de gestión ══
-- Se suman a las existentes (las policies se combinan con OR).

-- Escuelas: cada uno ve las suyas (para elegir la activa); el
-- superadmin las gestiona; el director edita los datos de la suya.
DROP POLICY IF EXISTS "Members see their schools" ON schools;
CREATE POLICY "Members see their schools"
  ON schools FOR SELECT
  USING (is_superadmin() OR EXISTS (
    SELECT 1 FROM school_memberships m WHERE m.school_id = schools.id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Superadmin creates schools" ON schools;
CREATE POLICY "Superadmin creates schools"
  ON schools FOR INSERT
  WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Managers update school" ON schools;
CREATE POLICY "Managers update school"
  ON schools FOR UPDATE
  USING (manages_school(id))
  WITH CHECK (manages_school(id));

DROP POLICY IF EXISTS "Superadmin deletes schools" ON schools;
CREATE POLICY "Superadmin deletes schools"
  ON schools FOR DELETE
  USING (is_superadmin());

-- Membresías: las propias, y todas las de las escuelas que gestiono.
-- Directores (alta, baja, cambio) solo los maneja el superadmin.
DROP POLICY IF EXISTS "Users see own memberships" ON school_memberships;
CREATE POLICY "Users see own memberships"
  ON school_memberships FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Managers see school memberships" ON school_memberships;
CREATE POLICY "Managers see school memberships"
  ON school_memberships FOR SELECT
  USING (manages_school(school_id));

DROP POLICY IF EXISTS "Managers add members" ON school_memberships;
CREATE POLICY "Managers add members"
  ON school_memberships FOR INSERT
  WITH CHECK (manages_school(school_id) AND (role <> 'director' OR is_superadmin()));

DROP POLICY IF EXISTS "Managers change members" ON school_memberships;
CREATE POLICY "Managers change members"
  ON school_memberships FOR UPDATE
  USING (manages_school(school_id) AND (role <> 'director' OR is_superadmin()))
  WITH CHECK (manages_school(school_id) AND (role <> 'director' OR is_superadmin()));

DROP POLICY IF EXISTS "Managers remove members" ON school_memberships;
CREATE POLICY "Managers remove members"
  ON school_memberships FOR DELETE
  USING (manages_school(school_id) AND (role <> 'director' OR is_superadmin()));

-- Perfiles: se ve a la gente de mi escuela activa aunque tenga otra
-- escuela activa, y el que gestiona ve a los miembros de sus escuelas.
DROP POLICY IF EXISTS "Users see members of their active school" ON profiles;
CREATE POLICY "Users see members of their active school"
  ON profiles FOR SELECT
  USING (shares_active_school(id));

DROP POLICY IF EXISTS "Managers see members of managed schools" ON profiles;
CREATE POLICY "Managers see members of managed schools"
  ON profiles FOR SELECT
  USING (is_managed_member(id));

-- Corregir nombres de su gente (rol, escuela, email y DNI siguen
-- protegidos por protect_profile_identity)
DROP POLICY IF EXISTS "Managers update member profiles" ON profiles;
CREATE POLICY "Managers update member profiles"
  ON profiles FOR UPDATE
  USING (is_managed_member(id));

-- Cursos y materias
DROP POLICY IF EXISTS "Managers manage courses" ON courses;
CREATE POLICY "Managers manage courses"
  ON courses FOR ALL
  USING (manages_school(school_id))
  WITH CHECK (manages_school(school_id));

DROP POLICY IF EXISTS "Managers manage subjects" ON subjects;
CREATE POLICY "Managers manage subjects"
  ON subjects FOR ALL
  USING (manages_school(school_id))
  WITH CHECK (manages_school(school_id));

-- Asignaciones: materia y curso de la misma escuela, y el docente tiene
-- que ser docente de esa escuela
DROP POLICY IF EXISTS "Managers manage assignments" ON teacher_assignments;
CREATE POLICY "Managers manage assignments"
  ON teacher_assignments FOR ALL
  USING (manages_school(course_school(course_id)))
  WITH CHECK (
    manages_school(course_school(course_id))
    AND subject_school(subject_id) = course_school(course_id)
    AND is_member_as(teacher_id, course_school(course_id), 'docente')
  );

-- Alumnos: el curso es de la escuela, y si tiene cuenta, la cuenta es de
-- un alumno de esa escuela
DROP POLICY IF EXISTS "Managers manage students" ON students;
CREATE POLICY "Managers manage students"
  ON students FOR ALL
  USING (manages_school(school_id))
  WITH CHECK (
    manages_school(school_id)
    AND course_school(course_id) = school_id
    AND (user_id IS NULL OR is_member_as(user_id, school_id, 'estudiante'))
  );

DROP POLICY IF EXISTS "Managers manage enrollments" ON enrollments;
CREATE POLICY "Managers manage enrollments"
  ON enrollments FOR ALL
  USING (manages_school(school_id))
  WITH CHECK (
    manages_school(school_id)
    AND course_school(course_id) = school_id
    AND subject_school(subject_id) = school_id
    AND student_school(student_id) = school_id
  );

-- Familias: el adulto tiene que ser familia (padre) en la escuela del alumno
DROP POLICY IF EXISTS "Managers manage guardian links" ON student_guardians;
CREATE POLICY "Managers manage guardian links"
  ON student_guardians FOR ALL
  USING (manages_school(student_school(student_id)))
  WITH CHECK (
    manages_school(student_school(student_id))
    AND is_member_as(guardian_user_id, student_school(student_id), 'padre')
  );
