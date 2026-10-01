/**
 * Genera supabase/contenido/piloto-vaciar-y-cargar-storni.sql
 *
 * Deja la base del piloto como se decidió el 01/10:
 *  - Las dos escuelas sin nada de demo: se borran los datos de prueba que
 *    cargaron los seeds (docentes de demo, alumnos y familias de prueba,
 *    cursos, materias, contenido, actividades...). Se conservan las
 *    escuelas, sus trimestres, el superadmin y las dos docentes reales.
 *  - La Gabriela Mistral queda vacía hasta procesar su material.
 *  - La Alfonsina Storni queda con su 2° A, sus tres materias y el material
 *    verificado de storni-2a.json:
 *      · Físico-Química (María Eugenia Jiménez): 4 unidades publicadas en el
 *        trimestre que dice la planificación, con clases y los criterios de
 *        la docente tal cual.
 *      · Matemática (Giuliana González): Eje 3 publicado (3.er trimestre,
 *        es lo único con fecha); Ejes 1 y 2 en borrador. Las clases de
 *        sexagesimal van dentro del Eje 2, donde las ubica el programa.
 *        Solo el programa de González (el de Villagra no es de 2° A).
 *      · Lengua: vacía, no hay docente en ningún documento.
 *
 * Publicar una unidad = ponerle trimestre (term_id). En el temario,
 * estudiantes y familias ven el título de la unidad y los títulos y
 * objetivos de sus clases (no el contenido), así que las unidades sin
 * material llevan una clase solo-título por cada contenido del programa.
 *
 * Genera también piloto-2-lengua-storni.sql (ver abajo).
 *
 *   node supabase/contenido/generar-carga-piloto.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const datos = JSON.parse(fs.readFileSync(path.join(AQUI, 'storni-2a.json'), 'utf8'));
const materia = nombre => {
  const m = datos.materias.find(x => x.materia === nombre);
  if (!m) throw new Error(`No está la materia ${nombre} en storni-2a.json`);
  return m;
};
const unidad = (m, titulo) => {
  const u = m.unidades.find(x => x.titulo === titulo && !/Villagra/.test(x.numero ?? ''));
  if (!u) throw new Error(`No está la unidad "${titulo}" de ${m.materia}`);
  return u;
};
const material = (m, titulo) => {
  const x = m.material_didactico.find(y => y.titulo === titulo);
  if (!x) throw new Error(`No está el material "${titulo}" de ${m.materia}`);
  return x.clases;
};

// ── SQL ──
const lit = s => s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
const arr = xs => xs && xs.length ? `ARRAY[${xs.map(lit).join(', ')}]::text[]` : `'{}'::text[]`;
// Las anotaciones de transcripción ("(en el original: ...)") no van al temario
const limpio = t => t.replace(/\s*\((?:en el original|así en el original)[^)]*\)\s*$/i, '').trim();

const soloTitulo = contenidos => contenidos.map(c => ({ titulo: limpio(c), objetivos: [], contenido: null }));
const deMaterial = clases => clases.map(c => ({ titulo: c.titulo, objetivos: c.objetivos, contenido: c.contenido_md }));

function sqlUnidad({ comentario, titulo, materiaVar, docenteVar, orden, trimestreVar, clases }) {
  const filas = clases.map((c, i) =>
    `      (v_u, ${lit(c.titulo)}, ${i + 1}, ${arr(c.objetivos)}, ${lit(c.contenido)})`).join(',\n');
  return `
    -- ${comentario}
    INSERT INTO planning_units (title, subject_id, course_id, teacher_id, sort_order, term_id)
    VALUES (${lit(titulo)}, ${materiaVar}, v_curso, ${docenteVar}, ${orden}, ${trimestreVar})
    RETURNING id INTO v_u;${clases.length ? `
    INSERT INTO planning_classes (unit_id, title, sort_order, objectives, content) VALUES
${filas};` : ''}`;
}

// ── Físico-Química ──
const fq = materia('Físico-Química');
const fqMagnitudes = unidad(fq, 'Magnitudes y fuerzas');
const fqSoluciones = unidad(fq, 'Soluciones');
const fqCambios = unidad(fq, 'Cambios físicos y químicos');
const fqAtomo = unidad(fq, 'El átomo');
const fqTablaClases = material(fq, 'Tabla periódica de los elementos');
const trimVar = { 1: 'v_t1', 2: 'v_t2', 3: 'v_t3' };
const chequearTrim = (u, n) => { if (u.trimestre !== n) throw new Error(`${u.titulo}: se esperaba trimestre ${n} y el JSON dice ${u.trimestre}`); };
chequearTrim(fqMagnitudes, 1); chequearTrim(fqSoluciones, 2); chequearTrim(fqCambios, 2); chequearTrim(fqAtomo, 3);

const unidadesFQ = [
  { comentario: 'FQ 1.er trimestre · sin material de clase: un título por contenido de la planificación',
    titulo: fqMagnitudes.titulo, orden: 1, trimestreVar: 'v_t1', clases: soloTitulo(fqMagnitudes.contenidos) },
  { comentario: 'FQ 2.º trimestre · sin material de clase',
    titulo: fqSoluciones.titulo, orden: 2, trimestreVar: 'v_t2', clases: soloTitulo(fqSoluciones.contenidos) },
  { comentario: 'FQ 2.º trimestre · las 2 clases del apunte cubren los 2 contenidos de la planificación',
    titulo: fqCambios.titulo, orden: 3, trimestreVar: 'v_t2', clases: deMaterial(material(fq, 'Transformaciones físicas y químicas')) },
  { comentario: 'FQ 3.er trimestre · el apunte de tabla periódica cubre número atómico y másico, símbolos, tabla y\n    -- metales/no metales; no cubre las partículas subatómicas, que van primero como título solo',
    titulo: fqAtomo.titulo, orden: 4, trimestreVar: 'v_t3',
    clases: [...soloTitulo([fqAtomo.contenidos[0]]), ...deMaterial(fqTablaClases)] },
];
const criteriosFQ = [1, 2, 3].map(n => {
  const c = fq.criterios_por_trimestre.find(x => x.trimestre === n);
  if (!c) throw new Error(`Falta el criterio de FQ del trimestre ${n}`);
  if (c.criterios.length > 4000) throw new Error('Criterio de más de 4000 caracteres');
  return { n, texto: c.criterios };
});

// ── Matemática (solo el programa de González) ──
const mat = materia('Matemática');
const eje1 = mat.unidades.find(u => u.numero === 'Eje temático N°1');
const eje2 = mat.unidades.find(u => u.numero === 'Eje temático N°2');
const eje3 = mat.unidades.find(u => u.numero === 'Eje temático N°3');
if (!eje1 || !eje2 || !eje3) throw new Error('Faltan ejes temáticos de Matemática en el JSON');
chequearTrim(eje3, 3);
const sexagesimal = deMaterial(material(mat, 'Sistema sexagesimal'));
// En el Eje 2 las clases de sexagesimal ocupan el lugar de "Operaciones: suma,
// resta, multiplicación y división", que es lo que desarrollan.
const posOperaciones = eje2.contenidos.findIndex(c => /^Operaciones/.test(c));
if (posOperaciones < 0) throw new Error('No encuentro "Operaciones" en el Eje 2');
const clasesEje2 = [
  ...soloTitulo(eje2.contenidos.slice(0, posOperaciones)),
  ...sexagesimal,
  ...soloTitulo(eje2.contenidos.slice(posOperaciones + 1)),
];
const unidadesMat = [
  { comentario: 'Matemática Eje 1 · borrador (el documento no dice trimestre)',
    titulo: 'Eje 1 · ' + eje1.titulo, orden: 1, trimestreVar: 'NULL', clases: soloTitulo(eje1.contenidos) },
  { comentario: 'Matemática Eje 2 · borrador; las 3 clases de sexagesimal en el lugar de "Operaciones"',
    titulo: 'Eje 2 · ' + eje2.titulo, orden: 2, trimestreVar: 'NULL', clases: clasesEje2 },
  { comentario: 'Matemática Eje 3 · publicado en el 3.er trimestre (07/09–04/12/2026 según la planificación)',
    titulo: 'Eje 3 · ' + eje3.titulo, orden: 3, trimestreVar: 'v_t3', clases: soloTitulo(eje3.contenidos) },
];

// ── Tablas a vaciar, hoja → raíz ──
// Las de reset-demo.ts (que ya están en el orden que piden las FK) más las que
// le faltan y cuelgan de estudiantes y cursos. No se tocan: schools,
// academic_terms, alert_thresholds (configuración de la escuela), profiles y
// school_memberships (caen con las cuentas).
const VACIAR = [
  'chat_messages', 'chat_sessions', 'ia_usage',
  'guardian_notices', 'student_guardians', 'student_observations', 'student_checkins',
  'wellbeing_notes', 'wellbeing_signals', 'migue_sessions',
  'student_awards', 'teacher_awards', 'student_achievements', 'student_badges', 'student_progress',
  'vocational_profiles', 'recorded_classes',
  'term_grades', 'report_grades', 'evaluation_criteria',
  'attendance_sessions', 'practice_attempts', 'student_notes', 'alerts',
  'activity_events', 'activity_submissions', 'activities',
  'planning_classes', 'planning_units', 'material_reactions', 'library_materials',
  'schedule_blocks', 'course_group_members', 'course_groups',
  'enrollments', 'teacher_assignments', 'students',
  'notifications', 'communications', 'quick_notes', 'live_sessions',
  'school_policies', 'audit_log', 'courses', 'subjects',
];

const STORNI = 'Escuela Municipal Alfonsina Storni Secundaria';
const MISTRAL = 'Escuela Municipal Gabriela Mistral Secundaria';
// La migración 014 creó una escuela de prueba con un nombre parecido
const ESCUELA_014 = 'Escuela Municipal Alfonsina Storni';
const JIMENEZ = 'mariaeugenia.jimenez@ensenia.edu.ar';
const GONZALEZ = 'giuliana.gonzalez@ensenia.edu.ar';

const sql = `-- ═══════════════════════════════════════════════════════════════════
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
  SELECT count(*) INTO n FROM schools WHERE name = ${lit(STORNI)};
  IF n <> 1 THEN RAISE EXCEPTION 'Tiene que haber exactamente una escuela "%", hay %', ${lit(STORNI)}, n; END IF;
  SELECT count(*) INTO n FROM schools WHERE name = ${lit(MISTRAL)};
  IF n <> 1 THEN RAISE EXCEPTION 'Tiene que haber exactamente una escuela "%", hay %', ${lit(MISTRAL)}, n; END IF;
  SELECT id INTO v_as FROM schools WHERE name = ${lit(STORNI)};
  SELECT id INTO v_gm FROM schools WHERE name = ${lit(MISTRAL)};

  -- Este script vacía tablas enteras: solo es seguro si no hay otras escuelas
  -- reales. La de la migración 014 es de prueba.
  SELECT count(*) INTO n FROM schools WHERE name NOT IN (${lit(STORNI)}, ${lit(MISTRAL)}, ${lit(ESCUELA_014)});
  IF n > 0 THEN RAISE EXCEPTION 'Hay % escuela(s) además de las del piloto: no sigo para no borrar datos ajenos', n; END IF;

  SELECT id INTO v_jime FROM profiles WHERE email = ${lit(JIMENEZ)};
  IF v_jime IS NULL THEN RAISE EXCEPTION 'No encuentro la cuenta de María Eugenia Jiménez (%)', ${lit(JIMENEZ)}; END IF;
  SELECT id INTO v_gonza FROM profiles WHERE email = ${lit(GONZALEZ)};
  IF v_gonza IS NULL THEN RAISE EXCEPTION 'No encuentro la cuenta de Giuliana González (%)', ${lit(GONZALEZ)}; END IF;

  -- ── 2. Borrar los datos de prueba (hoja → raíz) ──
${VACIAR.map(t => `  DELETE FROM ${t};`).join('\n')}

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
${unidadesFQ.map(u => sqlUnidad({ ...u, materiaVar: 'v_fq', docenteVar: 'v_jime' })).join('\n')}

    -- Criterios de evaluación de la planificación, tal cual, publicados
    INSERT INTO evaluation_criteria (school_id, subject_id, course_id, term_id, criteria, is_published) VALUES
${criteriosFQ.map(c => `      (v_as, v_fq, v_curso, ${trimVar[c.n]}, ${lit(c.texto)}, true)`).join(',\n')};

  -- ── 6. Matemática (Giuliana González) ──
${unidadesMat.map(u => sqlUnidad({ ...u, materiaVar: 'v_mat', docenteVar: 'v_gonza' })).join('\n')}
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
`;

const salida = path.join(AQUI, 'piloto-vaciar-y-cargar-storni.sql');
fs.writeFileSync(salida, sql);
console.log('ok', salida, `(${unidadesFQ.length + unidadesMat.length} unidades, ${[...unidadesFQ, ...unidadesMat].reduce((n, u) => n + u.clases.length, 0)} clases, ${criteriosFQ.length} criterios)`);

// ═══ Paso 2: Lengua ═══
// Ningún documento nombra a la docente de Lengua. La cuenta se crea desde la
// app (Administración → Personal → docente, con el email de abajo) y este
// SQL le asigna Lengua de 2° A y le carga el material. Cuando se sepa quién
// es, se le corrigen nombre y DNI a esa misma cuenta (o se pasan las
// unidades a la cuenta real con un UPDATE de teacher_id).
//
// Las 3 unidades van en borrador: el programa no dice trimestre. La
// secuencia "Persuasión y Palabra Poética" desarrolla los dos primeros
// contenidos de la Unidad 3 (poesía; publicidad y propaganda), así que sus
// 6 clases van ahí en su orden, en el lugar de esos dos contenidos.
const LENGUA_EMAIL = 'lengua.storni@ensenia.edu.ar';
const len = materia('Lengua');
const lenU = n => {
  const u = len.unidades.find(x => x.numero === String(n));
  if (!u) throw new Error(`No está la Unidad ${n} de Lengua`);
  return u;
};
const secuencia = deMaterial(material(len, 'Unidad Didáctica: Persuasión y Palabra Poética'));
const u3 = lenU(3);
if (!/^La poesía/.test(u3.contenidos[0]) || !/Publicidad y la Propaganda/.test(u3.contenidos[1])) {
  throw new Error('Los dos primeros contenidos de la Unidad 3 de Lengua no son los que desarrolla la secuencia');
}
const unidadesLen = [
  { comentario: 'Lengua Unidad 1 · borrador (el programa no dice trimestre)',
    titulo: lenU(1).titulo, orden: 1, trimestreVar: 'NULL', clases: soloTitulo(lenU(1).contenidos) },
  { comentario: 'Lengua Unidad 2 · borrador',
    titulo: lenU(2).titulo, orden: 2, trimestreVar: 'NULL', clases: soloTitulo(lenU(2).contenidos) },
  { comentario: 'Lengua Unidad 3 · borrador; las 6 clases de la secuencia en el lugar de poesía y publicidad',
    titulo: u3.titulo, orden: 3, trimestreVar: 'NULL', clases: [...secuencia, ...soloTitulo(u3.contenidos.slice(2))] },
];

const sqlLengua = `-- ═══════════════════════════════════════════════════════════════════
-- Piloto · paso 2: Lengua del 2° A de la Storni
-- (generado por supabase/contenido/generar-carga-piloto.mjs; no editar a mano)
--
-- ANTES de correrlo: crear la cuenta de la docente desde la app
--   Administración → Alfonsina Storni → Personal → Sumar persona → Docente
--   Nombre: Docente · Apellido: Lengua · Email: ${LENGUA_EMAIL}
--
-- Qué hace (si algo falla, no cambia nada):
--  1. Busca esa cuenta y verifica que sea docente de la Storni.
--  2. Le asigna Lengua de 2° A.
--  3. Carga las 3 unidades del programa, en borrador, con la secuencia
--     "Persuasión y Palabra Poética" (6 clases) dentro de la Unidad 3.
-- Se puede correr más de una vez: reemplaza las unidades de Lengua de 2° A.
-- ═══════════════════════════════════════════════════════════════════

DO $lengua$
DECLARE
  v_as uuid; v_curso uuid; v_len uuid; v_doc uuid; v_u uuid; n int;
BEGIN
  SELECT count(*) INTO n FROM schools WHERE name = ${lit(STORNI)};
  IF n <> 1 THEN RAISE EXCEPTION 'Tiene que haber exactamente una escuela "%", hay %', ${lit(STORNI)}, n; END IF;
  SELECT id INTO v_as FROM schools WHERE name = ${lit(STORNI)};
  SELECT id INTO v_curso FROM courses WHERE school_id = v_as AND name = '2° A';
  IF v_curso IS NULL THEN RAISE EXCEPTION 'No está el 2° A de la Storni: corré primero piloto-vaciar-y-cargar-storni.sql'; END IF;
  SELECT id INTO v_len FROM subjects WHERE school_id = v_as AND name = 'Lengua';
  IF v_len IS NULL THEN RAISE EXCEPTION 'No está la materia Lengua de la Storni'; END IF;

  SELECT id INTO v_doc FROM profiles WHERE email = ${lit(LENGUA_EMAIL)};
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'No encuentro la cuenta %: creala primero desde la app (Personal → Sumar persona → Docente)', ${lit(LENGUA_EMAIL)};
  END IF;
  IF NOT EXISTS (SELECT 1 FROM school_memberships WHERE user_id = v_doc AND school_id = v_as AND role = 'docente') THEN
    RAISE EXCEPTION 'La cuenta % no es docente de la Storni', ${lit(LENGUA_EMAIL)};
  END IF;

  INSERT INTO teacher_assignments (teacher_id, subject_id, course_id) VALUES (v_doc, v_len, v_curso)
  ON CONFLICT (teacher_id, subject_id, course_id) DO NOTHING;

  DELETE FROM planning_units WHERE subject_id = v_len AND course_id = v_curso;
${unidadesLen.map(u => sqlUnidad({ ...u, materiaVar: 'v_len', docenteVar: 'v_doc' })).join('\n')}
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
`;
const salidaLen = path.join(AQUI, 'piloto-2-lengua-storni.sql');
fs.writeFileSync(salidaLen, sqlLengua);
console.log('ok', salidaLen, `(${unidadesLen.length} unidades, ${unidadesLen.reduce((n, u) => n + u.clases.length, 0)} clases)`);
