-- ═══════════════════════════════════════════════════════════════════
-- 062 — El año armado: planificación con fechas, días sin clase y
--       memoria del docente
--
-- Pedido del usuario (oct 2026): el paso inicial de la app es que el docente
-- planifique. Sus días y horarios son fijos todo el año, así que con el
-- programa subido la planificación inicial tiene que salir con fechas.
--  · Los días sin clase (feriados, receso, jornadas) los carga la dirección,
--    una vez por escuela. Los feriados nacionales se cargan con un botón.
--  · Las fechas salen del horario fijo del docente (schedule_blocks), dentro
--    de los trimestres (academic_terms) y sin los días sin clase.
--  · Cada clase (tema) de la planificación guarda la fecha en que arranca:
--    puede ocupar varios encuentros, hasta que empieza la siguiente.
--  · El reparto es por reglas, sin IA: la IA solo lee el programa, una vez.
--  · Importar el programa es de una vez (todo o nada) y no duplica unidades.
--  · Memoria del docente: la IA recuerda cómo trabaja (formatos, enfoque, lo
--    que corrige, cómo es cada curso en general) para no pedírselo de nuevo.
--    La ve y la borra él; nadie más la lee. Nunca guarda nada de un
--    estudiante en particular (lo filtra el servidor antes de guardar).
--
-- Las funciones de la planificación corren con los permisos del docente
-- (sin SECURITY DEFINER): la RLS de planning_units y planning_classes (026,
-- 027) sigue decidiendo qué puede tocar.
--
-- Se puede correr más de una vez.
-- ═══════════════════════════════════════════════════════════════════


-- ══ 1. Días sin clase ══

