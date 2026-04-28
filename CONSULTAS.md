# Consultas PostgreSQL — Plataforma WoZ

Conectarse a la BD:
```bash
docker-compose exec db psql -U woz -d woz
```

---

## Usuarios / Participantes

```sql
-- Listar todos los participantes
SELECT id, name, age, gender, created_at
FROM users
ORDER BY created_at DESC;

-- Buscar participante por nombre
SELECT * FROM users
WHERE name ILIKE '%Juan%';
```

---

## Sesiones

```sql
-- Listar todas las sesiones con nombre del participante
SELECT
    s.id,
    s.name          AS session_name,
    u.name          AS participant,
    s.started_at,
    s.ended_at,
    EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::int AS duration_seconds
FROM sessions s
LEFT JOIN users u ON s.user_id = u.id
ORDER BY s.started_at DESC;

-- Sesiones de un participante concreto
SELECT s.id, s.name, s.started_at, s.ended_at
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE u.name ILIKE '%Juan%'
ORDER BY s.started_at;

-- Sesiones aún abiertas (ended_at IS NULL)
SELECT s.id, s.name, u.name AS participant, s.started_at
FROM sessions s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.ended_at IS NULL;
```

---

## Registro completo de una sesión (log cronológico)

```sql
-- Todos los mensajes Y eventos del robot de una sesión, ordenados por tiempo
-- Sustituye <SESSION_ID> por el UUID real
--
-- origin posibles:  wizard | participant | llm | context
-- event_type:       emotion_displayed | started_listening | started_speaking
-- value:            nombre de la emoción (solo en emotion_displayed), futuro: gestos
SELECT
    'message'            AS kind,
    m.sent_at            AS timestamp,
    m.origin,
    m.emotion,
    m.text,
    NULL                 AS event_type,
    NULL                 AS value
FROM messages m
WHERE m.session_id = '<SESSION_ID>'

UNION ALL

SELECT
    'robot_event'        AS kind,
    e.occurred_at        AS timestamp,
    NULL                 AS origin,
    NULL                 AS emotion,
    NULL                 AS text,
    e.event_type,
    e.value
FROM robot_events e
WHERE e.session_id = '<SESSION_ID>'

ORDER BY timestamp;
```

---

## Mensajes

```sql
-- Todos los mensajes de una sesión
SELECT id, sent_at, origin, emotion, text
FROM messages
WHERE session_id = '<SESSION_ID>'
ORDER BY sent_at;

-- Filtrar por origen (cómo fue generado el mensaje)
--   origin: 'wizard' | 'llm' | 'context'
SELECT sent_at, emotion, text
FROM messages
WHERE session_id = '<SESSION_ID>'
  AND origin = 'wizard'
ORDER BY sent_at;

-- Mensajes agrupados por origen en todas las sesiones
SELECT origin, COUNT(*) AS total
FROM messages
GROUP BY origin
ORDER BY total DESC;

-- Distribución de emociones usadas en todos los mensajes
SELECT emotion, COUNT(*) AS total
FROM messages
WHERE emotion IS NOT NULL
GROUP BY emotion
ORDER BY total DESC;

-- Distribución de emociones en una sesión concreta
SELECT emotion, COUNT(*) AS total
FROM messages
WHERE session_id = '<SESSION_ID>'
  AND emotion IS NOT NULL
GROUP BY emotion
ORDER BY total DESC;
```

---

## Eventos del robot (tiempos de respuesta)

```sql
-- Todos los eventos de una sesión
SELECT id, event_type, value, occurred_at, message_id
FROM robot_events
WHERE session_id = '<SESSION_ID>'
ORDER BY occurred_at;

-- Solo cambios de emoción
SELECT occurred_at, value AS emotion
FROM robot_events
WHERE session_id = '<SESSION_ID>'
  AND event_type = 'emotion_displayed'
ORDER BY occurred_at;

-- Calcular tiempo de respuesta: diferencia entre started_listening y started_speaking
-- asociados al mismo mensaje
SELECT
    e_speak.message_id,
    e_listen.occurred_at  AS started_listening_at,
    e_speak.occurred_at   AS started_speaking_at,
    EXTRACT(EPOCH FROM (e_speak.occurred_at - e_listen.occurred_at))
        AS response_time_seconds
FROM robot_events e_listen
JOIN robot_events e_speak
    ON  e_listen.session_id  = e_speak.session_id
    AND e_listen.message_id  = e_speak.message_id
    AND e_listen.event_type  = 'started_listening'
    AND e_speak.event_type   = 'started_speaking'
WHERE e_listen.session_id = '<SESSION_ID>'
ORDER BY e_listen.occurred_at;

-- Tiempo de respuesta medio por sesión
SELECT
    s.name,
    AVG(EXTRACT(EPOCH FROM (e_speak.occurred_at - e_listen.occurred_at)))
        AS avg_response_seconds
FROM robot_events e_listen
JOIN robot_events e_speak
    ON  e_listen.session_id = e_speak.session_id
    AND e_listen.message_id = e_speak.message_id
    AND e_listen.event_type = 'started_listening'
    AND e_speak.event_type  = 'started_speaking'
JOIN sessions s ON e_listen.session_id = s.id
GROUP BY s.id, s.name
ORDER BY s.name;
```

---

## Estadísticas globales

```sql
-- Resumen por sesión: duración, nº mensajes, nº eventos
SELECT
    s.name                                          AS session_name,
    u.name                                          AS participant,
    s.started_at,
    EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::int
                                                    AS duration_seconds,
    COUNT(DISTINCT m.id)                            AS total_messages,
    COUNT(DISTINCT e.id)                            AS total_robot_events
FROM sessions s
LEFT JOIN users     u ON s.user_id    = u.id
LEFT JOIN messages  m ON m.session_id = s.id
LEFT JOIN robot_events e ON e.session_id = s.id
GROUP BY s.id, s.name, u.name, s.started_at, s.ended_at
ORDER BY s.started_at DESC;

-- Número de mensajes por origen en todas las sesiones
SELECT
    s.name  AS session_name,
    m.origin,
    COUNT(*) AS messages
FROM messages m
JOIN sessions s ON m.session_id = s.id
GROUP BY s.id, s.name, m.origin
ORDER BY s.name, m.origin;
```

---

## Exportar una sesión completa a CSV (desde psql)

```sql
\copy (
  SELECT
      'message'   AS kind,
      m.sent_at   AS timestamp,
      m.origin,
      m.emotion,
      m.text,
      NULL        AS event_type
  FROM messages m
  WHERE m.session_id = '<SESSION_ID>'
  UNION ALL
  SELECT
      'robot_event',
      e.occurred_at,
      NULL, NULL, NULL,
      e.event_type
  FROM robot_events e
  WHERE e.session_id = '<SESSION_ID>'
  ORDER BY timestamp
) TO '/tmp/sesion_export.csv' CSV HEADER;
```
