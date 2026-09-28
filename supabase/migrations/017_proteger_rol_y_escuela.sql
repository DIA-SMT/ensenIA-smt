-- ═══════════════════════════════════════════════════════════════════
-- 017 — El rol y la escuela no se eligen desde la app
--
-- Dos agujeros por el mismo lado:
--
--  1. La policy "Users can update their own profile" (001) deja editar
--     la fila propia de profiles sin limitar columnas. Un estudiante o
--     una familia podía hacerse `role = 'director'` (o cambiarse de
--     escuela) con un UPDATE desde el navegador, y con eso ver
--     observaciones, check-ins y notas de toda la escuela.
--
--  2. handle_new_user (001) tomaba role y school_id de
--     raw_user_meta_data, que en un signUp lo escribe el propio usuario.
--     Con el registro público abierto, cualquiera con la anon key podía
--     crearse una cuenta de director.
--
-- El rol y la escuela pasan a ser datos que solo pone el backend:
--  · se leen de raw_app_meta_data, que solo se escribe con la service
--    role (auth.admin.createUser({ app_metadata })) — los seeds ya lo
--    mandan así;
--  · un trigger rechaza cualquier cambio de id/email/role/school_id que
--    venga de un usuario logueado. El SQL editor y la service role
--    siguen pudiendo corregirlos.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Alta de usuarios: rol y escuela solo desde app_metadata ──

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sin school_id en app_metadata el INSERT falla (NOT NULL) y el alta
  -- se cancela entera: un signUp desde la app no puede crear perfiles.
  INSERT INTO public.profiles (id, email, first_name, last_name, role, school_id, avatar_initials)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE((NEW.raw_app_meta_data->>'role')::user_role, 'estudiante'),
    (NEW.raw_app_meta_data->>'school_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'avatar_initials', '')
  );
  RETURN NEW;
END;
$$;

-- ── 2. Columnas que un usuario no puede tocar de su propio perfil ──

CREATE OR REPLACE FUNCTION protect_profile_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- auth.role() sale del JWT: 'authenticated'/'anon' desde la app,
  -- 'service_role' desde el backend, NULL desde el SQL editor.
  IF COALESCE(auth.role(), '') IN ('authenticated', 'anon')
     AND (NEW.id        IS DISTINCT FROM OLD.id
       OR NEW.email     IS DISTINCT FROM OLD.email
       OR NEW.role      IS DISTINCT FROM OLD.role
       OR NEW.school_id IS DISTINCT FROM OLD.school_id)
  THEN
    RAISE EXCEPTION 'El rol, la escuela y el email del perfil no se pueden cambiar desde la app'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_identity ON profiles;
CREATE TRIGGER protect_profile_identity
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_identity();
