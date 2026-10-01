-- ═══════════════════════════════════════════════════════════════════
-- Piloto · vaciar las dos escuelas y cargar el 2° A de la Storni
-- (generado por supabase/contenido/generar-carga-piloto.mjs; no editar a mano)
--
-- Qué hace, todo junto (si algo falla, no cambia nada):
--  1. Verifica que estén las dos escuelas del piloto, que no haya otras
--     escuelas con datos y que existan las dos docentes reales.
--  2. Borra todos los datos de prueba: docentes de demo, alumnos y familias
--     de prueba, cursos, materias, contenido, actividades, notas, avisos...
--     Se conservan las escuelas, sus trimestres, el superadmin y las cuentas
--     de María Eugenia Jiménez y Giuliana González.
--  3. Bloquea la clave de demo de las dos docentes (se les dan credenciales
--     reales cuando lleguen sus DNI).
--  4. Arma la Storni: 2° A, Matemática, Físico-Química y Lengua.
--  5. Carga el material verificado de Físico-Química y Matemática.
--     Lengua queda vacía hasta saber quién la dicta. La Mistral, vacía.
--
-- Se puede correr más de una vez: cada corrida deja exactamente lo mismo.
-- ═══════════════════════════════════════════════════════════════════

DO $carga$
DECLARE
  v_as uuid; v_gm uuid; v_curso uuid;
  v_mat uuid; v_fq uuid; v_len uuid;
  v_jime uuid; v_gonza uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid;
  v_u uuid; n int;
