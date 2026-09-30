-- ════════════════════════════════════════════════════════════════════
--  SMT EstudIA — 018: que el servidor selle de quién es la conversación
--
--  La 017 exigía user_id = auth.uid() en el WITH CHECK, pero la columna
--  no tenía default, así que el cliente creaba la sesión con user_id
--  nulo y la RLS la rechazaba. Encontrado abriendo Migue como docente.
--
--  En vez de pedirle al cliente que mande su propio id —que es
--  exactamente el dato que no se le debe creer— lo pone el servidor, y
--  se le quita el permiso de escribir esas columnas. Es la convención
--  que ya usan alerts (010), term_grades (011) y evaluation_criteria (012).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE migue_sessions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE migue_sessions ALTER COLUMN school_id SET DEFAULT auth_school_id();

REVOKE INSERT, UPDATE ON migue_sessions FROM anon, authenticated;
GRANT INSERT (audience, title) ON migue_sessions TO authenticated;
GRANT UPDATE (title) ON migue_sessions TO authenticated;

-- El contenido de los mensajes lo escribe la Edge Function con service
-- role; al cliente le alcanza con leerlos y con poder borrar su propia
-- conversación (las policies de la 017 ya acotan a sus sesiones).
REVOKE INSERT, UPDATE ON migue_messages FROM anon, authenticated;
