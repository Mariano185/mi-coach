# Powerbuilding Coach

App single-user, local-first, para registrar y programar entrenamientos de powerbuilding.
El coach (Claude Code) prescribe semanas estructuradas; el atleta completa pesos/reps/RPE en la UI.
Todo corre en la red local sobre un CT Proxmox — sin nube, sin servicios externos.

## Stack

- **Frontend:** React + TypeScript + Vite (`client/`, dev en puerto 5173). SWR para cache y revalidación.
- **Backend:** Node + TypeScript + Express + `better-sqlite3` (`server/`, puerto 3001).
- **Base de datos:** SQLite (`coach.db`). WAL mode + foreign keys ON.
- **Monorepo:** npm workspaces (`server`, `client`).

## Requisitos

- Node.js 20+ (probado con Node 24). `npm` 10+.
- En Windows, `better-sqlite3` usa binarios precompilados — normalmente no necesitás herramientas de compilación. Si fallara, instalá Visual Studio Build Tools con "Desktop development with C++".

## Instalar y correr (dev)

```bash
npm install       # instala raíz + workspaces
npm run dev       # server :3001 + client :5173
```

Otros scripts: `npm run build` (compila server + client), `npm run serve` (modo prod en :3001).

## Deploy (producción)

Corre en **CT 110** de Proxmox en `192.168.0.110`. Un solo proceso Express sirve la API en `/api/*` y el `client/dist` como SPA.

```bash
# Actualizar a una versión nueva desde el host Proxmox:
ssh root@192.168.0.100 "pct exec 110 -- bash -c \
  'cd /opt/mi-coach && git pull && npm install && npm run build && systemctl restart mi-coach'"
```

Ver guía completa en `deploy/README.md`.

## Auth

Login con password único. Hash bcrypt en `settings["auth_password_hash"]`. El coach accede vía header `X-Coach-Key` (auto-generado al arrancar, recuperable con `journalctl -u mi-coach | grep coach_api_key`).

## Cómo funciona

1. **Atleta registra la semana:** navega a *Programas → semana → día → ejercicio* y completa los valores reales de cada serie (peso, reps, RPE). Al terminar un día presiona "Registrar día" para volcar al historial.
2. **El coach analiza y prescribe:** al final de la semana, el coach (Claude Code corriendo en `../`) llama `GET /api/coach/analisis` para leer progresión, RPE, volumen y bienestar, y luego `POST /api/program/weeks` para crear la semana estructurada.
3. **Drill-down completo:** Programas → semana → día (con fecha/hora de sesión, notas del coach, progreso de series) → ejercicio (tabs Objetivo/Real por serie).

## Estructura

```
mi-coach/
├── server/src/
│   ├── db.ts               esquema, migraciones, seed
│   ├── index.ts            arranque Express, auth bootstrap
│   ├── auth.ts             middleware requireAuth, coach key
│   └── routes/             exercises · sessions · sets · bodyweight
│                           stats · programs · program · coach
├── client/src/
│   ├── App.tsx             router + SWRConfig
│   ├── api.ts              cliente HTTP tipado
│   ├── swr.ts              swrFetcher, swrKeys, swrConfig
│   ├── pages/              Dashboard · History · Bodyweight · Programs
│   └── pages/program/      WeekView · DayView · ExerciseView
├── client/public/
│   ├── favicon.svg         ícono para pestaña del browser
│   ├── icon-{180,192,512}.png  íconos PWA / iOS
│   └── manifest.json       PWA manifest
└── deploy/                 systemd service + guía Proxmox
```

## Modelo de datos

**Registro real:** `exercises` · `sessions` · `sets` · `bodyweight` · `settings`

**Programa estructurado:** `program_weeks` → `program_days` → `program_exercises` → `program_sets`

El e1RM (Epley: `peso*(1+reps/30)`) se calcula en las vistas `v_sets_e1rm` y `v_program_sets_e1rm` — nunca se hardcodea.

Completar un día (`POST /api/program/days/:id/complete`) crea una `session` + `sets` reales y linkea `program_days.session_id`.

## API principal

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/exercises` | biblioteca de ejercicios |
| GET/POST | `/api/sessions` | listar / crear sesión |
| GET | `/api/sessions/:id` | sesión con sets + e1RM |
| GET/POST | `/api/bodyweight` | peso corporal |
| GET | `/api/stats` | e1RM básicos, tendencia de peso, volumen semanal |
| GET | `/api/program/weeks` | lista de semanas |
| GET | `/api/program/weeks/:id` | semana + días |
| GET | `/api/program/days/:id` | día + ejercicios |
| PATCH | `/api/program/days/:id` | editar título, fecha, horarios, notas |
| GET | `/api/program/exercises/:id` | ejercicio + series |
| PATCH | `/api/program/exercises/:id` | swap/editar ejercicio prescrito |
| PATCH | `/api/program/sets/:id` | completar serie real |
| POST | `/api/program/days/:id/complete` | volcar día al historial |
| POST | `/api/program/weeks` | crear semana estructurada (uso del coach) |
| GET | `/api/coach/analisis` | análisis completo para el coach |
| GET/PATCH | `/api/settings` | leer/actualizar 1RM y configuración |