BEGIN
  -- ── 1. Verificaciones ──
  SELECT count(*) INTO n FROM schools WHERE name = 'Escuela Municipal Alfonsina Storni Secundaria';
  IF n <> 1 THEN RAISE EXCEPTION 'Tiene que haber exactamente una escuela "%", hay %', 'Escuela Municipal Alfonsina Storni Secundaria', n; END IF;
  SELECT count(*) INTO n FROM schools WHERE name = 'Escuela Municipal Gabriela Mistral Secundaria';
  IF n <> 1 THEN RAISE EXCEPTION 'Tiene que haber exactamente una escuela "%", hay %', 'Escuela Municipal Gabriela Mistral Secundaria', n; END IF;
  SELECT id INTO v_as FROM schools WHERE name = 'Escuela Municipal Alfonsina Storni Secundaria';
  SELECT id INTO v_gm FROM schools WHERE name = 'Escuela Municipal Gabriela Mistral Secundaria';

  -- Este script vacía tablas enteras: solo es seguro si no hay otras escuelas
  -- reales. La de la migración 014 es de prueba.
  SELECT count(*) INTO n FROM schools WHERE name NOT IN ('Escuela Municipal Alfonsina Storni Secundaria', 'Escuela Municipal Gabriela Mistral Secundaria', 'Escuela Municipal Alfonsina Storni');
  IF n > 0 THEN RAISE EXCEPTION 'Hay % escuela(s) además de las del piloto: no sigo para no borrar datos ajenos', n; END IF;

  SELECT id INTO v_jime FROM profiles WHERE email = 'mariaeugenia.jimenez@ensenia.edu.ar';
  IF v_jime IS NULL THEN RAISE EXCEPTION 'No encuentro la cuenta de María Eugenia Jiménez (%)', 'mariaeugenia.jimenez@ensenia.edu.ar'; END IF;
  SELECT id INTO v_gonza FROM profiles WHERE email = 'giuliana.gonzalez@ensenia.edu.ar';
  IF v_gonza IS NULL THEN RAISE EXCEPTION 'No encuentro la cuenta de Giuliana González (%)', 'giuliana.gonzalez@ensenia.edu.ar'; END IF;

  -- ── 2. Borrar los datos de prueba (hoja → raíz) ──
  DELETE FROM chat_messages;
  DELETE FROM chat_sessions;
  DELETE FROM ia_usage;
  DELETE FROM guardian_notices;
  DELETE FROM student_guardians;
  DELETE FROM student_observations;
  DELETE FROM student_checkins;
  DELETE FROM wellbeing_notes;
  DELETE FROM wellbeing_signals;
  DELETE FROM migue_sessions;
  DELETE FROM student_awards;
  DELETE FROM teacher_awards;
  DELETE FROM student_achievements;
  DELETE FROM student_badges;
  DELETE FROM student_progress;
  DELETE FROM vocational_profiles;
  DELETE FROM recorded_classes;
  DELETE FROM term_grades;
  DELETE FROM report_grades;
  DELETE FROM evaluation_criteria;
  DELETE FROM attendance_sessions;
  DELETE FROM practice_attempts;
  DELETE FROM student_notes;
  DELETE FROM alerts;
  DELETE FROM activity_events;
  DELETE FROM activity_submissions;
  DELETE FROM activities;
  DELETE FROM planning_classes;
  DELETE FROM planning_units;
  DELETE FROM material_reactions;
  DELETE FROM library_materials;
  DELETE FROM schedule_blocks;
  DELETE FROM course_group_members;
  DELETE FROM course_groups;
  DELETE FROM enrollments;
  DELETE FROM teacher_assignments;
  DELETE FROM students;
  DELETE FROM notifications;
  DELETE FROM communications;
  DELETE FROM quick_notes;
  DELETE FROM live_sessions;
  DELETE FROM school_policies;
  DELETE FROM audit_log;
  DELETE FROM courses;
  DELETE FROM subjects;

  -- Cuentas: quedan el superadmin y las dos docentes. Al borrar una cuenta
  -- caen su perfil y sus membresías.
  DELETE FROM auth.users
  WHERE id NOT IN (SELECT id FROM profiles WHERE role = 'superadmin')
    AND id NOT IN (v_jime, v_gonza);

  -- ── 3. Las dos docentes: solo docentes de la Storni, con la clave de demo bloqueada ──
  DELETE FROM school_memberships WHERE user_id IN (v_jime, v_gonza) AND school_id <> v_as;
  INSERT INTO school_memberships (user_id, school_id, role) VALUES (v_jime, v_as, 'docente'), (v_gonza, v_as, 'docente')
  ON CONFLICT (user_id, school_id) DO UPDATE SET role = 'docente';
  UPDATE profiles SET school_id = v_as, role = 'docente', must_change_password = true WHERE id IN (v_jime, v_gonza);
  UPDATE auth.users SET encrypted_password = extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf'))
  WHERE id IN (v_jime, v_gonza);

  -- ── 4. La Storni: trimestres, curso, materias y asignaciones ──
  INSERT INTO academic_terms (school_id, year, number, name, starts_on, ends_on) VALUES
    (v_as, 2026, 1, '1° Trimestre', DATE '2026-03-02', DATE '2026-06-05'),
    (v_as, 2026, 2, '2° Trimestre', DATE '2026-06-08', DATE '2026-09-11'),
    (v_as, 2026, 3, '3° Trimestre', DATE '2026-09-14', DATE '2026-12-11')
  ON CONFLICT (school_id, year, number) DO NOTHING;
  SELECT id INTO v_t1 FROM academic_terms WHERE school_id = v_as AND year = 2026 AND number = 1;
  SELECT id INTO v_t2 FROM academic_terms WHERE school_id = v_as AND year = 2026 AND number = 2;
  SELECT id INTO v_t3 FROM academic_terms WHERE school_id = v_as AND year = 2026 AND number = 3;

  INSERT INTO courses (name, year, division, school_id) VALUES ('2° A', 2, 'A', v_as) RETURNING id INTO v_curso;
  INSERT INTO subjects (name, color, school_id) VALUES ('Matemática', 'blue', v_as) RETURNING id INTO v_mat;
  INSERT INTO subjects (name, color, school_id) VALUES ('Físico-Química', 'purple', v_as) RETURNING id INTO v_fq;
  INSERT INTO subjects (name, color, school_id) VALUES ('Lengua', 'green', v_as) RETURNING id INTO v_len;
  INSERT INTO teacher_assignments (teacher_id, subject_id, course_id) VALUES (v_jime, v_fq, v_curso), (v_gonza, v_mat, v_curso);

  -- ── 5. Físico-Química (María Eugenia Jiménez) ──

    -- FQ 1.er trimestre · sin material de clase: un título por contenido de la planificación
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('Magnitudes y fuerzas', v_fq, v_curso, v_jime, 1, v_t1)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'Mediciones: concepto. Magnitudes. Sistema Internacional métrico (SI), sistema métrico legal argentino (SIMELA). Conversión de unidades. Ejercicios de aplicación.', 1, '{}'::text[], NULL),
      (v_u, 'Fuerza: concepto de fuerza. Representación de fuerzas, uso de vectores para representar fuerzas. Diagrama de fuerzas. Fuerza resultante. Unidades de medida. Sistema de fuerzas colineales y concurrentes.', 2, '{}'::text[], NULL);

    -- FQ 2.º trimestre · sin material de clase
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('Soluciones', v_fq, v_curso, v_jime, 2, v_t2)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'Sistemas materiales homogéneos.', 1, '{}'::text[], NULL),
      (v_u, 'Soluciones. Soluto y solvente. Fases y componentes. Tipos de soluciones por su estado de agregación. Concentración de soluciones.', 2, '{}'::text[], NULL),
      (v_u, 'Fraccionamiento de los componentes de una solución: destilación, destilación fraccionada, evaporación, cristalización.', 3, '{}'::text[], NULL),
      (v_u, 'Clasificación de las soluciones en función de la concentración y la temperatura saturada, sobresaturada.', 4, '{}'::text[], NULL);

    -- FQ 2.º trimestre · las 2 clases del apunte cubren los 2 contenidos de la planificación
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('Cambios físicos y químicos', v_fq, v_curso, v_jime, 3, v_t2)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'Transformaciones físicas y químicas', 1, ARRAY['Interpretación y diferenciación de los fenómenos físicos y químicos.']::text[], 'Las transformaciones de la materia se dividen en dos grandes grupos, según si cambia o no la identidad química de las sustancias: transformaciones físicas y transformaciones químicas.

