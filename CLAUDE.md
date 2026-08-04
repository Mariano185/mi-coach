# CLAUDE.md — mi-coach (doc técnica para el dev)

> **Este archivo es para el DEV** (el agente trabajando en el código), no para el coach.
> El **coach** vive fuera del repo y trata el proyecto como **caja negra**: solo lee/escribe
> datos vía la API HTTP con el header `X-Coach-Key`. No toca código.
> Acá está lo técnico: arquitectura, schema, API, deploy.
>
> Los detalles del entorno de producción particular (IPs, hosts, accesos) **no se versionan**:
> viven en `CLAUDE.local.md` (gitignoreado). Si existe, leelo también.

---

## Qué es

App single-user, local-first, para registrar y programar entrenamientos de powerbuilding.
El coach prescribe semanas estructuradas (objetivo); el atleta completa pesos/reps/RPE reales
en la UI. El historial se deriva solo: un día cuenta como entrenado apenas tiene una serie
real completa (fecha/hora se autosetean). Dashboard/Stats y el análisis del coach leen de ahí.

## Stack

- **Backend:** Express + `better-sqlite3` (`server/`, puerto **3001**). TypeScript, ESM (`.js` en imports).
- **Frontend:** React + Vite (`client/`, dev en **5173**). TypeScript. SWR para cache.
- **DB:** SQLite (`coach.db`). WAL mode + `foreign_keys` ON. Migraciones idempotentes en `db.ts`.
- **Monorepo:** npm workspaces (`server`, `client`).

```
mi-coach/
├── server/src/   db.ts · index.ts · auth.ts · types.ts
│                 routes/{exercises,bodyweight,program,history,mesociclos,stats,coach,settings,trac}.ts
│                 test/   (vitest + supertest, DB en memoria)
├── client/src/   App.tsx · api.ts · swr.ts · types.ts · main.tsx · styles.css
│                 pages/{Dashboard,History,Bodyweight,Programs,Trac,Login}.tsx
│                 pages/program/{WeekView,DayView,ExerciseView}.tsx
│                 components/{BottomNav,Toast,TrendChart,CoachNotes,icons}.tsx
│                 constants/trac.ts
├── docs/deploy/  mi-coach.service · README.md (deploy genérico) · TAILSCALE.md (acceso remoto)
├── docs/agents/  issue tracker, triage labels, domain docs (meta-docs para skills)
└── .claude/memory/ notas históricas de proyecto para el agente
```

## Correr local (dev)

```bash
npm install        # raíz — instala ambos workspaces
npm run dev        # server :3001 + client :5173 (concurrently)
npm run build      # tsc server + vite build client
npm run serve      # node server/dist/index.js (modo prod, sirve SPA + API en :3001)
npm test --workspace server   # tests de API
```

En **producción**, un solo proceso Express sirve la API en `/api/*` y el `client/dist`
como SPA (static + catch-all fallback). Ver `server/src/index.ts`.

`COACH_DB_PATH` (env) sobreescribe la ruta de `coach.db`; default = raíz del repo.

---

## Schema (coach.db)

**Programa estructurado — única fuente de verdad del entrenamiento:**
- `mesociclos` — `id, nombre, objetivo, notas, fecha_inicio, fecha_fin, orden, fecha_creada`. Agrupa semanas; la numeración de semana se reinicia por mesociclo.
- `program_weeks` — `id, semana, mesociclo_id→mesociclos, nombre, bloque, notas, fecha_creada, activa`. `UNIQUE(mesociclo_id, semana)`.
- `program_days` — `id, week_id→weeks, dia, tipo(texto libre opcional), titulo, warmup, notas, fecha, hora_inicio, hora_fin, orden`. `fecha`/`hora_inicio` se autosetean al completar la primera serie del día.
- `program_exercises` — `id, day_id→days, exercise_id→exercises, nombre_libre, seccion(main|accesorio|core), reps_text, carga_text, rpe_text, notas, orden`.
- `program_sets` — `id, program_exercise_id→exercises, n_serie, target_reps, target_rpe, target_peso, real_peso, real_reps, real_rpe, hecha, notas`. `hecha` se deriva de peso+reps presentes.

Cascadas `ON DELETE CASCADE` week→day→exercise→set.

**Resto:**
- `exercises` — library seedeada (`EXERCISE_LIBRARY` en db.ts). `es_basico=1` marca los 3 básicos.
- `bodyweight` — `fecha, peso_kg, kcal_objetivo, proteina_g, hambre, digestion, notas`.
- `trac` — bienestar diario 1–5 (`fatiga_pierna/empuje/traccion, descanso_alimentacion, recuperacion, motivacion, tecnica`), una fila por fecha (upsert).
- `settings` — clave/valor: `rm_squat/bench/deadlift`, hashes de auth, `coach_api_key`.

