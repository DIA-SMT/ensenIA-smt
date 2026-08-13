# ENSEÑIA SMT — Aula Municipal

Plataforma educativa con IA para escuelas municipales de San Miguel de Tucumán.
Los docentes generan contenido con IA a partir de sus programas reales, lo publican
como actividades para sus estudiantes, y analizan la **huella digital** de cada
alumno (cuándo vio, cuánto trabajó, qué respondió).

## Stack

- **Frontend**: React 19 + Vite + TypeScript (SPA, dark UI)
- **Backend**: Supabase (Postgres + RLS, Auth, Storage, Edge Functions)
- **IA**: Claude (Anthropic) — `claude-sonnet-5` para generación/estructura, `claude-haiku-4-5` para resúmenes y extracción de texto

## Funcionalidades

| Rol | Qué puede hacer |
|---|---|
| **Docente** | Laboratorio IA (actividades, evaluaciones, resúmenes, presentaciones, rúbricas) · **Importar programa anual (PDF/Word, incluso escaneado) → planificación automática** · Biblioteca digital con archivos reales + resumen IA + compartir con estudiantes · Publicar actividades con cuestionarios autocorregibles · Resultados con huella digital, **"qué les costó" por pregunta**, cómo se sintió cada alumno · **Devoluciones rápidas de un toque** · **Observaciones** (la info que estaba solo en la cabeza del docente) · Señales por estudiante · Citar familias |
| **Estudiante** | Cuenta propia con ID por materia · Realizar actividades con autoguardado (y offline) · **Check-in emocional al empezar y al terminar** (opcional, sin nota) · Ver notas, reacciones y devoluciones · Biblioteca compartida |
| **Familia** | Cuenta padre/tutor vinculada a estudiantes · **Comunicados oficiales y citaciones** con confirmación de asistencia · Ficha de sus hijos |
| **Director/a** | Dashboard institucional · Equipo docente · Comunicaciones internas · **Avisos a familias con acuses de recibo** · Alertas |

> La IA corre vía **OpenRouter** (modelos Claude). Secret requerido: `OPENROUTER_API_KEY`.

### Acceso dinámico y material de estudio

- **QR por actividad**: cada actividad tiene su QR (botón en la lista, en resultados y al publicar una Actividad Rápida) para proyectar en el aula o imprimir. El estudiante escanea y cae directo en la actividad; si no tiene sesión, loguea una vez y sigue derecho (`/login?next=...`).
- **Placas de estudio**: la IA convierte cualquier material de la biblioteca en tarjetas visuales (un concepto por placa, emoji + título + explicación) que los estudiantes hojean en el celular. Se guardan en el material (`study_cards`) y se comparten junto con él.
- **PDFs sin servidor** (jsPDF en el navegador): las placas se descargan como PDF cuadrado (una placa por página) y el resumen IA como A4 imprimible.

### Inteligencia de señales

- **⚡ Actividad Rápida** (`/actividad-rapida`): flujo mobile-first para docentes — curso → tema → la IA genera → cuestionario opcional → publicada en un minuto. El botón principal del topbar lleva ahí.
- **Resumen IA del estudiante**: en el perfil del alumno, sintetiza señales + observaciones + métricas en un texto accionable para reuniones con la familia.
- **Alertas automáticas** (triggers en Postgres, migración 005): 2+ check-ins negativos en 7 días → alerta a los docentes del curso; entrega con ≤40% del puntaje → alerta al docente de la actividad. Con deduplicación.

## Modo offline (PWA)

Pensado para estudiantes sin datos móviles:

- La app es **instalable** (Agregar a pantalla de inicio) y arranca sin conexión.
- Todo lo visto con conexión queda cacheado (actividades, planificación, material).
- Las respuestas, entregas y huella digital de los estudiantes se **encolan en el dispositivo**
  y se sincronizan solas al detectar conexión (wifi de la escuela, por ejemplo).
- Banner de estado siempre visible: sin conexión / cambios pendientes / sincronizando.
- Límites: el primer login y el primer "Comenzar actividad" necesitan conexión; las
  funciones de IA (generación, importar programa) requieren internet.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
```

Variables en `.env.local`:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

### Backend (Supabase)

- Migraciones en `supabase/migrations/` (001 esquema, 002 chat IA, 003 estudiantes+actividades+storage).
- Edge functions en `supabase/functions/`: `ia-chat` (chat con streaming) y `process-document`
  (extraer texto, resumir, importar programa, extraer preguntas — structured outputs).
- Deploy de funciones: `supabase functions deploy <name> --project-ref <ref> --use-api`
- Secret necesario para la IA: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>`
- Seed de datos demo: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed.ts`

## Cuentas demo (password: `demo123`)

| Rol | Email |
|---|---|
| Directora | `ana.martinez@ensenia.edu.ar` |
| Docente | `marco.rossi@ensenia.edu.ar` (Física I 4°A · Historia 2°B · Geografía 5°B) |
| Estudiante | `sofia.ramirez@estudiante.ensenia.edu.ar` (2°B, entregó la actividad demo) |
| Estudiante | `nicolas.moreno@estudiante.ensenia.edu.ar` (2°B, actividad en curso) |
| Estudiante | `martina.silva@estudiante.ensenia.edu.ar` (4°A) |

## Flujo demo sugerido

1. Entrá como **Marco (docente)** → Laboratorio IA → materia *Física I — 4° A* → **Importar programa** → subí `Física I - 4° A 2026.pdf` → la IA crea las 7 unidades del programa.
2. Elegí una clase → generá una actividad → **Publicar actividad** (con "Extraer preguntas con IA").
3. Entrá como **Sofía (estudiante)** → realizá la actividad → entregá.
4. Volvé como Marco → **Actividades** → mirá resultados y la **huella digital** de cada alumno.