### ¿Qué es un fenómeno físico?

Un fenómeno físico es un cambio que experimenta un cuerpo o una sustancia sin que se transforme en una sustancia nueva.

Puede cambiar su forma, tamaño, estado o aspecto, pero su composición física sigue siendo la misma.

Ejemplos:

1. El hielo se derrite y se transforma en agua.
2. Cortar una hoja de papel.
3. Romper un vaso.

### ¿Qué es un fenómeno químico?

Un fenómeno químico es un cambio en el que se forman una o más sustancias nuevas, con propiedades diferentes a las originales.

Ejemplos:

1. Quemar un papel.
2. Oxidación de un hierro.
3. La digestión de los alimentos.'),
      (v_u, 'Procesos reversibles e irreversibles', 2, ARRAY['Clasificación entre el proceso reversible e irreversible.']::text[], '### Procesos reversibles

Son aquellos cambios que pueden volver a su estado inicial.

Ejemplos:

1. Hielo → agua → hielo.
2. Estirar un resorte y dejarlo volver a su forma.

### Procesos irreversibles

Son aquellos que no pueden volver fácilmente al estado inicial.

Ejemplos:

1. Quemar madera.
2. Descomposición de una fruta.

### Actividades

**1)** Realizar un cuadro comparativo, con las características principales de los fenómenos o transformaciones físicas y químicas.

| Transformaciones físicas | Transformaciones químicas |
|---|---|
| | |
| | |
| | |
| | |

**2)** Indica si cada situación corresponde a un **fenómeno físico (FF)** o **fenómeno químico (FQ)**:

a) Derretimiento de un cubito de hielo. ___

b) Combustión de una vela. ___

c) Cortar una manzana. ___

d) Cocinar una torta. ___

e) Congelar agua. ___

f) Quemar un papel. ___