**Vista (e1RM Epley, nunca hardcodear):**
- `v_program_sets_e1rm` — `program_sets.* + e1rm + tonelaje + rir` (solo series reales completas).

> Las tablas `sessions`/`sets` y el blob legacy `programs` (.md) **ya no existen**: se
> eliminaron cuando `program_sets` pasó a ser la única fuente de verdad. Las migraciones en
> `db.ts` dropean lo viejo de forma idempotente en DBs ya desplegadas.

---

## API (`/api`)

Tabla completa de endpoints en el `README.md` (raíz). Resumen de lo no obvio:

- **`PATCH /program/sets/:id`** — completa/edita `real_*` de una serie; deriva `hecha` y, si
  la serie queda hecha, autosetea `fecha`/`hora_inicio` del día (`COALESCE`, no pisa valores).
  Esto **reemplaza** al viejo botón "Registrar día": no existe más `POST /days/:id/complete`.
- **`PATCH /program/sets/:id/target`** — el coach corrige la prescripción (`target_*`) sin tocar lo real.
- **`GET /history` / `GET /history/:dayId`** — historial derivado de `program_sets` (reemplaza a `/sessions`).
- **`GET /coach/analisis?dias=42`** — todo lo que el coach necesita en un JSON: e1RM, progresión,
  RPE, peso corporal, volumen por categoría, sesiones realizadas, Trac reciente, library, mesociclos.
- **`POST /program/weeks`** — crea la semana completa desde JSON (semana, días, ejercicios, series
  target). Ejemplo del payload en el README. `409` si ya existe esa semana en el mesociclo.
- Semanas/días/ejercicios tienen PATCH de merge parcial (solo pisa campos presentes en el body) y
  DELETE con cascade.

**Flujo de registro:** UI edita `program_sets` reales (PATCH con autosave debounced) → el día
aparece en Historial automáticamente. No hay paso manual de registro.

---

## Auth (single-user, `server/src/auth.ts`)

Login con password único. Hash **bcrypt** en `settings["auth_password_hash"]`; cookie de sesión
firmada con HMAC (secret en `settings["auth_session_secret"]`), 30 días.

- `app.use("/api", requireAuth)` protege **todo** `/api/*`. Excepciones públicas montadas **antes**
  del guard: `/api/health` y `/api/auth/*` (login/logout/status).
- **Bootstrap del password:** `bootstrapAuth()` hashea `AUTH_PASSWORD` (env) en el primer arranque
  si no hay hash en DB. Después la DB es la fuente de verdad.
- **Coach key:** `requireAuth` también acepta el header `X-Coach-Key` contra
  `settings["coach_api_key"]` (auto-generado al arrancar, se imprime una vez en el log; compare
  timing-safe). Es la vía del coach (caja negra) para leer/escribir sin sesión de browser.
- Con `NODE_ENV=production` la cookie es `secure` → el login de browser requiere HTTPS.

> **Deuda conocida:** el token de sesión no expira server-side (la cookie sí, a 30d). Sin `exp`
> firmado, un token robado vale indefinidamente. No urgente; anotado para endurecer.

---

## Acceso a la DB en producción

**El server siempre corre** → no abras una segunda conexión SQLite directa mientras corre
(**WAL lock** = lecturas vacías/erróneas).

- **Leer/escribir normal:** vía API (`X-Coach-Key`).
- **Escritura SQL directa:** parar el servicio primero, correr, reiniciar.
- Rutas, hosts y comandos concretos del entorno real: ver `CLAUDE.local.md` (no versionado).

## Deploy

Genérico (Linux + systemd, cualquier PC/homelab/VPS): `docs/deploy/README.md`. Acceso remoto
opcional con Tailscale Funnel: `docs/deploy/TAILSCALE.md`. `coach.db` vive fuera del repo
(`COACH_DB_PATH`) → `git pull` + `npm run build` + restart no tocan los datos.

---

## Convenciones

- **e1RM siempre desde la vista** `v_program_sets_e1rm`, nunca recalculado a mano en JS/SQL ad-hoc.
- Imports ESM con extensión `.js` en el server (TS compila a ESM).
- Tipos compartidos espejados en `server/src/types.ts` y `client/src/types.ts` (mantener en sync).
- Frontend: tema "Forge" (lima `#c8f54a`, Oswald display) en `client/src/styles.css`. Drill-down semana→día→ejercicio con tabs OBJETIVO/REAL.
- Para mejorar UI usar las skills en `.claude/skills/`.

## Agent skills

  ### Issue tracker

  Issues live in GitHub Issues (`Mariano185/mi-coach`). See `docs/agents/issue-tracker.md`.

  ### Triage labels

  Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

  ### Domain docs

  Single-context repo — one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.
