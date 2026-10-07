-- 060 — Mensajería interna: que toda la información se trabaje en un solo lugar
--
-- Decisiones del usuario (oct 2026):
--  · Se escriben dirección ↔ docentes, docentes entre sí, la escuela con las
--    familias y la escuela con los estudiantes. Entre estudiantes, nunca.
--  · Las conversaciones con estudiantes (menores) NUNCA son privadas: la
--    dirección de la escuela las puede leer, los mensajes no se borran ni se
--    editan, y la pantalla se lo dice a todos los que participan.
--  · Todo vive en la misma bandeja: comunicados y citaciones se responden
--    abriendo una conversación, y "quiero hablar con un docente" abre una.
--
-- Nadie escribe directo en las tablas: las conversaciones se crean por
-- iniciar_conversacion(), que valida cada par de personas (pueden_hablar), y
-- los mensajes solo los inserta quien participa. No hay UPDATE ni DELETE.

-- ══ 1. Tablas ══

CREATE TABLE IF NOT EXISTS conversaciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asunto            TEXT NOT NULL CHECK (char_length(asunto) BETWEEN 1 AND 160),
  creada_por        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Hay un estudiante adentro: la dirección la puede leer (supervisión)
  con_estudiante    BOOLEAN NOT NULL DEFAULT false,
  origen            TEXT NOT NULL DEFAULT 'mensaje'
                    CHECK (origen IN ('mensaje', 'comunicado', 'citacion', 'pedido_hablar', 'aviso_direccion')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_mensaje_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversacion_participantes (
  conversacion_id UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leido_hasta     TIMESTAMPTZ,
  archivada       BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (conversacion_id, user_id)
);

CREATE TABLE IF NOT EXISTS mensajes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  -- Si se da de baja la cuenta, el mensaje queda (registro) sin autor
  autor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cuerpo          TEXT NOT NULL CHECK (char_length(cuerpo) BETWEEN 1 AND 4000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensajes_conv_idx ON mensajes (conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS conv_part_user_idx ON conversacion_participantes (user_id);
CREATE INDEX IF NOT EXISTS conv_school_idx ON conversaciones (school_id, ultimo_mensaje_at DESC);

ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversacion_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;

-- ══ 2. Quién es quién ══

CREATE OR REPLACE FUNCTION es_participante(p_conv UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM conversacion_participantes WHERE conversacion_id = p_conv AND user_id = auth.uid())
$$;

-- La dirección supervisa las conversaciones con estudiantes de su escuela
CREATE OR REPLACE FUNCTION supervisa_conversacion(p_conv UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth_role() = 'director' AND EXISTS (
    SELECT 1 FROM conversaciones c
    WHERE c.id = p_conv AND c.con_estudiante AND c.school_id = auth_school_id())
$$;

CREATE OR REPLACE FUNCTION rol_en_escuela(p_user UUID, p_school UUID)
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM school_memberships WHERE user_id = p_user AND school_id = p_school
$$;
REVOKE EXECUTE ON FUNCTION rol_en_escuela(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ¿Estas dos personas se pueden escribir en esta escuela?
CREATE OR REPLACE FUNCTION pueden_hablar(p_a UUID, p_b UUID, p_school UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ra user_role := rol_en_escuela(p_a, p_school);
  rb user_role := rol_en_escuela(p_b, p_school);
  x UUID; rx user_role; y UUID; ry user_role;
BEGIN
  IF p_a IS NULL OR p_b IS NULL OR p_a = p_b OR ra IS NULL OR rb IS NULL THEN RETURN false; END IF;
  -- El equipo entre sí
  IF ra IN ('director', 'docente') AND rb IN ('director', 'docente') THEN RETURN true; END IF;
  -- Uno del equipo y otro que no (dos que no son del equipo, nunca)
  IF ra IN ('director', 'docente') THEN x := p_a; rx := ra; y := p_b; ry := rb;
  ELSIF rb IN ('director', 'docente') THEN x := p_b; rx := rb; y := p_a; ry := ra;
  ELSE
    -- Dos que no son del equipo: solo una familia con su propio hijo/a (para
    -- que el docente pueda hablar con los dos a la vez). Nunca chicos entre sí.
    RETURN (ra = 'padre' AND rb = 'estudiante' AND EXISTS (
              SELECT 1 FROM student_guardians sg JOIN students s ON s.id = sg.student_id
              WHERE sg.guardian_user_id = p_a AND s.user_id = p_b))
        OR (ra = 'estudiante' AND rb = 'padre' AND EXISTS (
              SELECT 1 FROM student_guardians sg JOIN students s ON s.id = sg.student_id
              WHERE sg.guardian_user_id = p_b AND s.user_id = p_a));
  END IF;
  IF rx = 'director' THEN RETURN ry IN ('estudiante', 'padre'); END IF;
  -- Docente: sus estudiantes (de alguna materia que les da) y las familias de esos chicos
  IF ry = 'estudiante' THEN
    RETURN EXISTS (
      SELECT 1 FROM students s
      JOIN enrollments e ON e.student_id = s.id
      JOIN teacher_assignments ta ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE s.user_id = y AND s.school_id = p_school AND ta.teacher_id = x);
  ELSIF ry = 'padre' THEN
    RETURN EXISTS (
      SELECT 1 FROM student_guardians sg
      JOIN students s ON s.id = sg.student_id
      JOIN enrollments e ON e.student_id = s.id
      JOIN teacher_assignments ta ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE sg.guardian_user_id = y AND s.school_id = p_school AND ta.teacher_id = x);
  END IF;
  RETURN false;
END;
$$;
REVOKE EXECUTE ON FUNCTION pueden_hablar(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ══ 3. Políticas: se lee si participás (o supervisás); se escribe si participás ══

DROP POLICY IF EXISTS "Participants and supervisors read conversations" ON conversaciones;
CREATE POLICY "Participants and supervisors read conversations"
  ON conversaciones FOR SELECT USING (es_participante(id) OR supervisa_conversacion(id));

DROP POLICY IF EXISTS "Participants and supervisors read participants" ON conversacion_participantes;
CREATE POLICY "Participants and supervisors read participants"
  ON conversacion_participantes FOR SELECT
  USING (es_participante(conversacion_id) OR supervisa_conversacion(conversacion_id));

DROP POLICY IF EXISTS "Participants and supervisors read messages" ON mensajes;
CREATE POLICY "Participants and supervisors read messages"
  ON mensajes FOR SELECT USING (es_participante(conversacion_id) OR supervisa_conversacion(conversacion_id));

DROP POLICY IF EXISTS "Participants write messages" ON mensajes;
CREATE POLICY "Participants write messages"
  ON mensajes FOR INSERT WITH CHECK (autor_id = auth.uid() AND es_participante(conversacion_id));
-- Sin UPDATE ni DELETE: los mensajes quedan como se escribieron.

-- Al llegar un mensaje: la conversación sube, el autor la tiene leída y
-- vuelve a la bandeja de quien la había archivado
CREATE OR REPLACE FUNCTION mensaje_nuevo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE conversaciones SET ultimo_mensaje_at = NEW.created_at WHERE id = NEW.conversacion_id;
  UPDATE conversacion_participantes
     SET archivada = false,
         leido_hasta = CASE WHEN user_id = NEW.autor_id THEN NEW.created_at ELSE leido_hasta END
   WHERE conversacion_id = NEW.conversacion_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mensaje_nuevo ON mensajes;
CREATE TRIGGER trg_mensaje_nuevo AFTER INSERT ON mensajes FOR EACH ROW EXECUTE FUNCTION mensaje_nuevo();

-- ══ 4. Abrir una conversación ══

-- Interna: la usan iniciar_conversacion (ya validado) y los avisos del sistema
CREATE OR REPLACE FUNCTION _abrir_conversacion(p_school UUID, p_creador UUID, p_personas UUID[], p_asunto TEXT, p_texto TEXT, p_origen TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_todos UUID[] := ARRAY(SELECT DISTINCT u FROM unnest(p_personas || p_creador) u WHERE u IS NOT NULL);
BEGIN
  INSERT INTO conversaciones (school_id, asunto, creada_por, con_estudiante, origen)
  VALUES (p_school, left(trim(p_asunto), 160), p_creador,
          EXISTS (SELECT 1 FROM unnest(v_todos) u WHERE rol_en_escuela(u, p_school) = 'estudiante'),
          p_origen)
  RETURNING id INTO v_id;
  INSERT INTO conversacion_participantes (conversacion_id, user_id) SELECT v_id, u FROM unnest(v_todos) u;
  INSERT INTO mensajes (conversacion_id, autor_id, cuerpo) VALUES (v_id, p_creador, left(trim(p_texto), 4000));
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION _abrir_conversacion(UUID, UUID, UUID[], TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION iniciar_conversacion(p_para UUID[], p_asunto TEXT, p_texto TEXT, p_origen TEXT DEFAULT 'mensaje')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me UUID := auth.uid();
  v_school UUID := auth_school_id();
  v_todos UUID[];
  i INT; j INT;
BEGIN
  IF v_school IS NULL OR rol_en_escuela(v_me, v_school) IS NULL THEN RAISE EXCEPTION 'No tenés escuela activa'; END IF;
  IF p_origen NOT IN ('mensaje', 'comunicado', 'citacion') THEN RAISE EXCEPTION 'Origen inválido'; END IF;
  IF coalesce(trim(p_asunto), '') = '' OR coalesce(trim(p_texto), '') = '' THEN RAISE EXCEPTION 'Falta el asunto o el mensaje'; END IF;

  v_todos := ARRAY(SELECT DISTINCT u FROM unnest(p_para || v_me) u WHERE u IS NOT NULL);
  IF cardinality(v_todos) < 2 THEN RAISE EXCEPTION 'Elegí a quién escribirle'; END IF;
  IF cardinality(v_todos) > 25 THEN RAISE EXCEPTION 'Para escribirle a muchos, usá Comunicaciones'; END IF;

  -- Un estudiante y una familia como mucho: si no, dos chicos (o dos
  -- familias) se escribirían entre sí a través del grupo
  IF (SELECT count(*) FROM unnest(v_todos) u WHERE rol_en_escuela(u, v_school) = 'estudiante') > 1 THEN
    RAISE EXCEPTION 'En una conversación puede haber un solo estudiante';
  END IF;
  IF (SELECT count(*) FROM unnest(v_todos) u WHERE rol_en_escuela(u, v_school) = 'padre') > 1 THEN
    RAISE EXCEPTION 'En una conversación puede haber una sola familia';
  END IF;
  -- Siempre con alguien del equipo: una charla solo entre un chico y su
  -- familia no es de la escuela (y la dirección la estaría leyendo)
  IF NOT EXISTS (SELECT 1 FROM unnest(v_todos) u WHERE rol_en_escuela(u, v_school) IN ('director', 'docente')) THEN
    RAISE EXCEPTION 'La conversación tiene que incluir a alguien de la escuela';
  END IF;

  -- Cada par de personas tiene que poder hablarse
  FOR i IN 1 .. cardinality(v_todos) LOOP
    FOR j IN i + 1 .. cardinality(v_todos) LOOP
      IF NOT pueden_hablar(v_todos[i], v_todos[j], v_school) THEN
        RAISE EXCEPTION '% y % no pueden estar en la misma conversación',
          coalesce(nombre_de(v_todos[i]), 'Alguien'), coalesce(nombre_de(v_todos[j]), 'alguien');
      END IF;
    END LOOP;
  END LOOP;

  RETURN _abrir_conversacion(v_school, v_me, v_todos, p_asunto, p_texto, p_origen);
END;
$$;
REVOKE EXECUTE ON FUNCTION iniciar_conversacion(UUID[], TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION iniciar_conversacion(UUID[], TEXT, TEXT, TEXT) TO authenticated;

-- ══ 5. Lo que muestra la bandeja ══

-- Cómo se presenta cada persona: "Docente · Lengua, Historia", "Estudiante · 2° A"…
CREATE OR REPLACE FUNCTION detalle_persona(p_user UUID, p_school UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE rol_en_escuela(p_user, p_school)
    WHEN 'director' THEN 'Dirección'
    WHEN 'docente' THEN 'Docente' || coalesce(' · ' || (
      SELECT string_agg(DISTINCT sb.name, ', ') FROM teacher_assignments ta JOIN subjects sb ON sb.id = ta.subject_id
      WHERE ta.teacher_id = p_user AND sb.school_id = p_school), '')
    WHEN 'estudiante' THEN 'Estudiante' || coalesce(' · ' || (
      SELECT c.name FROM students s JOIN courses c ON c.id = s.course_id WHERE s.user_id = p_user AND s.school_id = p_school LIMIT 1), '')
    WHEN 'padre' THEN 'Familia' || coalesce(' de ' || (
      SELECT string_agg(s.first_name || ' (' || c.name || ')', ', ')
      FROM student_guardians sg JOIN students s ON s.id = sg.student_id LEFT JOIN courses c ON c.id = s.course_id
      WHERE sg.guardian_user_id = p_user AND s.school_id = p_school), '')
    ELSE '' END
$$;
REVOKE EXECUTE ON FUNCTION detalle_persona(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION _resumen_conversacion(p_conv UUID, p_me UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'asunto', c.asunto,
    'origen', c.origen,
    'conEstudiante', c.con_estudiante,
    'ultimoMensajeAt', c.ultimo_mensaje_at,
    'archivada', coalesce(me.archivada, false),
    'soyParticipante', me.user_id IS NOT NULL,
    'sinLeer', me.user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM mensajes m WHERE m.conversacion_id = c.id
        AND m.created_at > coalesce(me.leido_hasta, '-infinity') AND m.autor_id IS DISTINCT FROM p_me),
    'ultimo', (SELECT jsonb_build_object('autor', coalesce(nombre_de(m.autor_id), '—'), 'cuerpo', left(m.cuerpo, 140))
               FROM mensajes m WHERE m.conversacion_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    'participantes', (SELECT jsonb_agg(jsonb_build_object(
                        'id', p.user_id, 'nombre', coalesce(nombre_de(p.user_id), '—'),
                        'rol', rol_en_escuela(p.user_id, c.school_id)) ORDER BY nombre_de(p.user_id))
                      FROM conversacion_participantes p WHERE p.conversacion_id = c.id)
  )
  FROM conversaciones c
  LEFT JOIN conversacion_participantes me ON me.conversacion_id = c.id AND me.user_id = p_me
  WHERE c.id = p_conv
$$;
REVOKE EXECUTE ON FUNCTION _resumen_conversacion(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Mis conversaciones (o las archivadas)
CREATE OR REPLACE FUNCTION mis_conversaciones(p_archivadas BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(_resumen_conversacion(c.id, auth.uid()) ORDER BY c.ultimo_mensaje_at DESC), '[]'::jsonb)
  FROM conversaciones c
  JOIN conversacion_participantes p ON p.conversacion_id = c.id AND p.user_id = auth.uid()
  WHERE c.school_id = auth_school_id() AND p.archivada = p_archivadas
$$;
REVOKE EXECUTE ON FUNCTION mis_conversaciones(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mis_conversaciones(BOOLEAN) TO authenticated;

-- Dirección: las conversaciones con estudiantes de la escuela en las que no está
CREATE OR REPLACE FUNCTION conversaciones_supervisadas()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth_role() = 'director' THEN (
    SELECT coalesce(jsonb_agg(_resumen_conversacion(c.id, auth.uid()) ORDER BY c.ultimo_mensaje_at DESC), '[]'::jsonb)
    FROM conversaciones c
    WHERE c.school_id = auth_school_id() AND c.con_estudiante
      AND NOT EXISTS (SELECT 1 FROM conversacion_participantes p WHERE p.conversacion_id = c.id AND p.user_id = auth.uid())
  ) END
$$;
REVOKE EXECUTE ON FUNCTION conversaciones_supervisadas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION conversaciones_supervisadas() TO authenticated;

-- Una conversación con sus mensajes (participante o dirección que supervisa)
CREATE OR REPLACE FUNCTION ver_conversacion(p_conv UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r JSONB;
BEGIN
  IF NOT (es_participante(p_conv) OR supervisa_conversacion(p_conv)) THEN RETURN NULL; END IF;
  r := _resumen_conversacion(p_conv, auth.uid());
  r := r || jsonb_build_object(
    'participantes', (SELECT jsonb_agg(jsonb_build_object(
        'id', p.user_id, 'nombre', coalesce(nombre_de(p.user_id), '—'),
        'rol', rol_en_escuela(p.user_id, c.school_id), 'detalle', detalle_persona(p.user_id, c.school_id))
        ORDER BY nombre_de(p.user_id))
      FROM conversacion_participantes p JOIN conversaciones c ON c.id = p.conversacion_id
      WHERE p.conversacion_id = p_conv),
    'mensajes', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'createdAt'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', m.id, 'autorId', m.autor_id, 'autor', coalesce(nombre_de(m.autor_id), 'Cuenta dada de baja'),
                                  'cuerpo', m.cuerpo, 'createdAt', m.created_at) AS x
        FROM mensajes m WHERE m.conversacion_id = p_conv
        ORDER BY m.created_at DESC LIMIT 300) y)
  );
  RETURN r;
END;
$$;
REVOKE EXECUTE ON FUNCTION ver_conversacion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ver_conversacion(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION marcar_conversacion_leida(p_conv UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE conversacion_participantes SET leido_hasta = now() WHERE conversacion_id = p_conv AND user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION marcar_conversacion_leida(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION marcar_conversacion_leida(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION archivar_conversacion(p_conv UUID, p_archivar BOOLEAN)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE conversacion_participantes SET archivada = p_archivar WHERE conversacion_id = p_conv AND user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION archivar_conversacion(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION archivar_conversacion(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION mensajes_sin_leer()
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::INT FROM conversacion_participantes p
  JOIN conversaciones c ON c.id = p.conversacion_id
  WHERE p.user_id = auth.uid() AND c.school_id = auth_school_id() AND NOT p.archivada
    AND EXISTS (SELECT 1 FROM mensajes m WHERE m.conversacion_id = c.id
                AND m.created_at > coalesce(p.leido_hasta, '-infinity') AND m.autor_id IS DISTINCT FROM auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION mensajes_sin_leer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mensajes_sin_leer() TO authenticated;

-- A quién le puedo escribir (para elegir en "Nuevo mensaje")
CREATE OR REPLACE FUNCTION mis_contactos()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', m.user_id, 'nombre', coalesce(nombre_de(m.user_id), '—'), 'rol', m.role,
           'detalle', detalle_persona(m.user_id, m.school_id))
         ORDER BY m.role, nombre_de(m.user_id)), '[]'::jsonb)
  FROM school_memberships m
  WHERE m.school_id = auth_school_id() AND m.user_id <> auth.uid()
    -- Estudiantes y familias le escriben al equipo (no entre ellos, ni al hijo/padre solo)
    AND (auth_role() IN ('director', 'docente') OR m.role IN ('director', 'docente'))
    AND pueden_hablar(auth.uid(), m.user_id, m.school_id)
$$;
REVOKE EXECUTE ON FUNCTION mis_contactos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mis_contactos() TO authenticated;

-- ══ 6. "Quiero hablar con un docente" también abre la conversación ══
-- La alerta de siempre sigue (es la que no puede fallar); la conversación es
-- para que el docente le pueda contestar al chico. Si no se pudiera abrir, la
-- alerta igual sale.

CREATE OR REPLACE FUNCTION pedir_hablar_con_docente(p_teacher UUID, p_motivo TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student UUID := auth_student_id();
  v_curso UUID;
  v_school UUID;
  v_creadas INT;
  v_docentes UUID[];
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Solo un estudiante puede pedir hablar con un docente' USING ERRCODE = '42501';
  END IF;
  SELECT course_id, school_id INTO v_curso, v_school FROM students WHERE id = v_student;
  IF p_teacher IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM teacher_assignments WHERE teacher_id = p_teacher AND course_id = v_curso
  ) THEN
    RAISE EXCEPTION 'Ese docente no es de tu curso' USING ERRCODE = '42501';
  END IF;

  v_creadas := pedido_hablar(v_student, p_teacher, p_motivo);

  BEGIN
    v_docentes := ARRAY(
      SELECT DISTINCT ta.teacher_id FROM teacher_assignments ta
      WHERE ta.course_id = v_curso AND (p_teacher IS NULL OR ta.teacher_id = p_teacher)
        AND pueden_hablar(auth.uid(), ta.teacher_id, v_school));
    IF cardinality(v_docentes) > 0 THEN
      PERFORM _abrir_conversacion(v_school, auth.uid(), v_docentes, 'Quiero hablar con vos',
        coalesce(nullif(left(trim(coalesce(p_motivo, '')), 500), ''), 'Quiero hablar con vos.'), 'pedido_hablar');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pedir_hablar_con_docente: no se pudo abrir la conversación: %', SQLERRM;
  END;

  RETURN v_creadas;
END;
$$;
REVOKE EXECUTE ON FUNCTION pedir_hablar_con_docente(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pedir_hablar_con_docente(UUID, TEXT) TO authenticated;
