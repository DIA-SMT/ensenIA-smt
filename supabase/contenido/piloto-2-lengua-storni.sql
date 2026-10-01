-- ═══════════════════════════════════════════════════════════════════
-- Piloto · paso 2: Lengua del 2° A de la Storni
-- (generado por supabase/contenido/generar-carga-piloto.mjs; no editar a mano)
--
-- ANTES de correrlo: crear la cuenta de la docente desde la app
--   Administración → Alfonsina Storni → Personal → Sumar persona → Docente
--   (cualquier nombre y email).
--
-- Qué hace (si algo falla, no cambia nada):
--  1. Busca la docente de Lengua: la que ya tenga asignada Lengua de 2° A
--     o, si no, la única docente de la Storni que no es Jiménez ni González.
--     Si hay más de una posible, frena y dice cuáles.
--  2. Le asigna Lengua de 2° A.
--  3. Carga las 3 unidades del programa, en borrador, con la secuencia
--     "Persuasión y Palabra Poética" (6 clases) dentro de la Unidad 3.
-- Se puede correr más de una vez: reemplaza las unidades de Lengua de 2° A.
-- ═══════════════════════════════════════════════════════════════════

DO $lengua$
DECLARE
  v_as uuid; v_curso uuid; v_len uuid; v_doc uuid; v_u uuid; n int; v_emails text;