CREATE TABLE IF NOT EXISTS dias_sin_clase (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  desde      DATE NOT NULL,
  hasta      DATE NOT NULL,
  motivo     TEXT NOT NULL CHECK (char_length(motivo) BETWEEN 2 AND 120),
  tipo       TEXT NOT NULL DEFAULT 'escuela' CHECK (tipo IN ('feriado', 'receso', 'jornada', 'escuela')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un receso largo entra entero; más de dos meses es un error de carga
  CHECK (hasta >= desde AND hasta - desde <= 62),
  UNIQUE (school_id, desde, motivo)
);

CREATE INDEX IF NOT EXISTS dias_sin_clase_escuela_idx ON dias_sin_clase (school_id, desde);

ALTER TABLE dias_sin_clase ENABLE ROW LEVEL SECURITY;

-- Toda la escuela los ve (el docente, para sus fechas)
DROP POLICY IF EXISTS "School members see days without class" ON dias_sin_clase;
CREATE POLICY "School members see days without class"
  ON dias_sin_clase FOR SELECT
  USING (school_id = auth_school_id() OR manages_school(school_id));

-- Los carga la dirección (o el superadmin, como el resto de la gestión)
DROP POLICY IF EXISTS "Managers manage days without class" ON dias_sin_clase;
CREATE POLICY "Managers manage days without class"
  ON dias_sin_clase FOR ALL
  USING (manages_school(school_id))
  WITH CHECK (manages_school(school_id));

-- Quién lo cargó lo pone la base, no el cliente (y no cambia al editar)
CREATE OR REPLACE FUNCTION dias_sin_clase_autor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dias_sin_clase_autor ON dias_sin_clase;
CREATE TRIGGER trg_dias_sin_clase_autor
  BEFORE INSERT OR UPDATE ON dias_sin_clase
  FOR EACH ROW EXECUTE FUNCTION dias_sin_clase_autor();


-- ══ 2. Feriados nacionales (Ley 27.399) ══
-- Inamovibles en su fecha; trasladables: martes y miércoles pasan al lunes
-- anterior, jueves y viernes al lunes siguiente. Carnaval y Viernes Santo
-- salen de la Pascua. Los días no laborables con fines turísticos y los
-- provinciales (en Tucumán, el 24 de septiembre) los agrega la dirección.

CREATE OR REPLACE FUNCTION fecha_pascua(p_anio INT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  -- Algoritmo anónimo gregoriano (Meeus/Jones/Butcher)
  a INT := p_anio % 19;
  b INT := p_anio / 100;
  c INT := p_anio % 100;
  d INT := b / 4;
  e INT := b % 4;
  f INT := (b + 8) / 25;
  g INT := (b - f + 1) / 3;
  h INT := (19 * a + b - d - g + 15) % 30;
  i INT := c / 4;
  k INT := c % 4;
  l INT := (32 + 2 * e + 2 * i - h - k) % 7;
  m INT := (a + 11 * h + 22 * l) / 451;
BEGIN
  RETURN make_date(p_anio, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
END;
$$;

CREATE OR REPLACE FUNCTION feriado_trasladado(p_fecha DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE extract(isodow FROM p_fecha)::int
    WHEN 2 THEN p_fecha - 1
    WHEN 3 THEN p_fecha - 2
    WHEN 4 THEN p_fecha + 4
    WHEN 5 THEN p_fecha + 3
    ELSE p_fecha
  END
$$;

CREATE OR REPLACE FUNCTION feriados_nacionales(p_anio INT)
RETURNS TABLE (fecha DATE, motivo TEXT)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT x.fecha, x.motivo FROM (
    VALUES
      (make_date(p_anio, 1, 1), 'Año Nuevo'),
      (fecha_pascua(p_anio) - 48, 'Carnaval'),
      (fecha_pascua(p_anio) - 47, 'Carnaval'),
      (make_date(p_anio, 3, 24), 'Día Nacional de la Memoria por la Verdad y la Justicia'),
      (make_date(p_anio, 4, 2), 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
      (fecha_pascua(p_anio) - 2, 'Viernes Santo'),
      (make_date(p_anio, 5, 1), 'Día del Trabajador'),
      (make_date(p_anio, 5, 25), 'Día de la Revolución de Mayo'),
      (feriado_trasladado(make_date(p_anio, 6, 17)), 'Paso a la Inmortalidad del Gral. Martín Miguel de Güemes'),
      (make_date(p_anio, 6, 20), 'Paso a la Inmortalidad del Gral. Manuel Belgrano'),
      (make_date(p_anio, 7, 9), 'Día de la Independencia'),
      (feriado_trasladado(make_date(p_anio, 8, 17)), 'Paso a la Inmortalidad del Gral. José de San Martín'),
      (feriado_trasladado(make_date(p_anio, 10, 12)), 'Día del Respeto a la Diversidad Cultural'),
      (feriado_trasladado(make_date(p_anio, 11, 20)), 'Día de la Soberanía Nacional'),
      (make_date(p_anio, 12, 8), 'Inmaculada Concepción de María'),
      (make_date(p_anio, 12, 25), 'Navidad')
  ) AS x(fecha, motivo)
$$;

-- La dirección los carga en su escuela (los que caen en día de semana). Si
-- ya estaban, no se duplican. Devuelve cuántos agregó.
CREATE OR REPLACE FUNCTION cargar_feriados_nacionales(p_school UUID, p_anio INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  IF NOT coalesce(manages_school(p_school), false) THEN
    RAISE EXCEPTION 'Solo la dirección de la escuela carga el calendario';
  END IF;
  IF p_anio IS NULL OR p_anio NOT BETWEEN 2024 AND 2100 THEN
    RAISE EXCEPTION 'Año inválido';
  END IF;
  INSERT INTO dias_sin_clase (school_id, desde, hasta, motivo, tipo)
  SELECT p_school, f.fecha, f.fecha, f.motivo, 'feriado'
  FROM feriados_nacionales(p_anio) f
  WHERE extract(isodow FROM f.fecha) <= 5
  ON CONFLICT (school_id, desde, motivo) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION cargar_feriados_nacionales(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cargar_feriados_nacionales(UUID, INT) TO authenticated;


-- ══ 3. La fecha de cada clase y el año de cada unidad ══
-- fecha: el día en que arranca ese tema. NULL = sin fecha todavía
-- (planificación vieja o sin horario cargado).
ALTER TABLE planning_classes ADD COLUMN IF NOT EXISTS fecha DATE;
CREATE INDEX IF NOT EXISTS idx_planning_classes_fecha ON planning_classes (unit_id, fecha);

-- anio: el ciclo lectivo de la unidad. Sin esto, planificar el año que
-- viene movía los temas que quedaron sin dar de este, y reimportar el mismo
-- programa no creaba nada ("ya estaban"). NULL = unidad de antes de la 062:
-- cuenta como del año en curso.
ALTER TABLE planning_units ADD COLUMN IF NOT EXISTS anio INT CHECK (anio BETWEEN 2020 AND 2100);

-- El año de una unidad (las de antes de la 062, el año en curso)
CREATE OR REPLACE FUNCTION anio_de_unidad(p_anio INT)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(p_anio, extract(year FROM (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int)
$$;


-- ══ 4. Los encuentros del año de un docente en una materia y curso ══
-- Cada día de su horario fijo dentro de los trimestres del año, menos los
-- días sin clase. Dos bloques el mismo día son un solo encuentro (más largo).
CREATE OR REPLACE FUNCTION fechas_de_clase(p_subject UUID, p_course UUID, p_anio INT DEFAULT NULL)
RETURNS TABLE (fecha DATE, minutos INT, trimestre INT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH escuela AS (
    SELECT school_id FROM courses WHERE id = p_course
  ),
  anio AS (
    SELECT coalesce(p_anio, extract(year FROM (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int) AS y
  ),
  bloques AS (
    SELECT day_index, round(sum(duration) * 60)::int AS minutos
    FROM schedule_blocks
    WHERE teacher_id = auth.uid() AND subject_id = p_subject AND course_id = p_course
    GROUP BY day_index
  ),
  trimestres AS (
    SELECT t.number, t.starts_on, t.ends_on
    FROM academic_terms t
    JOIN escuela e ON e.school_id = t.school_id
    CROSS JOIN anio a
    WHERE t.year = a.y
  )
  -- DISTINCT ON: si dos trimestres se pisan por un error de carga, el día
  -- cuenta una sola vez
  SELECT DISTINCT ON (d::date) d::date, b.minutos, t.number
  FROM trimestres t
  CROSS JOIN LATERAL generate_series(t.starts_on, t.ends_on, interval '1 day') AS d
  JOIN bloques b ON b.day_index = extract(isodow FROM d)::int - 1
  WHERE teaches(p_subject, p_course)
    AND NOT EXISTS (
      SELECT 1 FROM dias_sin_clase x
      JOIN escuela e ON e.school_id = x.school_id
      WHERE d::date BETWEEN x.desde AND x.hasta
    )
  ORDER BY d::date, t.number
$$;

REVOKE EXECUTE ON FUNCTION fechas_de_clase(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fechas_de_clase(UUID, UUID, INT) TO authenticated;


-- ══ 5. Repartir las clases en los encuentros ══
-- Las clases del año que faltan dar (no marcadas como dadas), en el orden
-- del programa, se reparten parejo en los encuentros desde p_desde (por
-- defecto, hoy). Las ya dadas conservan su fecha, y las de otro año no se
-- tocan. Con más clases que encuentros, algunas comparten día (y se avisa).
CREATE OR REPLACE FUNCTION reacomodar_planificacion(
  p_subject UUID, p_course UUID, p_anio INT DEFAULT NULL, p_desde DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_hoy DATE := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_anio INT := anio_de_unidad(p_anio);
  v_slots DATE[];
  v_clases UUID[];
  n INT;
  m INT;
BEGIN
  IF NOT coalesce(teaches(p_subject, p_course), false) THEN
    RAISE EXCEPTION 'No das esa materia en ese curso';
  END IF;

  SELECT array_agg(f.fecha ORDER BY f.fecha) INTO v_slots
  FROM fechas_de_clase(p_subject, p_course, v_anio) f
  WHERE f.fecha >= coalesce(p_desde, v_hoy);

  SELECT array_agg(c.id ORDER BY u.sort_order, u.created_at, u.id, c.sort_order, c.created_at, c.id)
  INTO v_clases
  FROM planning_classes c
  JOIN planning_units u ON u.id = c.unit_id
  WHERE u.teacher_id = auth.uid() AND u.subject_id = p_subject AND u.course_id = p_course
    AND anio_de_unidad(u.anio) = v_anio
    AND NOT c.is_complete;

  n := coalesce(array_length(v_clases, 1), 0);
  m := coalesce(array_length(v_slots, 1), 0);
  IF n = 0 THEN
    RETURN jsonb_build_object('clases', 0, 'encuentros', m);
  END IF;
  IF m = 0 THEN
    RAISE EXCEPTION 'No hay encuentros por delante en %: puede que ya haya terminado el ciclo, o que falte tu horario (Mis clases) o los trimestres (dirección)', v_anio;
  END IF;

  FOR i IN 1..n LOOP
    UPDATE planning_classes SET fecha = v_slots[1 + ((i - 1) * m) / n] WHERE id = v_clases[i];
  END LOOP;

  RETURN jsonb_build_object(
    'clases', n, 'encuentros', m, 'desde', v_slots[1], 'hasta', v_slots[m],
    'masClasesQueEncuentros', n > m);
END;
$$;

REVOKE EXECUTE ON FUNCTION reacomodar_planificacion(UUID, UUID, INT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reacomodar_planificacion(UUID, UUID, INT, DATE) TO authenticated;


-- ══ 6. Importar el programa, de una vez ══
-- p_unidades: [{ "titulo": "...", "clases": [{ "titulo": "...", "objetivos": ["..."] }] }]
-- (lo que devuelve process-document en modo import_program, ya elegido por
-- el docente). Una unidad que ya existe ese año (mismo título) no se
-- duplica. Si falla algo, no queda nada a medias. Después reparte las
-- fechas, salvo que el docente ya tuviera fechas ese año: esas no se pisan
-- (se avisa para que reacomode cuando quiera). Sin horario, importa igual y
-- avisa.
CREATE OR REPLACE FUNCTION importar_programa(
  p_subject UUID, p_course UUID, p_unidades JSONB, p_anio INT DEFAULT NULL, p_desde DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  u JSONB;
  c JSONB;
  v_titulo TEXT;
  v_unit UUID;
  v_orden INT;
  v_unidades INT := 0;
  v_clases INT := 0;
  v_repetidas INT := 0;
  v_j INT;
  v_reparto JSONB;
  v_anio INT := anio_de_unidad(p_anio);
  v_tenia_fechas BOOLEAN;
BEGIN
  IF NOT coalesce(teaches(p_subject, p_course), false) THEN
    RAISE EXCEPTION 'No das esa materia en ese curso';
  END IF;
  IF jsonb_typeof(p_unidades) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_unidades) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'El programa tiene que traer entre 1 y 40 unidades';
  END IF;

  -- ¿Ya tenía fechas puestas (o movidas a mano) este año?
  SELECT EXISTS (
    SELECT 1 FROM planning_classes c JOIN planning_units u ON u.id = c.unit_id
    WHERE u.teacher_id = auth.uid() AND u.subject_id = p_subject AND u.course_id = p_course
      AND anio_de_unidad(u.anio) = v_anio AND c.fecha IS NOT NULL
  ) INTO v_tenia_fechas;

  SELECT coalesce(max(sort_order), 0) INTO v_orden
  FROM planning_units
  WHERE teacher_id = auth.uid() AND subject_id = p_subject AND course_id = p_course
    AND anio_de_unidad(anio) = v_anio;

  FOR u IN SELECT * FROM jsonb_array_elements(p_unidades) LOOP
    v_titulo := left(trim(coalesce(u->>'titulo', '')), 200);
    CONTINUE WHEN v_titulo = '';
    IF EXISTS (
      SELECT 1 FROM planning_units
      WHERE teacher_id = auth.uid() AND subject_id = p_subject AND course_id = p_course
        AND anio_de_unidad(anio) = v_anio
        AND lower(trim(title)) = lower(v_titulo)
    ) THEN
      v_repetidas := v_repetidas + 1;
      CONTINUE;
    END IF;

    v_orden := v_orden + 1;
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, anio)
    VALUES (v_titulo, p_subject, p_course, auth.uid(), v_orden, v_anio)
    RETURNING id INTO v_unit;
    v_unidades := v_unidades + 1;

    v_j := 0;
    FOR c IN SELECT * FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(u->'clases') = 'array' THEN u->'clases' ELSE '[]'::jsonb END) LOOP
      EXIT WHEN v_j >= 30;
      CONTINUE WHEN trim(coalesce(c->>'titulo', '')) = '';
      v_j := v_j + 1;
      INSERT INTO planning_classes (unit_id, title, sort_order, objectives)
      VALUES (
        v_unit, left(trim(c->>'titulo'), 200), v_j,
        ARRAY(
          SELECT left(trim(o), 300)
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(c->'objetivos') = 'array' THEN c->'objetivos' ELSE '[]'::jsonb END) AS o
          WHERE trim(o) <> ''
          LIMIT 8
        )
      );
      v_clases := v_clases + 1;
    END LOOP;
  END LOOP;

  -- Las fechas. Si ya tenía fechas, no se pisan: los temas nuevos quedan sin
  -- fecha hasta que reacomode. Si no hay encuentros (sin horario o sin
  -- trimestres), la planificación queda igual, sin fechas, y se avisa.
  IF v_tenia_fechas THEN
    v_reparto := jsonb_build_object('pendiente', true);
  ELSE
    BEGIN
      v_reparto := reacomodar_planificacion(p_subject, p_course, v_anio, p_desde);
    EXCEPTION WHEN OTHERS THEN
      v_reparto := jsonb_build_object('error', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object(
    'unidades', v_unidades, 'clases', v_clases, 'repetidas', v_repetidas, 'fechas', v_reparto);
END;
$$;

REVOKE EXECUTE ON FUNCTION importar_programa(UUID, UUID, JSONB, INT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION importar_programa(UUID, UUID, JSONB, INT, DATE) TO authenticated;


-- ══ 7. Memoria del docente ══

CREATE TABLE IF NOT EXISTS memoria_docente (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Materia y curso (de sus asignaciones) o NULL = en general
  materia     TEXT CHECK (char_length(materia) <= 80),
  curso       TEXT CHECK (char_length(curso) <= 40),
  -- formato: cómo quiere los materiales · prefiere: enfoque o estilo ·
  -- evita: lo que corrige · grupo: cómo es un curso en general (nadie en
  -- particular) · trabajo: temas que ya trabajó con un curso
  tipo        TEXT NOT NULL CHECK (tipo IN ('formato', 'prefiere', 'evita', 'grupo', 'trabajo')),
  texto       TEXT NOT NULL CHECK (char_length(texto) BETWEEN 3 AND 200),
  veces       INT NOT NULL DEFAULT 1 CHECK (veces >= 1),
  primera_vez DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  ultima_vez  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memoria_docente_teacher_idx ON memoria_docente (teacher_id, materia);

ALTER TABLE memoria_docente ENABLE ROW LEVEL SECURITY;

-- El docente la ve y la borra. Escribe solo el servidor. Nadie más la lee.
DROP POLICY IF EXISTS "Teacher reads own memory" ON memoria_docente;
CREATE POLICY "Teacher reads own memory"
  ON memoria_docente FOR SELECT
  USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Teacher deletes own memory" ON memoria_docente;
CREATE POLICY "Teacher deletes own memory"
  ON memoria_docente FOR DELETE
  USING (teacher_id = auth.uid());

-- Apagada = no se guarda ni se usa (prendida por defecto: es su propio
-- trabajo, y la ve y la apaga cuando quiere)
CREATE TABLE IF NOT EXISTS memoria_docente_config (
  teacher_id   UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  activa       BOOLEAN NOT NULL DEFAULT true,
  -- Desde cuándo está prendida: al volver a prenderla no se relee lo que
  -- charló mientras estuvo apagada
  activa_desde TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE memoria_docente_config ADD COLUMN IF NOT EXISTS activa_desde TIMESTAMPTZ;
ALTER TABLE memoria_docente_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS memoria_docente_proceso (
  session_id      UUID PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  procesado_hasta TIMESTAMPTZ NOT NULL
);
ALTER TABLE memoria_docente_proceso ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION memoria_docente_activa(p_teacher UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT activa FROM memoria_docente_config WHERE teacher_id = p_teacher), true)
$$;
REVOKE EXECUTE ON FUNCTION memoria_docente_activa(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION memoria_docente_activa(UUID) TO service_role;

-- Desde cuándo procesar sus charlas: NULL si está apagada. Sin configurar
-- (nunca la tocó), -infinity: el servidor igual pone un piso de 30 días.
CREATE OR REPLACE FUNCTION memoria_docente_desde(p_teacher UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN memoria_docente_activa(p_teacher)
    THEN coalesce((SELECT activa_desde FROM memoria_docente_config WHERE teacher_id = p_teacher), '-infinity'::timestamptz)
  END
$$;
REVOKE EXECUTE ON FUNCTION memoria_docente_desde(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION memoria_docente_desde(UUID) TO service_role;

-- Mismo candado que la memoria de estudio: apagar y una charla que se está
-- procesando no pueden cruzarse.
CREATE OR REPLACE FUNCTION memoria_docente_candado(p_teacher UUID)
RETURNS VOID
LANGUAGE sql
AS $$ SELECT pg_advisory_xact_lock(hashtext('memoria_docente:' || p_teacher::text)) $$;
REVOKE EXECUTE ON FUNCTION memoria_docente_candado(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION memoria_docente_solo_si_activa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM memoria_docente_candado(NEW.teacher_id);
  IF NOT memoria_docente_activa(NEW.teacher_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memoria_docente_solo_si_activa ON memoria_docente;
CREATE TRIGGER trg_memoria_docente_solo_si_activa
  BEFORE INSERT OR UPDATE ON memoria_docente
  FOR EACH ROW EXECUTE FUNCTION memoria_docente_solo_si_activa();

DROP TRIGGER IF EXISTS trg_memoria_docente_proceso_solo_si_activa ON memoria_docente_proceso;
CREATE TRIGGER trg_memoria_docente_proceso_solo_si_activa
  BEFORE INSERT OR UPDATE ON memoria_docente_proceso
  FOR EACH ROW EXECUTE FUNCTION memoria_docente_solo_si_activa();

-- Prender o apagar. Apagar borra todo en el momento.
CREATE OR REPLACE FUNCTION cambiar_memoria_docente(p_activa BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_role() IS DISTINCT FROM 'docente' THEN
    RAISE EXCEPTION 'La memoria del docente es para docentes';
  END IF;
  IF p_activa IS NULL THEN
    RAISE EXCEPTION 'Falta la respuesta';
  END IF;
  PERFORM memoria_docente_candado(auth.uid());
  INSERT INTO memoria_docente_config (teacher_id, activa, activa_desde, updated_at)
  VALUES (auth.uid(), p_activa, CASE WHEN p_activa THEN now() END, now())
  ON CONFLICT (teacher_id) DO UPDATE SET
    activa = EXCLUDED.activa,
    -- Prenderla de nuevo corre la fecha; dejarla prendida, no
    activa_desde = CASE
      WHEN EXCLUDED.activa AND NOT memoria_docente_config.activa THEN now()
      WHEN EXCLUDED.activa THEN memoria_docente_config.activa_desde
    END,
    updated_at = now();
  IF NOT p_activa THEN
    DELETE FROM memoria_docente WHERE teacher_id = auth.uid();
    DELETE FROM memoria_docente_proceso WHERE teacher_id = auth.uid();
  END IF;
  RETURN memoria_docente_estado();
END;
$$;

CREATE OR REPLACE FUNCTION memoria_docente_estado()
RETURNS JSONB
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'activa', memoria_docente_activa(auth.uid()),
    'items', (SELECT count(*) FROM memoria_docente WHERE teacher_id = auth.uid()))
$$;

REVOKE EXECUTE ON FUNCTION cambiar_memoria_docente(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cambiar_memoria_docente(BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION memoria_docente_estado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION memoria_docente_estado() TO authenticated;

-- Reclamar un tramo de charla antes de procesarlo (como en la 061)
CREATE OR REPLACE FUNCTION reclamar_proceso_memoria_docente(p_session UUID, p_teacher UUID, p_hasta TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes TIMESTAMPTZ;
BEGIN
  SELECT procesado_hasta INTO v_antes
  FROM memoria_docente_proceso WHERE session_id = p_session
  FOR UPDATE;

  IF FOUND THEN
    IF v_antes >= p_hasta THEN
      RETURN jsonb_build_object('ok', false);
    END IF;
    UPDATE memoria_docente_proceso SET procesado_hasta = p_hasta WHERE session_id = p_session;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false);
    END IF;
    RETURN jsonb_build_object('ok', true, 'antes', v_antes);
  END IF;

  INSERT INTO memoria_docente_proceso (session_id, teacher_id, procesado_hasta)
  VALUES (p_session, p_teacher, p_hasta)
  ON CONFLICT (session_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'antes', NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION reclamar_proceso_memoria_docente(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reclamar_proceso_memoria_docente(UUID, UUID, TIMESTAMPTZ) TO service_role;

-- Lo que no se repite en 120 días se va (un docente cambia de cursos)
CREATE OR REPLACE FUNCTION limpiar_memoria_docente(p_teacher UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  DELETE FROM memoria_docente
  WHERE (p_teacher IS NULL OR teacher_id = p_teacher)
    AND ultima_vez < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 120;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION limpiar_memoria_docente(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION limpiar_memoria_docente(UUID) TO service_role;


-- Comprobación: tiene que dar todo true
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'planning_classes' AND column_name = 'fecha') AS clases_con_fecha,
  (SELECT count(*) FROM feriados_nacionales(2027)) = 16 AS feriados_2027,
  fecha_pascua(2026) = DATE '2026-04-05' AND fecha_pascua(2027) = DATE '2027-03-28' AS pascua,
  feriado_trasladado(DATE '2027-06-17') = DATE '2027-06-21' AS guemes_2027,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'planning_units' AND column_name = 'anio') AS unidades_con_anio,
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('memoria_docente_config', 'memoria_docente_proceso')) AS memoria_docente_sin_lectura_directa;
