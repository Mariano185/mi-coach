# CLAUDE.md — mi-coach (doc técnica para el dev)

> **Este archivo es para el DEV** (Claude trabajando en el código), no para el coach.
> El **coach** vive un nivel arriba (`../CLAUDE.md`) y trata el proyecto como **caja negra**:
> solo sabe leer/guardar datos vía `http://192.168.0.110:3001`. No toca código.
> Acá está todo lo técnico: arquitectura, schema, API, deploy.

---

## Qué es

App single-user, local-first, para registrar y programar entrenamientos de powerbuilding.
El coach prescribe semanas estructuradas (objetivo); el atleta completa pesos/reps/RPE reales
en la UI; completar un día genera una sesión en el historial que alimenta Dashboard/Stats.

## Stack

- **Backend:** Express + `better-sqlite3` (`server/`, puerto **3001**). TypeScript, ESM (`.js` en imports).
- **Frontend:** React + Vite (`client/`, dev en **5173**). TypeScript.
- **DB:** SQLite (`coach.db`). WAL mode + `foreign_keys` ON.
- **Monorepo:** npm workspaces (`server`, `client`).

```
mi-coach/
├── server/src/   db.ts · index.ts · types.ts · routes/{exercises,sessions,sets,bodyweight,stats,programs,program}.ts
├── client/src/   App.tsx · api.ts · types.ts · main.tsx · styles.css
│                 pages/{Dashboard,History,Bodyweight,LogSession,Programs}.tsx
│                 pages/program/{WeekView,DayView,ExerciseView}.tsx
│                 components/{Toast,TrendChart,CoachNotes,icons}.tsx
├── deploy/       mi-coach.service · README.md  (deploy Proxmox)
└── memory/       notas de proyecto para Claude
```

## Correr local (dev)

```bash
npm install        # raíz — instala ambos workspaces
npm run dev        # server :3001 + client :5173 (concurrently)
npm run build      # tsc server + vite build client
npm run serve      # node server/dist/index.js (modo prod, sirve SPA + API en :3001)
```

En **producción**, un solo proceso Express sirve la API en `/api/*` y el `client/dist`
como SPA (static + catch-all fallback). Ver `server/src/index.ts`.

`COACH_DB_PATH` (env) sobreescribe la ruta de `coach.db`; default = raíz del repo.

---

## Schema (coach.db)

**Registro real (lo que pasó):**
- `exercises` — `id, nombre, categoria, es_basico`. Seedeada (`EXERCISE_LIBRARY` en db.ts). Los 3 primeros = básicos.
- `sessions` — `id, fecha, tipo(A/B), energia, sueno_horas, motivacion, dolor_molestias, notas`.
- `sets` — `id, session_id, exercise_id, n_serie, peso_kg, reps, rpe`.
- `bodyweight` — `id, fecha, peso_kg`.
- `settings` — `clave/valor` (rm_squat, rm_bench, rm_deadlift).

**Programa estructurado (lo prescrito → lo completado):**
- `program_weeks` — `id, semana(UNIQUE), nombre, bloque, notas, fecha_creada, activa`.
- `program_days` — `id, week_id→weeks, dia, tipo(A/B), titulo, warmup, fecha_plan, session_id→sessions, orden`.
- `program_exercises` — `id, day_id→days, exercise_id→exercises, nombre_libre, seccion(main|accesorio|core), reps_text, carga_text, rpe_text, notas, orden`.
- `program_sets` — `id, program_exercise_id→exercises, n_serie, target_reps, target_rpe, real_peso, real_reps, real_rpe, hecha, notas`.

Cascadas `ON DELETE CASCADE` week→day→exercise→set. `program_days.session_id` se llena al **completar el día**.

**Vistas (e1RM Epley, nunca hardcodear):**
- `v_sets_e1rm` — `sets.* + e1rm = peso_kg*(1+reps/30)`.
- `v_program_sets_e1rm` — `program_sets.* + e1rm + tonelaje` (solo series reales completas).

**`programs` (legacy):** blob `.md`. Migrado a tablas estructuradas vía `migrateMarkdownPrograms()`
(corre una vez si `program_weeks` está vacía). No usar para semanas nuevas.

---

