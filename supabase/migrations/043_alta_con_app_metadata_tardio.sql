-- ═══════════════════════════════════════════════════════════════════
-- 043 — Alta de usuarios: el app_metadata llega después del INSERT
--
-- auth.admin.createUser({ app_metadata }) inserta el usuario en
-- auth.users solo con { provider, providers } y escribe el resto del
-- app_metadata (role, school_id, dni...) con un UPDATE en la misma
-- transacción. handle_new_user corre en el INSERT, no ve ni rol ni
-- escuela, arma un perfil 'estudiante' sin escuela y la check
-- profiles_school_required (039) tira abajo el alta entera:
-- "Database error creating new user" en los seeds y en admin-usuarios.
--
-- Ahora el perfil y la membresía se crean cuando el app_metadata trae
-- con qué armarlos, sea en el INSERT o en el UPDATE que le sigue:
--  · sin rol ni escuela (un signUp público, el "Add user" del dashboard)
--    queda un auth.user sin perfil: auth_role() y auth_school_id() dan
--    NULL y ninguna policy lo deja ver nada;
--  · si el perfil ya existe, el UPDATE no hace nada: cambiar rol o
--    escuela de alguien sigue siendo cosa de las membresías.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION crear_perfil_desde_auth(u auth.users)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r user_role := (u.raw_app_meta_data->>'role')::user_role;
  s UUID := (u.raw_app_meta_data->>'school_id')::UUID;
BEGIN
  -- Sin escuela solo se arma el superadmin; sin rol, nada
  IF r IS NULL OR (r <> 'superadmin' AND s IS NULL) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = u.id) THEN
    RETURN;
  END IF;

  INSERT INTO public.profiles
    (id, email, first_name, last_name, role, school_id, avatar_initials, dni, must_change_password)
  VALUES (
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'first_name', ''),
    COALESCE(u.raw_user_meta_data->>'last_name', ''),
    r,
    CASE WHEN r = 'superadmin' THEN NULL ELSE s END,
    COALESCE(u.raw_user_meta_data->>'avatar_initials', ''),
    NULLIF(u.raw_app_meta_data->>'dni', ''),
    COALESCE((u.raw_app_meta_data->>'must_change_password')::BOOLEAN, false)
  );
  IF r <> 'superadmin' THEN
    INSERT INTO public.school_memberships (user_id, school_id, role) VALUES (u.id, s, r)
    ON CONFLICT (user_id, school_id) DO NOTHING;
  END IF;
END;
$$;

-- Solo la usan los triggers de auth.users
REVOKE EXECUTE ON FUNCTION crear_perfil_desde_auth(auth.users) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM crear_perfil_desde_auth(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_app_metadata ON auth.users;
CREATE TRIGGER on_auth_user_app_metadata
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW
  WHEN (NEW.raw_app_meta_data IS DISTINCT FROM OLD.raw_app_meta_data)
  EXECUTE FUNCTION handle_new_user();