g) Congelar agua. ___');

    -- FQ 3.er trimestre · el apunte de tabla periódica cubre número atómico y másico, símbolos, tabla y
    -- metales/no metales; no cubre las partículas subatómicas, que van primero como título solo
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('El átomo', v_fq, v_curso, v_jime, 4, v_t3)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'El átomo. Partículas subatómicas: electrones, protones, neutrones. Ubicación de las partículas subatómicas.', 1, '{}'::text[], NULL),
      (v_u, 'La tabla periódica: definición, historia y evolución', 2, ARRAY['Estudio e interpretación de la tabla periódica.']::text[], '**Definición:** la tabla periódica de los elementos es un cuadro que organiza todos los elementos químicos conocidos según sus propiedades físicas y su número atómico.

### Historia y evolución de la tabla periódica

Doscientos años atrás, los químicos necesitaron establecer un criterio con el cual ordenar el gran número de elementos que ya se había descubierto. Para ordenar los elementos, en 1869 Dimitri Mendeléiev preveía la existencia de elementos no conocidos hasta la fecha. Mendeléiev organizó la clasificación para los 60 elementos conocidos hasta esa fecha y figuraban huecos, que serían ocupados por los elementos descubiertos próximamente. La clasificación de Mendeléiev presentaba un problema: los elementos estaban ubicados según las masas atómicas crecientes. Los ordenó en cinco filas horizontales llamadas “periodos” y en ocho columnas llamadas “grupos”.

En 1890 fue descubierta una familia de gases que no reaccionaban con ningún otro elemento. Se los llamó gases nobles o formales.

En 1910, Moseley realizó una serie de experimentos en los cuales observó las propiedades de los elementos que varían periódicamente según su número atómico.

Es por ello que la tabla de Mendeléiev fue organizada por Werner, quien organizó los elementos según el número atómico creciente en periodos y grupos. Actualmente tiene 7 periodos y 18 grupos.'),
      (v_u, 'Características de un elemento químico', 3, ARRAY['Conocimiento de los símbolos químicos.', 'Interpretación de los números atómicos y másicos.']::text[], '### Características de un elemento químico

- *Nombre del elemento:* carbono, cloro, etc.
- *Símbolo del elemento:* corresponde a la primera inicial del nombre en latín o griego.

Ejemplo: hidrógeno = H; oxígeno = O.

Existen otros símbolos que no parecen tener relación con su nombre.

Ejemplo: plata = Ag; potasio = K.

- *Número atómico (**Z**):* representa la cantidad de protones y el número de orden de un elemento en la tabla periódica.
- *Número de masa o masa atómica (**A**):* es la masa total de protones y neutrones en un solo átomo y puede calcularse: **A = Z + N**

Para calcular neutrones, debemos: **N = A − Z**

**Casillero de un elemento en la tabla periódica** (figura del apunte, con el hierro como ejemplo):

| Rótulo | Dato en el casillero |
|---|---|
| Número atómico | 26 |
| Símbolo químico | Fe |
| Nombre del elemento | Hierro |
| Masa atómica | 55.847 |'),
      (v_u, 'Clasificación de los elementos: metales, no metales y gases nobles', 4, ARRAY['Comparación de las características de los elementos químicos.', 'Estudio e interpretación de la tabla periódica.']::text[], 'Los elementos de la tabla periódica se clasifican en:

- Metales
- No metales
- Gases nobles o inertes

### Distribución en la tabla periódica

*(En el apunte hay un esquema de la tabla periódica coloreado por tipo de elemento: metales en verde claro, no metales en salmón y metaloides en verde oscuro a lo largo de una línea escalonada roja; grupos 1 a 18, con los grupos B (3 a 12) como elementos de transición; periodos 1 a 7; los gases nobles en la última columna; y abajo, lantánidos y actínidos como elementos de transición interna.)*

- Los **metales**: ocupan la zona izquierda y central, abarcando la gran mayoría de la tabla.
- Los **no metales**: se ubican en la zona superior derecha de la tabla periódica, justo por encima de la línea escalonada.
- **Gases nobles:** forman la última columna vertical a la extrema derecha de la tabla, correspondiente al grupo 18.
- **Metaloides** o **semimetales**: se encuentran justo sobre la línea en zigzag que sirve de frontera entre los metales y no metales.

### Características de los metales, no metales y gases nobles

| Metales | No metales | Gases nobles |
|---|---|---|
| Son buenos conductores del calor y la electricidad. Se oxidan. Tienen brillo intenso. Son maleables y dúctiles. Son sólidos a excepción del mercurio, que es líquido. | Son malos conductores del calor y la electricidad. Se reducen. Son electronegativos. La mayoría se encuentra en estado sólido. | Se ubican en el grupo 18. Los átomos tienen 8 electrones de valencia. No se combinan con ningún otro elemento. Solo a temperaturas exigentes pueden reaccionar. |

### Actividad: análisis de los elementos

Completar el cuadro con las características de los elementos químicos.

| Z | P | e | A | N | Nombre | Símbolo | Periodo | Grupo | Metales | No metales | Gases |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | | | | | | | | | | | |
| | | | | | | | | | | | |
| 47 | | | | | | | | | | | |
| | | | | | | | 3 | 18 | | | |
| | | | | | | Zn | | | | | |');

    -- Criterios de evaluación de la planificación, tal cual, publicados
    INSERT INTO evaluation_criteria (school_id, subject_id, course_id, term_id, criteria, is_published) VALUES
      (v_as, v_fq, v_curso, v_t1, '· Participación en clase.
· Acatamiento a las normas institucionales.
· Trabajos prácticos individuales y grupales.
· Control de carpetas.
· Evaluación trimestral teórica-práctica escrita.', true),
      (v_as, v_fq, v_curso, v_t2, '· Participación en clase.
· Trabajos prácticos individual y grupal.
· Control de carpetas.
· Trabajo de investigación de los métodos de separación de las soluciones.
· Exposición oral.', true),
      (v_as, v_fq, v_curso, v_t3, '· Trabajos prácticos individuales y grupales.
· Control de carpetas.
· Participación en clase.
· Evaluación trimestral semiestructurada.', true);

  -- ── 6. Matemática (Giuliana González) ──

    -- Matemática Eje 1 · borrador (el documento no dice trimestre)
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('Eje 1 · Números enteros', v_mat, v_curso, v_gonza, 1, NULL)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'Números enteros: Definición', 1, '{}'::text[], NULL),
      (v_u, 'Recta numérica', 2, '{}'::text[], NULL),
      (v_u, 'Orden', 3, '{}'::text[], NULL),
      (v_u, 'Valor absoluto', 4, '{}'::text[], NULL),
      (v_u, 'Operaciones: suma, resta, multiplicación y división', 5, '{}'::text[], NULL),
      (v_u, 'Potenciación', 6, '{}'::text[], NULL),
      (v_u, 'Radicación', 7, '{}'::text[], NULL),
      (v_u, 'Operaciones combinadas', 8, '{}'::text[], NULL),
      (v_u, 'Ecuaciones de primer grado con una incógnita', 9, '{}'::text[], NULL),
      (v_u, 'Aplicación de la propiedad distributiva en la resolución de ecuaciones', 10, '{}'::text[], NULL);

    -- Matemática Eje 2 · borrador; las 3 clases de sexagesimal en el lugar de "Operaciones"
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('Eje 2 · Ángulos', v_mat, v_curso, v_gonza, 2, NULL)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'Ángulos: Definición', 1, '{}'::text[], NULL),
      (v_u, 'Clasificación', 2, '{}'::text[], NULL),
      (v_u, 'Bisectriz de un ángulo', 3, '{}'::text[], NULL),
      (v_u, 'Sistema sexagesimal: definición y equivalencias', 4, ARRAY['Identificar y diferenciar grados, minutos y segundos.', 'Comprender las equivalencias.']::text[], '## Sistema sexagesimal

**Definición:**

El sistema sexagesimal, es un sistema de medición cuya base es 60. Se utiliza principalmente para medir la amplitud de los ángulos y también el tiempo.

En la medida de ángulos, la unidad fundamental es el grado sexagesimal **(°)**.

**Equivalencias fundamentales:**

- **1° → 60′**
- **1′ → 60″**
- **1° → 3600″** (60 . 60)'),
      (v_u, 'Operaciones con grados, minutos y segundos: suma y resta', 5, ARRAY['Aplicar correctamente las conversiones.']::text[], '## Operaciones con grados, minutos y segundos

### Suma

- Se suman por columnas
- Si los segundos son mayor o igual a 60, se pasan a minutos
- Si los minutos son mayor o igual a 60, se pasan a grados

Ejemplo:

```
    25°    35′    40″
  + 17°    50′    30″
  -------------------
    42°    85′    70″
     1°  +  1′   -60″
  -------------------
    43°    86′    10″
          -60′
          ----
           26′
```

= 43° 26′ 10″

### Resta

- Si no alcanza, se pide prestado

```
    47°    79′    75″
    48°    20′    15″
  - 16°    35′    40″
  -------------------
    31°    44′    35″
```

(En el ejemplo se tacha 48° 20′ 15″ y se escribe arriba 47° 79′ 75″.)

= 31° 44′ 35″'),
      (v_u, 'Operaciones con grados, minutos y segundos: multiplicación y división. Actividad', 6, ARRAY['Aplicar correctamente las conversiones.']::text[], '### Multiplicación

- Multiplicar por separado los grados, minutos y segundos
- Recordar las equivalencias

```
    15°    25′    32″
            x 3
  -------------------
    45°    75′    96″
  + 1°  +   1′   -60″
  -------------------
    46°    76′    36″
          -60′
          ----
           16′
```

= 46° 16′ 36″

### División

- Dividir primero los grados por el número indicado
- Si queda un resto de grados, convertir a minutos
- Si queda un resto de minutos, convertir a segundos

```
    46°    16′    36″  | 3
                       |________________
    16°   +60′   +60″     15°  25′  32″
          ----   ----
     1°    76′    96″
           16′    06″
            1′     0
```

= 15° 25′ 32″

## Actividad

Dados: α = 12° 24′ 35″ ; β = 15° 34′ 45″ ; γ = 23° 45′ 55″ ; λ = 58° 22′ 45″

Hallar:

- α + β
- λ − α
- 4 · γ
- λ : 3'),
      (v_u, 'Ángulos complementarios', 7, '{}'::text[], NULL),
      (v_u, 'Ángulos suplementarios', 8, '{}'::text[], NULL),
      (v_u, 'Ángulos determinados por dos rectas cortados por una transversal: alternos internos, alternos externos, correspondientes y conjugados', 9, '{}'::text[], NULL),
      (v_u, 'Ecuaciones de primer grado con una incógnita', 10, '{}'::text[], NULL);

    -- Matemática Eje 3 · publicado en el 3.er trimestre (07/09–04/12/2026 según la planificación)
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('Eje 3 · Superficie y perímetro', v_mat, v_curso, v_gonza, 3, v_t3)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'Superficie y perímetro: Definición – Fórmulas', 1, '{}'::text[], NULL),
      (v_u, 'Triángulos: Clasificación según sus lados y según sus ángulos', 2, '{}'::text[], NULL),
      (v_u, 'Cuadriláteros: Clasificación', 3, '{}'::text[], NULL),
      (v_u, 'Polígonos regulares: Definición – Clasificación', 4, '{}'::text[], NULL),
      (v_u, 'Superficie y perímetro: Situaciones problemáticas', 5, '{}'::text[], NULL),
      (v_u, 'Ecuaciones de primer grado con una incógnita', 6, '{}'::text[], NULL);
END
$carga$;

-- ── Resultado: qué quedó (revisalo) ──
SELECT s.name AS escuela, sb.name AS materia, u.sort_order AS orden, u.title AS unidad,
       COALESCE(t.number::text, 'borrador') AS trimestre,
       (SELECT count(*) FROM planning_classes pc WHERE pc.unit_id = u.id) AS clases,
       (SELECT count(*) FROM evaluation_criteria e WHERE e.subject_id = sb.id AND e.term_id = u.term_id AND e.is_published) AS criterios_publicados
FROM planning_units u
JOIN subjects sb ON sb.id = u.subject_id
JOIN schools s ON s.id = sb.school_id
LEFT JOIN academic_terms t ON t.id = u.term_id
ORDER BY s.name, sb.name, u.sort_order;
