-- ═══════════════════════════════════════════════════════════════════
-- 064 — Las vistas del alumno son solo de lectura
--
-- URGENTE: se puede (y conviene) correr ya, sola, antes que la 061-063.
--
-- La 019 creó student_activities y live_activities_alumno sin
-- security_invoker (corren con los permisos de su dueño y no pasan por la
-- RLS de activities ni de live_activities) y les sacó los permisos solo a
-- PUBLIC y anon. Pero en Supabase el rol `authenticated` recibe TODOS los
-- privilegios por defecto sobre lo que se crea en public, y las dos vistas
-- se pueden actualizar solas (una tabla, sin agregados). Resultado: un
-- estudiante logueado podía, por la API:
--  · cambiar título, consigna, puntos o estado de las actividades
--    publicadas de sus materias (o cerrarlas para todo el curso);
--  · borrarlas, y con ellas las entregas de todos sus compañeros;
--  · insertar actividades nuevas a nombre de cualquier docente;
--  · en la clase en vivo, pasar un quiz a 'revealed' y ver la respuesta
--    correcta mientras la sala todavía vota, o borrar las preguntas.
--
-- Ahora las dos vistas solo se leen. security_barrier, además, evita que
-- un filtro del usuario se evalúe antes que el de la vista.
--
-- Comprobación al final: tiene que devolver todo en false.
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON student_activities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON student_activities TO authenticated;
ALTER VIEW student_activities SET (security_barrier = true);

REVOKE ALL ON live_activities_alumno FROM PUBLIC, anon, authenticated;
GRANT SELECT ON live_activities_alumno TO authenticated;
ALTER VIEW live_activities_alumno SET (security_barrier = true);

SELECT
  has_table_privilege('authenticated', 'public.student_activities', 'INSERT')     AS sa_insert,
  has_table_privilege('authenticated', 'public.student_activities', 'UPDATE')     AS sa_update,
  has_table_privilege('authenticated', 'public.student_activities', 'DELETE')     AS sa_delete,
  has_table_privilege('authenticated', 'public.live_activities_alumno', 'INSERT') AS la_insert,
  has_table_privilege('authenticated', 'public.live_activities_alumno', 'UPDATE') AS la_update,
  has_table_privilege('authenticated', 'public.live_activities_alumno', 'DELETE') AS la_delete,
  NOT has_table_privilege('authenticated', 'public.student_activities', 'SELECT') AS sa_sin_lectura;