## API (`/api`)

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/exercises` | lista la library |
| **POST** | `/exercises` | crea ejercicio en la library (`nombre` único, `es_basico` default 0) |
| GET/POST | `/sessions`, `/sessions/:id` | sesiones (registro manual) |
| POST | `/sets` | agregar serie real a una sesión |
| GET/POST | `/bodyweight` | peso corporal |
| GET | `/stats` | métricas dashboard (e1RM, volumen) |
| GET | `/programs`, `/programs/:id` | legacy `.md` (no usar) |
| **GET** | `/program/weeks` | lista semanas |
| **GET** | `/program/weeks/:id` | semana + cards de días |
| **GET** | `/program/days/:id` | día + cards de ejercicios |
| **GET** | `/program/exercises/:id` | ejercicio + series (de `v_program_sets_e1rm`) |
| **PATCH** | `/program/exercises/:id` | swap/editar ejercicio prescrito (`exercise_id`, `seccion`, `reps_text`/`carga_text`/`rpe_text`, `notas`); no toca series |
| **PATCH** | `/program/sets/:id` | editar `real_peso/reps/rpe`; pone `hecha=1` si peso+reps presentes |
| **POST** | `/program/days/:id/complete` | idempotente: crea/reusa `session` + inserta `sets` reales → historial |
| **POST** | `/program/weeks` | crea semana estructurada completa desde JSON |

**Crear semana** (la usa el coach; detalle del JSON en la skill `nueva-semana`).
Requiere auth: header `X-Coach-Key` (o cookie de sesión). Ver sección **Auth**.
```bash
curl -s -X POST http://192.168.0.110:3001/api/program/weeks \
  -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  -d '{ "semana": 7, "nombre": "...", "bloque": "...", "notas": "...", "days": [ ... ] }'
```

**Flujo completar día → historial:** UI edita `program_sets` reales (PATCH) → "Registrar día"
(`POST /days/:id/complete`) → crea `session` + `sets`, linkea `program_days.session_id`.
Re-registrar es idempotente (reusa la session). Esto reemplaza LogSession para días planificados.

---

## Auth (single-user, `server/src/auth.ts`)

Login con password único. Hash **bcrypt** en `settings["auth_password_hash"]`; cookie de sesión
firmada con HMAC (secret en `settings["auth_session_secret"]`).

- `app.use("/api", requireAuth)` protege **todo** `/api/*`. Excepciones públicas montadas **antes**
  del guard: `/api/health` y `/api/auth/*` (login/logout/status).
- **Bootstrap del password:** `bootstrapAuth()` hashea `AUTH_PASSWORD` (env) en el primer arranque
  si no hay hash en DB. Después la DB es la fuente de verdad.
- **Coach key:** `requireAuth` también acepta el header `X-Coach-Key` contra
  `settings["coach_api_key"]` (auto-generado al arrancar, se imprime una vez en el log; compare
  timing-safe). Es la vía del coach (caja negra) para leer/escribir sin sesión de browser.
  Recuperarlo: `journalctl -u mi-coach | grep coach_api_key` o leer `settings`.

> **Deuda conocida:** el token de sesión no expira server-side (la cookie sí, a 30d). Sin `exp`
> firmado, un token robado vale indefinidamente. No urgente; anotado para endurecer.

---

## Acceso a la DB en producción (CT Proxmox)

DB en el CT: `/var/lib/mi-coach/coach.db`. **El server siempre corre** → no abras una
segunda conexión SQLite directa mientras corre (**WAL lock** = lecturas vacías/erróneas).

- **Leer/escribir normal:** vía API (`http://192.168.0.110:3001/api/...`).
- **Query SQL ad-hoc:** SSH + node en el CT:
  ```bash
  ssh root@192.168.0.100 "pct exec 110 -- node -e \"
  const db=require('/opt/mi-coach/server/node_modules/better-sqlite3')('/var/lib/mi-coach/coach.db');
  console.table(db.prepare('SELECT * FROM exercises').all());
  \""
  ```
- **Escritura SQL directa:** parar el server primero
  (`pct exec 110 -- systemctl stop mi-coach`), correr, reiniciar.

---

## Deploy (Proxmox CT)

- **CT 110** `mi-coach` en `192.168.0.110` (host Proxmox `192.168.0.100`, acceso por WireGuard).
- Node 20, systemd `mi-coach.service` (autostart, `User=micoach`, `COACH_DB_PATH=/var/lib/mi-coach/coach.db`).
- App: `http://192.168.0.110:3001`. Repo: `https://github.com/Mariano185/mi-coach`.
- Guía completa: `deploy/README.md`.

**Actualizar a una versión nueva:**
```bash
ssh root@192.168.0.100 "pct exec 110 -- bash -c \
  'cd /opt/mi-coach && git pull && npm install && npm run build && systemctl restart mi-coach'"
```
`coach.db` vive fuera del repo (`/var/lib/mi-coach`) → `git pull` no lo toca.

---

## Convenciones

- **e1RM siempre desde las vistas** (`v_sets_e1rm` / `v_program_sets_e1rm`), nunca recalculado a mano en JS/SQL ad-hoc.
- Imports ESM con extensión `.js` en el server (TS compila a ESM).
- Tipos compartidos espejados en `server/src/types.ts` y `client/src/types.ts` (mantener en sync).
- Frontend: tema "Forge" (lima `#c8f54a`, Oswald display) en `client/src/styles.css`. Drill-down semana→día→ejercicio con tabs OBJETIVO/REAL.
- Para mejorar UI usar las skills en `.agents/skills/`.
