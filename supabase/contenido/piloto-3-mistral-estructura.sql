-- ═══════════════════════════════════════════════════════════════════
-- Piloto · la Gabriela Mistral armada para el 3° A (parte 1 de 2)
--
-- Con lo que contestó la escuela en el relevamiento (5/10):
--  1. Datos de la escuela: nombre corto, dirección y barrio.
--  2. Los trimestres 2026 con sus fechas reales:
--       1° del 4/3 al 1/6 · 2° del 2/6 al 7/9 · 3° del 8/9 al 4/12.
--  3. La regla de diciembre "anual", la misma que la Storni: la nota final
--     es el promedio de los 3 trimestres y el 3° tiene que aprobarse sí o
--     sí con 6. Un 4 en el 1° o el 2° solo avisa a la familia.
--  4. El curso 3° A y sus tres materias: Matemática, Físico-Química, Lengua.
--
-- No crea cuentas: el personal y los estudiantes se dan de alta desde
-- Gestión (así cada uno recibe su clave inicial). Las materias y el
-- horario de cada docente van en la parte 2, cuando ya tengan cuenta.
--
-- Se puede correr más de una vez: cada corrida deja lo mismo.
-- ═══════════════════════════════════════════════════════════════════

DO $mistral$
DECLARE
  v_gm uuid;
  v_curso uuid;
  n int;
BEGIN
  SELECT count(*) INTO n FROM schools WHERE name = 'Escuela Municipal Gabriela Mistral Secundaria';
  IF n <> 1 THEN RAISE EXCEPTION 'Tiene que haber exactamente una escuela "%", hay %', 'Escuela Municipal Gabriela Mistral Secundaria', n; END IF;
  SELECT id INTO v_gm FROM schools WHERE name = 'Escuela Municipal Gabriela Mistral Secundaria';

  -- ── 1. Datos de la escuela ──
  UPDATE schools
  SET short_name = 'Gabriela Mistral', address = 'Mendoza 2176', district = 'Barrio Villa Luján'
  WHERE id = v_gm;

  -- ── 2. Trimestres 2026 ──
  INSERT INTO academic_terms (school_id, year, number, name, starts_on, ends_on) VALUES
    (v_gm, 2026, 1, '1° Trimestre', DATE '2026-03-04', DATE '2026-06-01'),
    (v_gm, 2026, 2, '2° Trimestre', DATE '2026-06-02', DATE '2026-09-07'),
    (v_gm, 2026, 3, '3° Trimestre', DATE '2026-09-08', DATE '2026-12-04')
  ON CONFLICT (school_id, year, number)
  DO UPDATE SET name = EXCLUDED.name, starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on;

  -- ── 3. Regla de diciembre ──
  INSERT INTO alert_thresholds (school_id, december_rule) VALUES (v_gm, 'anual')
  ON CONFLICT (school_id) DO UPDATE SET december_rule = 'anual';

  -- ── 4. Curso y materias (si ya están, no se duplican) ──
  SELECT id INTO v_curso FROM courses WHERE school_id = v_gm AND year = 3 AND upper(division) = 'A' LIMIT 1;
  IF v_curso IS NULL THEN
    INSERT INTO courses (name, year, division, school_id) VALUES ('3° A', 3, 'A', v_gm);
  END IF;

  INSERT INTO subjects (name, color, school_id)
  SELECT m.name, m.color, v_gm
  FROM (VALUES ('Matemática', 'blue'), ('Físico-Química', 'purple'), ('Lengua', 'green')) AS m(name, color)
  WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.school_id = v_gm AND s.name = m.name);
END
$mistral$;

-- Comprobación: tiene que decir 3 trimestres, regla anual, el 3° A y las 3 materias
SELECT
  s.short_name AS escuela,
  (SELECT string_agg(t.number || '°: ' || to_char(t.starts_on, 'DD/MM') || ' al ' || to_char(t.ends_on, 'DD/MM'), ' · ' ORDER BY t.number)
     FROM academic_terms t WHERE t.school_id = s.id AND t.year = 2026) AS trimestres,
  (get_alert_thresholds(s.id)).december_rule AS regla_diciembre,
  (SELECT string_agg(c.name, ', ' ORDER BY c.year, c.division) FROM courses c WHERE c.school_id = s.id) AS cursos,
  (SELECT string_agg(m.name, ', ' ORDER BY m.name) FROM subjects m WHERE m.school_id = s.id) AS materias
FROM schools s
WHERE s.name = 'Escuela Municipal Gabriela Mistral Secundaria';
