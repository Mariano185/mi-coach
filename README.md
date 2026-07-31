# Mi Coach — Powerbuilding Coach

App **single-user, local-first** para programar y registrar entrenamientos de powerbuilding.

La idea central: un **coach** prescribe semanas estructuradas (mesociclo → semana → día → ejercicio → serie con objetivos de peso/reps/RPE) a través de la API, y el **atleta** completa los valores reales de cada serie desde la UI web (instalable como PWA en el celular). Historial, dashboard y análisis salen de esos mismos datos — sin doble carga.

El coach puede ser **cualquier agente de IA** (Claude, ChatGPT, Gemini, un script propio…) o un humano con `curl`: solo necesita hacer requests HTTP con una API key. La app no depende de ningún proveedor de IA.

## Features

- **Programa estructurado** con drill-down semana → día → ejercicio, tabs Objetivo/Real por serie, autosave con indicador de sincronización.
- **Historial** derivado automáticamente: un día aparece en el historial apenas completás la primera serie (fecha y hora se autosetean).
- **Dashboard** con e1RM estimado por básico (Epley), tendencia de peso corporal (promedio móvil 7 días) y volumen semanal.
- **Peso / Nutrición**: registro de peso corporal, kcal objetivo, proteína, hambre y digestión.
- **Trac**: tracker diario de bienestar/recuperación (fatiga por patrón, descanso, motivación, técnica) en escala 1–5.
- **Mesociclos**: agrupador de semanas con numeración propia por bloque.
- **Endpoint de análisis para el coach** (`/api/coach/analisis`): progresión de e1RM, RPE, volumen, frecuencia y bienestar en un solo JSON.
- **Auth** simple de un solo usuario: password + cookie, y una API key (`X-Coach-Key`) para el coach.
- **PWA**: manifest + íconos; se agrega a la pantalla de inicio del celular.

## Stack

- **Frontend:** React + TypeScript + Vite (`client/`, dev en puerto 5173). SWR para cache y revalidación.
- **Backend:** Node + TypeScript + Express + `better-sqlite3` (`server/`, puerto 3001).
- **Base de datos:** SQLite (`coach.db`). WAL mode + foreign keys ON. Migraciones idempotentes al arrancar.
- **Monorepo:** npm workspaces (`server`, `client`). Sin servicios externos: todo corre en un solo proceso.

## Requisitos

- Node.js 20+ (probado con Node 24). `npm` 10+.
- En Windows, `better-sqlite3` usa binarios precompilados — normalmente no necesitás herramientas de compilación. Si fallara, instalá Visual Studio Build Tools con "Desktop development with C++". En Linux alcanza con `build-essential`.

## Instalar y correr (dev)

```bash
npm install       # instala raíz + workspaces
npm run dev       # server :3001 + client :5173
```

Otros scripts:

- `npm run build` — compila server (tsc) + client (vite build).
- `npm run serve` — modo producción: un solo proceso en :3001 sirve la API y el `client/dist` como SPA.
- `npm test --workspace server` — tests de la API (vitest + supertest, DB en memoria).

Variables de entorno útiles:

| Variable | Qué hace |
|---|---|
| `COACH_DB_PATH` | ruta de `coach.db` (default: raíz del repo) |
| `AUTH_PASSWORD` | password inicial; se hashea con bcrypt en el primer arranque |
| `PORT` | puerto del server (default 3001) |

## Deploy (producción)

Corre en cualquier lado donde corra Node: **tu PC, un homelab (Proxmox, Raspberry Pi…) o un VPS**. Un solo proceso Express sirve todo — no hace falta nginx ni Docker.

Guía completa (systemd, datos persistentes, backups, acceso remoto con Tailscale): [`deploy/README.md`](deploy/README.md).

## Auth

- **Atleta (browser):** login con password único. El hash bcrypt vive en la DB (`settings`); el password inicial se toma de `AUTH_PASSWORD` la primera vez. Cookie de sesión firmada, 30 días.
- **Coach (API):** header `X-Coach-Key`. La key se auto-genera en el primer arranque y se imprime una vez en el log del server.
- Público sin auth: `/api/health` y `/api/auth/*`.

## El coach: cualquier IA (o humano) vía API

El coach es una caja negra que solo habla HTTP. El ciclo típico:

1. **Leer el estado del atleta:**

   ```bash
   curl -s http://<host>:3001/api/coach/analisis \
     -H "X-Coach-Key: $COACH_API_KEY"
   ```

   Devuelve en un JSON: mejor e1RM por básico, progresión y RPE en la ventana (`?dias=42` por default), tendencia de peso corporal, volumen por categoría, sesiones realizadas (frecuencia/duración), bienestar reciente (Trac), la library de ejercicios y los mesociclos con su última semana.

