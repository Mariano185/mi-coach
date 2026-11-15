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
en la UI. Los días entrenados se derivan solos: un día cuenta como entrenado apenas tiene una serie
real completa (fecha/hora se autosetean). Dashboard/Stats y el análisis del coach leen de ahí.

## Stack

- **Backend:** Express + `better-sqlite3` (`server/`, puerto **3001**). TypeScript, ESM (`.js` en imports).
- **Frontend:** React + Vite (`client/`, dev en **5173**). TypeScript. SWR para cache.
- **DB:** SQLite (`coach.db`). WAL mode + `foreign_keys` ON. Migraciones idempotentes en `db.ts`.
- **Monorepo:** npm workspaces (`server`, `client`).

```
mi-coach/
├── server/src/   db.ts · index.ts · auth.ts · types.ts · calendario.ts · e1rm-sql.ts
│                 routes/{exercises,catalogo,cuerpo,program,mesociclos,stats,coach,trac,
│                         ingesta,nutricion,pasos}.ts
│                 docs/   manual del coach (GET /api/coach/docs): flujo-semana, analisis,
│                         enciclopedia, nutricion
│                 seed/   enciclopedia de ejercicios (músculos, patrones, ejercicios)
│                 validacion/  validadores compartidos (fecha, ejercicio, objetivo nutricional)
│                 test/   (vitest + supertest, DB en memoria)
├── client/src/   App.tsx · api.ts · swr.ts · types.ts · main.tsx · styles.css
│                 pages/{Dashboard,Nutricion,Cuerpo,Programs,Trac,Login}.tsx
│                 pages/program/{WeekView,DayView,ExerciseView}.tsx
│                 components/{BottomNav,Toast,TrendChart,CoachNotes,E1rmValor,Expandable,
│                             OfflineBanner,UpdatePrompt,icons}.tsx
│                 constants/{trac,cuerpo}.ts
├── docs/adr/     decisiones de arquitectura (enciclopedia, e1RM RTS, dos relojes)
├── docs/deploy/  mi-coach.service · README.md (deploy genérico) · TAILSCALE.md (acceso remoto)
│                 ATAJO-PASOS.md (atajo de iOS que manda los Pasos diarios)
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
- `program_weeks` — `id, semana, mesociclo_id→mesociclos, nombre, bloque, notas, fecha_creada, activa`, más el Objetivo nutricional del coach: `objetivo_kcal/proteina_g/carbohidratos_g/grasas_g` (los cuatro juntos o ninguno), `nota_nutricional`, `objetivos_pautados_en` (desde qué fecha rige; ADR 0003, `calendario.ts`). `UNIQUE(mesociclo_id, semana)`.
- `program_days` — `id, week_id→weeks, dia, tipo(texto libre opcional), titulo, warmup, notas (del coach), notas_atleta, fecha, hora_inicio, hora_fin, orden`. `fecha`/`hora_inicio` se autosetean con el primer valor real (peso, reps o RPE) cargado en cualquier serie del día — abrir el día para mirarlo no lo fecha; `hora_fin` se corre a la hora de cada serie que pasa a hecha mientras el día sea hoy.
- `program_exercises` — `id, day_id→days, exercise_id→exercises, nombre_libre, seccion(main|accesorio|core), reps_text, carga_text, rpe_text, notas, orden`.
- `program_sets` — `id, program_exercise_id→exercises, n_serie, target_reps, target_rpe, target_peso, real_peso, real_reps, real_rpe, hecha, notas`. `hecha` se deriva de peso+reps presentes.

Cascadas `ON DELETE CASCADE` week→day→exercise→set.

**Resto:**
- `exercises` — enciclopedia de ejercicios (ADR 0001, seed en `server/src/seed/`): identidad de la
  variante (`patron_id`, `ejercicio_padre_id`, implemento, agarre…), costos y `rastrea_e1rm=1` para
  los movimientos de competencia (reemplazó a `es_basico`, que se dropea en la migración).
- `musculos` · `patrones` · `ejercicio_musculos` — músculos por ejercicio con `rol`
  (agonista/sinergista/estabilizador) y `fraccion_volumen`; alimentan `v_volumen_por_musculo`.
- `registro_corporal` — Registro corporal: `fecha` (UNIQUE), `peso_kg`, Perímetros opcionales
  (`brazo_cm, pierna_cm, abdomen_cm`, con Protocolo de medición fijo), `notas`. Reemplazó a `bodyweight`.
- `trac` — bienestar diario 1–5 (`fatiga_pierna/empuje/traccion, sueno, recuperacion, motivacion, tecnica`), una fila por fecha (upsert). `sueno` se llamaba `descanso_alimentacion` hasta noviembre de 2026.
- `ingesta_diaria` — Ingesta diaria del atleta: `fecha` (UNIQUE), `kcal, proteina_g, carbohidratos_g,
  grasas_g` (obligatorios, enteros ≥ 0), `comentario`. Sin fila = "no cargado", nunca 0 kcal.
- `pasos_diarios` — Pasos diarios que manda el atajo de iOS: `fecha` (UNIQUE), `pasos` (entero ≥ 0).
  Upsert por fecha (`PUT /api/pasos`); sin fila = "no llegó", nunca 0 pasos.
- `settings` — clave/valor: `rm_squat/bench/deadlift`, hashes de auth, `coach_api_key`, `device_api_key`.

**Vistas (nunca recalcular a mano, siempre leer de acá):**
- `v_program_sets_e1rm` — `program_sets.* + e1rm + e1rm_confianza + tonelaje + rir`. e1RM = serie
  proyectada al fallo con el RPE (reps + (10 − RPE), sin redondear) convertida con la tabla RTS
  (Tuchscherer, interpolada); NULL sin RPE, con RPE < 5 o > 10 reps proyectadas. `e1rm_confianza`:
  `alta` (RPE ≥ 7) / `baja` (RPE 5–6,5, no cuenta para mejor e1RM ni tendencia). DDL en
  `server/src/e1rm-sql.ts`, compartido con los tests. Los e1RM históricos cambiaron al dejar
  Epley (issue #14): la vista se recrea en cada arranque y recalcula todo el historial.
- `v_volumen_por_musculo` — volumen fraccionado por rol (agonista 1.0, sinergista 0.5,
  estabilizador no suma), una fila por `(week_id, musculo_id)`. Trae `series_programadas` y
  `series_completadas` por separado, más `semana_programa`/`mesociclo_id`/`week_id` y la semana
  ISO (`semana`, puede ser NULL). Agrupa por `week_id`, no por `semana` ISO ni por
  `semana_programa` a secas: las semanas de programa duran 8-9 días (no 7, así que la ISO mezcla
  semanas distintas) y `semana_programa` se reinicia por mesociclo (así que colisiona entre
  mesociclos). `week_id` es la única clave no ambigua.

> Las tablas `sessions`/`sets` y el blob legacy `programs` (.md) **ya no existen**: se
> eliminaron cuando `program_sets` pasó a ser la única fuente de verdad. Las migraciones en
> `db.ts` dropean lo viejo de forma idempotente en DBs ya desplegadas.

---

## API (`/api`)

Tabla completa de endpoints en el `README.md` (raíz). Resumen de lo no obvio:

- **`PATCH /program/sets/:id`** — completa/edita `real_*` de una serie; deriva `hecha` y, si
  la serie queda con algún valor real (peso, reps o RPE, aunque no esté hecha), autosetea
  `fecha`/`hora_inicio` del día (`COALESCE`, no pisa valores). El client no precarga la fecha:
  un día sin fecha muestra el input vacío y DayView solo guarda fecha/horas si cambiaron.
  Si la serie **recién** pasa a hecha y el día es hoy, `hora_fin` = hora actual (= última serie),
  así sale `duracion_min` en `/coach/analisis`; días viejos o editar una serie ya hecha no la tocan.
  "Ahora" sale de `ahoraLocal()` en JS (TZ del proceso) para poder fijarlo en tests con fake timers.
  Esto **reemplaza** al viejo botón "Registrar día": no existe más `POST /days/:id/complete`.
- **`PATCH /program/sets/:id/target`** — el coach corrige la prescripción (`target_*`) sin tocar lo real.
- **`GET /coach/analisis?dias=42`** — todo lo que el coach necesita en un JSON: e1RM, progresión,
  RPE, peso corporal, volumen por músculo (`v_volumen_por_musculo`), sesiones realizadas, Trac reciente, Ingesta diaria,
  Pasos diarios (`pasos_diarios`: solo las fechas que llegaron), library, mesociclos.
- **`POST /program/weeks`** — crea la semana completa desde JSON (semana, días, ejercicios, series
  target). Ejemplo del payload en el README. `409` si ya existe esa semana en el mesociclo.
- Semanas/días/ejercicios tienen PATCH de merge parcial (solo pisa campos presentes en el body) y
  DELETE con cascade.

**Flujo de registro:** UI edita `program_sets` reales (PATCH con autosave debounced) → el día
cuenta como entrenado automáticamente y se consulta en Programas. No hay paso manual de registro.

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
- **Device key:** header `X-Device-Key` contra `settings["device_api_key"]` (mismo ciclo de vida
  que la del coach). Es la del atajo de iOS de Pasos diarios y **solo** vale para `PUT /api/pasos`
  (`RUTA_DISPOSITIVO` en auth.ts, falla cerrado); con ella cualquier otra ruta da 401.
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
opcional con Tailscale Funnel: `docs/deploy/TAILSCALE.md`. Atajo de iOS para los Pasos diarios:
`docs/deploy/ATAJO-PASOS.md`. `coach.db` vive fuera del repo
(`COACH_DB_PATH`) → `git pull` + `npm run build` + restart no tocan los datos.

---

## Convenciones

- **e1RM siempre desde la vista** `v_program_sets_e1rm` (RPE + tabla RTS, con `e1rm_confianza`),
  nunca recalculado a mano en JS/SQL ad-hoc. "Mejor e1RM" y tendencia filtran
  `e1rm_confianza = 'alta'`.
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

  Single-context repo — one `GLOSSARY.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.