BEGIN
  SELECT count(*) INTO n FROM schools WHERE name = 'Escuela Municipal Alfonsina Storni Secundaria';
  IF n <> 1 THEN RAISE EXCEPTION 'Tiene que haber exactamente una escuela "%", hay %', 'Escuela Municipal Alfonsina Storni Secundaria', n; END IF;
  SELECT id INTO v_as FROM schools WHERE name = 'Escuela Municipal Alfonsina Storni Secundaria';
  SELECT id INTO v_curso FROM courses WHERE school_id = v_as AND name = '2° A';
  IF v_curso IS NULL THEN RAISE EXCEPTION 'No está el 2° A de la Storni: corré primero piloto-vaciar-y-cargar-storni.sql'; END IF;
  SELECT id INTO v_len FROM subjects WHERE school_id = v_as AND name = 'Lengua';
  IF v_len IS NULL THEN RAISE EXCEPTION 'No está la materia Lengua de la Storni'; END IF;

  -- ¿Ya tiene Lengua de 2° A asignada desde la app?
  SELECT count(*), min(teacher_id::text)::uuid INTO n, v_doc
  FROM teacher_assignments WHERE subject_id = v_len AND course_id = v_curso;
  IF n > 1 THEN
    RAISE EXCEPTION 'Lengua de 2° A tiene % docentes asignadas: dejá una sola desde Personal', n;
  END IF;
  IF n = 0 THEN
    -- Si no, la única docente de la Storni que no es Jiménez ni González
    SELECT count(*), min(m.user_id::text)::uuid, string_agg(p.email, ', ') INTO n, v_doc, v_emails
    FROM school_memberships m JOIN profiles p ON p.id = m.user_id
    WHERE m.school_id = v_as AND m.role = 'docente'
      AND p.email NOT IN ('mariaeugenia.jimenez@ensenia.edu.ar', 'giuliana.gonzalez@ensenia.edu.ar');
    IF n = 0 THEN
      RAISE EXCEPTION 'No hay docente de Lengua: creala primero desde la app (Personal → Sumar persona → Docente)';
    ELSIF n > 1 THEN
      RAISE EXCEPTION 'Hay % docentes que podrían ser la de Lengua (%): asignale Lengua de 2° A desde Personal a la que corresponda y volvé a correrlo', n, v_emails;
    END IF;
  END IF;

  INSERT INTO teacher_assignments (teacher_id, subject_id, course_id) VALUES (v_doc, v_len, v_curso)
  ON CONFLICT (teacher_id, subject_id, course_id) DO NOTHING;

  DELETE FROM planning_units WHERE subject_id = v_len AND course_id = v_curso;

    -- Lengua Unidad 1 · borrador (el programa no dice trimestre)
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('Unidad 1', v_len, v_curso, v_doc, 1, NULL)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'El Género Fantástico. La vacilación en el lector. Fantástico Puro, Extraño y diferencia con el Maravilloso. Lo Verosímil. Vacíos e indicios. Narradores. Personajes y su clasificación. Descripciones.', 1, '{}'::text[], NULL),
      (v_u, 'Cuento y Novela: diferencias y similitudes. Lectura de cuentos Fantásticos, Extraños y Maravillosos.', 2, '{}'::text[], NULL),
      (v_u, 'La comunicación: Funciones del Lenguaje. Función predominante. Los mensajes y su intención.', 3, '{}'::text[], NULL),
      (v_u, 'Género Epistolar: Las Cartas: Formales e Informales.', 4, '{}'::text[], NULL),
      (v_u, 'Clases de palabras: sustantivos, adjetivos, artículos, verboides, adverbios, locuciones adverbiales. Preposiciones. Pronombres: personales, posesivos, demostrativos, exclamativos, interrogativos.', 5, '{}'::text[], NULL),
      (v_u, 'Sintaxis: oraciones Bimembres, Unimembres. Modificadores, objetos, circunstanciales. La Voz Activa y la Voz Pasiva.', 6, '{}'::text[], NULL);

    -- Lengua Unidad 2 · borrador
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('Unidad 2', v_len, v_curso, v_doc, 2, NULL)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'La novela Realista: “Rafaela” Mariana Furiasse. Personajes. Narradores. Su relación con los Ejes de la ESI.', 1, '{}'::text[], NULL),
      (v_u, 'El cuento Realista. Verosimilitud. Acciones primarias y secundarias. Indicios.', 2, '{}'::text[], NULL),
      (v_u, 'Los textos: Expositivo-Explicativos. Elementos Paratextuales. Recursos, estructura.', 3, '{}'::text[], NULL),
      (v_u, 'El verbo: accidentes del verbo: modo, persona, tiempo y número. Formas no conjugadas del verbo. Paradigma de la conjugación regular. Verbos regulares e irregulares.', 4, '{}'::text[], NULL),
      (v_u, 'Sintaxis: los Predicativos Subjetivos: Obligatorios y No Obligatorios.', 5, '{}'::text[], NULL);

    -- Lengua Unidad 3 · borrador; las 6 clases de la secuencia en el lugar de poesía y publicidad
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES ('Unidad 3', v_len, v_curso, v_doc, 3, NULL)
    RETURNING id INTO v_u;
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
      (v_u, 'Publicidad y Propaganda: ¿Qué nos quieren convencer?', 1, '{}'::text[], '**Conceptos:** finalidad, emisor, target, tipos de avisos.

### Inicio
- **Actividad con IA: Exploración inicial.** Consigna para el alumno (en la plataforma): “Escribí 3 ejemplos de frases o imágenes que ves en publicidades y 3 en propagandas. Luego pedile a la IA que te explique: ¿en qué se diferencian por su objetivo?”
- **Puesta en común:** construimos el cuadro en el pizarrón.

### Desarrollo
- Lectura del texto base: definiciones y el target (destinatario).
- **Actividad con IA — Análisis de destinatario.** Consigna: “Imaginá este aviso: imagen de jóvenes en una fiesta de disfraces, música, frases sobre diversión. Pedile a la IA que identifique el target y justifique su respuesta con argumentos.”
- **Debate:** ¿Coincidimos con lo que dice la IA? ¿Qué otros destinatarios podría tener?

### Cierre
- **Registro:** cuadro comparativo publicidad ↔ propaganda.
- **Tarea:** pensar un producto o una causa para la próxima clase.'),
      (v_u, 'Recursos Persuasivos: ¿Cómo nos convencen?', 2, '{}'::text[], '**Recursos:** imágenes, imperativos, preguntas retóricas, eslóganes, exageraciones.

### Inicio
- Recordamos los recursos del texto: imperativos, preguntas retóricas, exageraciones, juegos de palabras, imágenes icónicas, planos.

### Desarrollo
- **Actividad con IA: Identificación y creación.**
  - **Parte 1 — Reconocer:** “Pegá este eslogan: ‘Para un planeta vivo, cuidá el agua’. Pedile a la IA que identifique qué recurso(s) usa y qué efecto busca en el receptor.”
  - **Parte 2 — Crear:** “Elegí un producto o una causa social. Pedile a la IA que te proponga 3 eslóganes diferentes usando al menos 2 recursos persuasivos distintos.”
  - **Parte 3 — Seleccionar y justificar:** Elegí el mejor eslogan y explicá por qué te parece el más efectivo.
- **Puesta en común:** cada estudiante comparte su elección y justificación.

### Cierre
- **Reflexión:** ¿Todos los eslóganes que generó la IA te parecieron buenos? ¿Por qué elegiste ese y no los otros? → La IA propone, vos decidís.'),
      (v_u, '¿Qué es la poesía? Palabras que cantan', 3, '{}'::text[], '**Conceptos:** función estética, rima consonante/asonante, verso libre. **Poema:** “Viaje”, de Alfonsina Storni.

### Inicio
- **Pregunta disparadora:** ¿En qué se diferencia un aviso de un poema? ¿Para qué se escriben?

### Desarrollo
- Lectura en voz alta de “Viaje”, de Alfonsina Storni.
- **Actividad con IA. Comparación y profundización:**
  - **Consigna 1:** “Leé el poema ‘Viaje’ de Alfonsina Storni. Pedile a la IA que te diga qué sentimientos transmite y qué imágenes sensoriales reconoce.”
  - **Consigna 2: Rima y verso:** “Explicá con ejemplos la diferencia entre rima consonante, rima asonante y verso libre. Usá palabras sencillas.”
  - **Consigna 3: Vínculo poesía-publicidad:** “¿Qué tienen en común un eslogan publicitario y un poema? ¿Por qué ambos usan rima y frases breves?”
- **Debate:** ¿Qué coincidencias y diferencias encontraron entre su lectura y lo que respondió la IA?

### Cierre
- **Cuaderno:** 3 ideas sobre la poesía + diferencia entre rima consonante y asonante.'),
      (v_u, 'Recursos Semánticos: el sentido de las palabras', 4, '{}'::text[], '**Recursos:** imágenes sensoriales, personificación, comparación, metáfora, pregunta retórica. **Poema:** “Gato negro” — M. C. Ramos.

### Inicio
- Recordamos: los recursos semánticos juegan con el significado de las palabras.

### Desarrollo
- Lectura de “Gato negro”, de María Cristina Ramos.
- **Actividad con IA. Análisis de recursos.** Consigna paso a paso:
  1. “Buscá en el poema ‘Gato negro’ al menos 2 ejemplos de: personificación, comparación, metáfora e imágenes sensoriales. Pedile a la IA que te ayude a explicarlos.”
  2. “¿Qué significa en el poema ‘brasas que te asedian, su mirada dura’? ¿Es una metáfora? ¿Qué compara?”
  3. “Escribí una oración con una personificación y otra con una metáfora. Pedile a la IA que te diga si lo hiciste bien y te dé un ejemplo más.”
- **Puesta en común:** construimos un mural digital con los hallazgos.

### Cierre
- **Reflexión:** ¿Por qué la poesía usa estos recursos? ¿Qué pasaría si los quitáramos y dijéramos las cosas de forma directa?'),
      (v_u, 'Miradas al crepúsculo: Neruda y Fernández Moreno', 5, '{}'::text[], '**Poemas:** “Crepúsculo” — Fernández Moreno / “Poema X” — Neruda.

### Inicio
- “El crepúsculo: ese momento entre el día y la noche. Cada poeta lo mira diferente. ¿Cómo lo describirías vos?”

### Desarrollo
- Lectura de ambos poemas.
- **Actividad con IA: Análisis comparativo.** Consigna: “Analizá los dos poemas y respondé con ayuda de la IA:
  - ¿Cuál tiene rima y cuál es verso libre?
  - ¿Qué recursos semánticos encontrás en cada uno? (comparación, metáfora, personificación, pregunta retórica)
  - ¿Qué sentimiento predomina en cada poema?
  - ¿En qué se parecen y en qué se diferencian?”
- **Actividad individual:** elegí el poema que más te gustó y escribí 3 líneas explicando por qué.

### Cierre
- Compartimos preferencias. Destacamos: “La IA te ayuda a analizar, pero tu opinión y tu gusto son únicos.”'),
      (v_u, '¡Creamos con IA!', 6, '{}'::text[], '**Producción y reflexión final**

### Inicio
- Recordamos todo lo aprendido: publicidad, propaganda, recursos persuasivos, rima, comparación, metáfora, personificación.

### Desarrollo
Elegí UNA propuesta con ayuda de la IA:

**Crear un aviso persuasivo.** Pasos con IA:
1. “Quiero hacer una [publicidad de un producto / propaganda sobre una causa]. Ayudame a definir el objetivo y el target.”
2. “Proponé 3 opciones de eslogan usando al menos 2 recursos persuasivos.”
3. “Escribí el texto completo del aviso: título, eslogan, texto breve. Incluí un imperativo o una pregunta retórica.”
4. **Revisión personal:** Modificá lo que no te guste. La IA te da ideas, el resultado final es tuyo.

**Escribir un poema breve.** Pasos con IA:
1. “Quiero escribir un poema sobre [la luna, la tarde, mi barrio, un sentimiento, un animal]. Ayudame a pensar imágenes sensoriales.”
2. “Proponé 4 versos usando al menos dos recursos: comparación, metáfora, personificación o rima.”
3. “Ajustá el poema a lo que vos sentís. Cambiá palabras, agregá o quitá versos.”
4. **Versión final:** Escribí el poema con tus cambios. Es tu creación, la IA solo te acompañó.

### Cierre
**Reflexión sobre el uso de IA.** Preguntas para compartir:
- ¿Qué te aportó la IA en tu proceso de creación?
- ¿Cambiarías algo de lo que te propuso? ¿Por qué?
- ¿La IA puede reemplazar tu voz y tu forma de ver el mundo? ¿Por qué?'),
      (v_u, 'Textos Instructivos. Organización. Paratextos.', 7, '{}'::text[], NULL),
      (v_u, 'Sintaxis: Complemento Régimen.', 8, '{}'::text[], NULL),
      (v_u, 'Ortografía: reglas de acentuación. Acentuación de monosílabos. El punto y la mayúscula. Usos de la y y la x. Usos de s y h.', 9, '{}'::text[], NULL);
END
$lengua$;

-- ── Resultado: las tres materias del 2° A, con su docente ──
SELECT sb.name AS materia, p.first_name || ' ' || p.last_name AS docente, p.email,
       u.sort_order AS orden, u.title AS unidad, COALESCE(t.number::text, 'borrador') AS trimestre,
       (SELECT count(*) FROM planning_classes pc WHERE pc.unit_id = u.id) AS clases
FROM planning_units u
JOIN subjects sb ON sb.id = u.subject_id
JOIN profiles p ON p.id = u.teacher_id
LEFT JOIN academic_terms t ON t.id = u.term_id
ORDER BY sb.name, u.sort_order;
