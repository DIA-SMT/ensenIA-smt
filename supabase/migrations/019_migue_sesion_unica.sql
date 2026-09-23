-- ════════════════════════════════════════════════════════════════════
--  SMT EstudIA — 019: una conversación con Migue por persona
--
--  Probando en el navegador aparecieron dos sesiones por usuario: dos
--  cargas de la página corriendo a la vez, cada una sin ver nada y cada
--  una insertando. El efecto es peor que un registro de más: el
--  historial se parte en dos y el chico vuelve al día siguiente a una
--  conversación que no es la que tuvo.
--
--  Migue es una conversación continua, no un hilo por sesión de
--  navegador: una fila por usuario y audiencia, y que el ON CONFLICT
--  resuelva la carrera en la base en vez de en el cliente.
-- ════════════════════════════════════════════════════════════════════

-- Consolidar lo que ya existe: los mensajes van a la sesión más vieja
-- (la que el usuario efectivamente empezó) y las duplicadas se borran.
WITH ordenadas AS (
  SELECT id, user_id, audience,
         first_value(id) OVER (PARTITION BY user_id, audience ORDER BY created_at) AS canonica
  FROM migue_sessions
)
UPDATE migue_messages m
SET session_id = o.canonica
FROM ordenadas o
WHERE m.session_id = o.id AND o.id <> o.canonica;

DELETE FROM migue_sessions s
WHERE EXISTS (
  SELECT 1 FROM migue_sessions otra
  WHERE otra.user_id = s.user_id
    AND otra.audience = s.audience
    AND otra.created_at < s.created_at
);

ALTER TABLE migue_sessions
  ADD CONSTRAINT migue_sessions_user_audience_key UNIQUE (user_id, audience);