2. **Prescribir la semana siguiente:**

   ```bash
   curl -s -X POST http://<host>:3001/api/program/weeks \
     -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
     -d '{
       "semana": 3,
       "mesociclo_id": 1,
       "nombre": "Acumulación",
       "bloque": "Acumulación · Semana 3 de 6",
       "notas": "Subir 2.5 kg en squat si el RPE acompaña.",
       "days": [
         {
           "dia": 1, "tipo": "A", "titulo": "Squat + Bench",
           "warmup": "Movilidad + rampa de aproximación",
           "exercises": [
             {
               "exercise_id": 1, "seccion": "main",
               "reps_text": "3×5", "carga_text": "~80 kg", "rpe_text": "7",
               "sets": [
                 { "n_serie": 1, "target_reps": 5, "target_rpe": 7, "target_peso": 80 },
                 { "n_serie": 2, "target_reps": 5, "target_rpe": 7, "target_peso": 80 },
                 { "n_serie": 3, "target_reps": 5, "target_rpe": 7, "target_peso": 80 }
               ]
             }
           ]
         }
       ]
     }'
   ```

   `exercise_id` sale de la library (`GET /api/exercises`, o del propio análisis); para ejercicios fuera de la library se usa `nombre_libre`. `seccion` es `main | accesorio | core`.

3. **Ajustar sobre la marcha** (opcional): `PATCH /api/program/sets/:id/target` corrige la prescripción de una serie; `PATCH /api/program/exercises/:id` swapea un ejercicio; `POST /api/program/days/:id/exercises` agrega uno.

Para conectar una IA basta con darle la URL base, la key y esta tabla de endpoints (o este README).

## Estructura

```
mi-coach/
├── server/src/
│   ├── db.ts               esquema, migraciones idempotentes, seed
│   ├── index.ts            arranque Express, guard de auth, static SPA
│   ├── auth.ts             login por password + X-Coach-Key
│   ├── routes/             exercises · bodyweight · program · history
│   │                       mesociclos · stats · coach · settings · trac
│   └── test/               tests de API (vitest + supertest)
├── client/src/
│   ├── App.tsx             router + SWRConfig + guard de login
│   ├── api.ts              cliente HTTP tipado
│   ├── swr.ts              swrFetcher, swrKeys, swrConfig
│   ├── pages/              Dashboard · History · Bodyweight · Programs · Trac · Login
│   └── pages/program/      WeekView · DayView · ExerciseView
├── client/public/          favicon, íconos PWA, manifest
└── deploy/                 systemd service + guía de deploy + Tailscale opcional
```

## Modelo de datos

```
mesociclos ─< program_weeks ─< program_days ─< program_exercises ─< program_sets
exercises (library) ──────────────────────────┘
bodyweight · trac · settings
```

- Cada `program_set` tiene columnas **objetivo** (`target_peso/reps/rpe`, las pone el coach) y **reales** (`real_peso/reps/rpe`, las completa el atleta). `hecha` se deriva sola cuando hay peso + reps.
- Al completar la primera serie de un día, `fecha` y `hora_inicio` del día se autosetean — no hay paso manual de "registrar sesión". El historial (`/api/history`) se deriva directo de `program_sets`.
- El e1RM (Epley: `peso × (1 + reps/30)`), tonelaje y RIR se calculan en la vista `v_program_sets_e1rm` — nunca se hardcodean en queries ad-hoc.
- Cascadas `ON DELETE`: borrar una semana borra días → ejercicios → series.

## API

Todas las rutas (salvo las públicas) requieren cookie de sesión o header `X-Coach-Key`.

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/health` | healthcheck (público) |
| POST | `/api/auth/login` · `/logout` · GET `/status` | auth de browser (público) |
| GET/POST | `/api/exercises` | library de ejercicios |
| GET/POST | `/api/bodyweight` | peso corporal + nutrición |
| GET | `/api/stats` | e1RM por básico, tendencia de peso, volumen semanal |
| GET | `/api/history` · `/api/history/:dayId` | días entrenados + series reales con e1RM |
| GET/PUT | `/api/trac` | bienestar diario (upsert por fecha) |
| GET/POST/PATCH/DELETE | `/api/mesociclos` · `/:id` | CRUD de mesociclos |
| GET | `/api/program/weeks?mesociclo_id=` | listar semanas |
| POST | `/api/program/weeks` | crear semana estructurada completa (uso del coach) |
| GET/PATCH/DELETE | `/api/program/weeks/:id` | semana + días / editar / borrar |
| GET/PATCH | `/api/program/days/:id` | día + ejercicios / editar metadata (título, fecha, horarios, notas) |
| POST | `/api/program/days/:id/exercises` | agregar ejercicio (con series) a un día |
| GET/PATCH/DELETE | `/api/program/exercises/:id` | ejercicio + series / swap-editar / borrar |
| PATCH | `/api/program/sets/:id` | completar serie real (autosetea fecha/hora del día) |
| PATCH | `/api/program/sets/:id/target` | corregir la prescripción de una serie |
| GET | `/api/coach/analisis?dias=42` | análisis agregado para el coach |
| GET/PATCH | `/api/settings` | 1RM iniciales y configuración |
