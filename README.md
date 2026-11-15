# Mi Coach — Powerbuilding Coach

App **single-user, local-first** para programar y registrar entrenamientos de powerbuilding.

La idea central: un **coach** prescribe semanas estructuradas (mesociclo → semana → día → ejercicio → serie con objetivos de peso/reps/RPE) a través de la API, y el **atleta** completa los valores reales de cada serie desde la UI web (instalable como PWA en el celular). Los días entrenados, el dashboard y el análisis salen de esos mismos datos — sin doble carga.

El coach puede ser **cualquier agente de IA** (Claude, ChatGPT, Gemini, un script propio…) o un humano con `curl`: solo necesita hacer requests HTTP con una API key. La app no depende de ningún proveedor de IA.

## Features

- **Programa estructurado** con drill-down semana → día → ejercicio, tabs Objetivo/Real por serie, autosave con indicador de sincronización.
- **Días entrenados** derivados automáticamente: un día cuenta como entrenado apenas completás la primera serie (fecha y hora se autosetean). Se consultan en Programas (semana → día → ejercicio).
- **Dashboard** con e1RM estimado por básico (serie proyectada al fallo con el RPE + tabla RTS), tendencia de peso corporal (promedio móvil 7 días) y volumen semanal.
- **Peso**: registro de peso corporal (todavía con los campos viejos de kcal objetivo, proteína, hambre y digestión, que se van cuando la pestaña pase a ser Cuerpo).
- **Nutrición**: carga de la Ingesta diaria (kcal, proteína, carbohidratos y grasas que da MyFitnessPal al cerrar el día, más un comentario opcional), una por fecha. Arriba, el Objetivo nutricional que pautó el coach para esa fecha, con su nota y cuatro barras animadas (cargado / objetivo, marcadas al pasarse).
- **Trac**: tracker diario de bienestar/recuperación (fatiga por patrón, sueño, motivación, técnica) en escala 1–5.
- **Mesociclos**: agrupador de semanas con numeración propia por bloque.
- **Endpoint de análisis para el coach** (`/api/coach/analisis`): progresión de e1RM, RPE, volumen, frecuencia y bienestar en un solo JSON.
- **Auth** simple de un solo usuario: password + cookie, y una API key (`X-Coach-Key`) para el coach.
- **PWA con soporte offline** (solo lectura): instalada en la pantalla de inicio, la rutina queda disponible aunque se caiga el internet o el server. Ver [Modo offline](#modo-offline-pwa) más abajo.

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

Guía completa (systemd, datos persistentes, backups, acceso remoto con Tailscale): [`docs/deploy/README.md`](docs/deploy/README.md).

## Modo offline (PWA)

La app funciona como guardavidas si se corta el internet, el homelab o el server mientras estás
entrenando: la rutina que ya viste queda disponible sin conexión, y un banner rojo avisa
"Trabajando en modo offline" apenas no logra hablar con el server (ya sea porque no hay red o
porque el server está caído con internet funcionando).

**Alcance: solo lectura.** Podés *ver* tu rutina offline. Cargar series sin conexión y que se
sincronicen solas al volver la red **no está soportado** — si intentás completar una serie
offline, va a fallar con un error (no se pierde nada, pero tampoco se guarda hasta que vuelva la
conexión).

**Probado en iOS/iPhone.** Otros sistemas (Android) no están verificados.

### Requisito: instalarla en la pantalla de inicio

Esto **no es opcional** — es lo que hace que el modo offline funcione de verdad en iOS:

1. Abrí la app en **Safari** (no en Chrome ni otro navegador; en iOS todos usan el motor de
   Safari pero solo desde Safari mismo se puede instalar).
2. Tocá el botón de compartir (el cuadrado con la flecha hacia arriba) → **"Agregar a pantalla
   de inicio"**.
3. Abrí la app siempre **desde ese ícono**, no desde una pestaña de Safari.

Si la dejás como una pestaña de Safari en vez de instalarla, iOS puede borrar los datos
guardados a los 7 días de inactividad (política de `Intelligent Tracking Prevention` de
WebKit). Las apps instaladas en la pantalla de inicio están exentas de ese borrado.

### Cómo se ceba el cache

Con conexión, al abrir el Dashboard la app precarga en segundo plano la semana activa completa
(días y ejercicios) para que esté disponible offline sin que tengas que acordarte de abrir cada
pantalla manualmente antes de ir al gimnasio. Igual conviene, la primera vez que instalás la
PWA, navegar un poco por Programas con internet antes de confiar en el modo offline.

### Actualizaciones

Cuando se deploya una versión nueva, la próxima vez que abras la app va a aparecer un cartelito
"Hay una versión nueva" con un botón para actualizar. No se actualiza sola en el momento — así
no te interrumpe si estás a mitad de cargar una serie.

## Auth

- **Atleta (browser):** login con password único. El hash bcrypt vive en la DB (`settings`); el password inicial se toma de `AUTH_PASSWORD` la primera vez. Cookie de sesión firmada, 30 días.
- **Coach (API):** header `X-Coach-Key`. La key se auto-genera en el primer arranque y se imprime una vez en el log del server.
- Público sin auth: `/api/health` y `/api/auth/*`.

## El coach: cualquier IA (o humano) vía API

El coach es una caja negra que solo habla HTTP. El ciclo típico:

0. **Leer la doc operativa** (una sola vez al arrancar, o cuando algo no cuadre):

   ```bash
   curl -s http://<host>:3001/api/coach/docs \
     -H "X-Coach-Key: $COACH_API_KEY"
   ```

   Devuelve la doc completa del flujo del coach: cómo leer datos, prescribir la semana,
   modificar sin recrear, el diccionario de campos de la enciclopedia de ejercicios, y los
   caveats de `/analisis`/`/adherencia`. **Esta es la fuente de verdad — no una copia** — porque
   se sirve desde el propio repo (`server/src/docs/*.md`) y se deploya con el código. La
   respuesta trae dos capas: `generado` (endpoints reales y claves reales de `/analisis`,
   leídos por introspección — imposible que queden desactualizados) y `secciones` (la prosa,
   `?seccion=<id>` para pedir una sola). El resto de este documento (`README.md`) es la
   referencia para quien desarrolla la app; el coach usa `/coach/docs`, no este archivo.

1. **Leer el estado del atleta:**

   ```bash
   curl -s http://<host>:3001/api/coach/analisis \
     -H "X-Coach-Key: $COACH_API_KEY"
   ```

   Devuelve en un JSON: mejor e1RM por básico, progresión por carga (`progresion_basicos`: una fila por combinación `nombre`/`fecha`/`peso_kg`/`reps`/RPE, con `e1rm`, `e1rm_confianza` y `n_series` — top set y back-off del mismo día, o la misma carga a RPE distinto, quedan como filas separadas, cada una con su propio e1RM) y RPE promedio en la ventana (`?dias=42` por default), tendencia de peso corporal, volumen por músculo y semana de programa (fraccionado por rol; `series_programadas` vs. `series_completadas`, con `semana_programa`/`mesociclo_id`/`week_id` — agrupa por semana de programa, no por semana ISO, que mezcla semanas de programa distintas), sesiones realizadas (frecuencia/duración, con `notas_coach` y `notas_atleta` por separado), el Trac de la ventana (`trac_reciente`: una fila por fecha, hoy y los N días anteriores, con huecos en null; incluye `sueno`), la Ingesta diaria de la ventana (`ingesta_diaria`: solo fechas cargadas, una fecha sin carga no aparece como 0), los Pasos diarios de la ventana (`pasos_diarios`: solo fechas que llegaron del atajo de iOS), los mesociclos con su última semana, y `dias_programados` (series programadas vs. completadas por día, incluyendo días nunca entrenados — a diferencia del resto de los bloques, que solo ven lo ya entrenado). **Límite conocido de `dias_programados`:** un día no entrenado y un día entrenado pero nunca cargado en la app se ven idénticos (`series_completadas: 0`); distinguirlos requeriría una columna nueva y está fuera de alcance.

   La library completa de ejercicios (`ejercicios`) es **opt-in**: no viaja por defecto (pesa ~55% del payload, 148 ejercicios cuando una semana usa 6-7) — pedila con `?incluir=ejercicios`, o consultá `GET /api/exercises` directamente. También es opt-in `accesorios` (`?incluir=accesorios`): las series hechas `[reps, peso, rpe]` de cada ejercicio sin e1RM, sesión por sesión, para seguir la doble progresión. `generado.analisis_bloques` de `GET /api/coach/docs` marca `opt_in: true` en los bloques que hay que pedir así.

   **Adherencia por posición en el día** (`GET /api/coach/adherencia?dias=90`, endpoint aparte): responde si los ejercicios que van más tarde en el orden del día se completan menos, sin importar cuál sea. Devuelve tres agregaciones sobre la misma base — `por_posicion` (pct de series completadas por posición 1, 2, 3...), `por_largo_de_dia` (lo mismo cruzado con la cantidad de ejercicios del día, para separar "es la posición" de "son los días largos los que fallan") y `por_ejercicio` (pct por nombre de ejercicio, con su posición promedio, para el efecto opuesto: un ejercicio puntual que se cae siempre). Cada fila trae `dias` (cuántos días distintos la sostienen) para no sacar conclusiones de una sola muestra. Solo entran días efectivamente entrenados (`fecha` no nula) — un día programado y nunca empezado no es una señal sobre el orden de ejercicios, es otra pregunta (adherencia global).

   **Progresión de un ejercicio puntual** (`GET /api/coach/progresion/:exercise_id?dias=180`, endpoint aparte): la historia completa de UN ejercicio de la library — sus sesiones en orden cronológico ascendente, cada una con sus series reales (con su `e1rm_confianza`) y su `mejor_e1rm` (solo confianza alta; `null` si no hubo), `mejor_tonelaje` y `tonelaje_total`. A diferencia de `progresion_basicos` (bloque de `/analisis`), **funciona con cualquier ejercicio, no solo con los 3 movimientos de competencia** — que es justo donde la progresión se estanca sin que nadie lo note: un accesorio cinco semanas clavado en el mismo peso. Devuelve `404` si el `exercise_id` no está en la library y `400` si no es numérico; un ejercicio que existe pero no se entrenó en la ventana devuelve `200` con `sesiones: []` y la metadata del ejercicio igual. Ignora series no completadas y series sin peso o sin reps, y fusiona en una sola sesión el mismo ejercicio prescrito dos veces en un mismo día (`day_ids` muestra de qué días vino). Ventana default 180 días (~26 semanas), mucho más larga que la de `/analisis`: seis semanas de un accesorio son unas pocas sesiones, no una progresión legible. **Ojo:** `mejor_e1rm` y `mejor_tonelaje` son máximos independientes y pueden salir de series distintas — no son "los valores de la mejor serie".

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
           "notas": "Bajar volumen de accesorios de empuje esta semana.",
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

   La `notas` de cada día en `days[]` es el canal del coach para ese día específico — distinta
   de la `notas` de la semana (arriba) y de `notas_atleta` (que sólo escribe el atleta desde la
   UI y nunca se puede sembrar desde acá).

3. **Ajustar sobre la marcha** (opcional): `PATCH /api/program/sets/:id/target` corrige la prescripción de una serie; `PATCH /api/program/exercises/:id` swapea un ejercicio; `POST /api/program/days/:id/exercises` agrega uno.

Para conectar una IA basta con darle la URL base, la key y esta tabla de endpoints (o este README).

## Estructura

```
mi-coach/
├── server/src/
│   ├── db.ts               esquema, migraciones idempotentes, seed
│   ├── index.ts            arranque Express, guard de auth, static SPA
│   ├── auth.ts             login por password + X-Coach-Key + X-Device-Key
│   ├── routes/             exercises · bodyweight · program · mesociclos
│   │                       stats · coach · trac · ingesta · pasos
│   └── test/               tests de API (vitest + supertest)
├── client/src/
│   ├── App.tsx             router + SWRConfig + guard de login
│   ├── api.ts              cliente HTTP tipado
│   ├── swr.ts              swrFetcher, swrKeys, swrConfig
│   ├── pages/              Dashboard · Nutricion · Bodyweight · Programs · Trac · Login
│   └── pages/program/      WeekView · DayView · ExerciseView
├── client/public/          favicon, íconos PWA, manifest
└── docs/deploy/            systemd service + guía de deploy + Tailscale opcional + atajo de pasos
```

## Modelo de datos

```
mesociclos ─< program_weeks ─< program_days ─< program_exercises ─< program_sets
exercises (library) ──────────────────────────┘
bodyweight · trac · ingesta_diaria · pasos_diarios · settings
```

- Cada `program_set` tiene columnas **objetivo** (`target_peso/reps/rpe`, las pone el coach) y **reales** (`real_peso/reps/rpe`, las completa el atleta). `hecha` se deriva sola cuando hay peso + reps.
- Al completar la primera serie de un día, `fecha` y `hora_inicio` del día se autosetean — no hay paso manual de "registrar sesión". Los días entrenados se derivan directo de `program_sets`.
- El e1RM, tonelaje y RIR se calculan en la vista `v_program_sets_e1rm` — nunca se hardcodean en queries ad-hoc. El e1RM proyecta cada serie al fallo con el RPE (reps + (10 − RPE), sin redondear) y la convierte con la tabla RTS de Tuchscherer (interpolando entre filas): e1RM = peso ÷ %1RM. No hay e1RM sin RPE, con RPE < 5 o si proyecta más de 10 reps. `e1rm_confianza` es `alta` con RPE ≥ 7 y `baja` con RPE 5–6,5; las de confianza baja se muestran marcadas pero no cuentan para el mejor e1RM ni la tendencia. **Los e1RM históricos cambiaron** con este método (antes Epley sobre peso × reps, issue #14): la vista recalcula todo el historial.
- Cascadas `ON DELETE`: borrar una semana borra días → ejercicios → series.

## API

Todas las rutas (salvo las públicas) requieren cookie de sesión o header `X-Coach-Key`.

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/health` | healthcheck (público) |
| POST | `/api/auth/login` · `/logout` · GET `/status` | auth de browser (público) |
| GET/POST | `/api/exercises` | library de ejercicios; `?detalle=full` trae biomecánica completa; `?musculo_id=X&rol=` filtra por músculo |
| GET/PATCH | `/api/exercises/:id` | ejercicio con biomecánica, grilla muscular y variantes / editar (merge parcial, sin DELETE) |
| GET | `/api/musculos` · `/api/patrones` | catálogo canónico de la enciclopedia (solo lectura) |
| GET/POST | `/api/bodyweight` | peso corporal + nutrición |
| GET | `/api/stats` | e1RM por básico, tendencia de peso, volumen semanal |
| GET/PUT | `/api/trac` | bienestar diario (upsert por fecha) |
| GET/PUT | `/api/ingesta?fecha=` · `?desde=&hasta=` | Ingesta diaria: una fecha (o `null`), un rango (solo fechas cargadas), upsert por fecha con kcal/proteína/carbos/grasas obligatorios |
| GET | `/api/nutricion/dia?fecha=` | vista del día de Nutrición: Ingesta diaria + Objetivo nutricional vigente con su nota (ADR 0003) + Pasos diarios (o `null`) |
| PUT | `/api/pasos` | Pasos diarios `{fecha, pasos}`, upsert por fecha. Acepta sesión, `X-Coach-Key` o `X-Device-Key` (la clave del atajo de iOS, que solo vale acá). Ver `docs/deploy/ATAJO-PASOS.md` |
| GET/POST/PATCH/DELETE | `/api/mesociclos` · `/:id` | CRUD de mesociclos |
| GET | `/api/program/weeks?mesociclo_id=` | listar semanas |
| POST | `/api/program/weeks` | crear semana estructurada completa (uso del coach), con Objetivo nutricional opcional (`objetivo_kcal/_proteina_g/_carbohidratos_g/_grasas_g`, los cuatro juntos, + `nota_nutricional`, `objetivos_pautados_en`) |
| GET/PATCH/DELETE | `/api/program/weeks/:id` | semana + días / editar (también el Objetivo nutricional; corregirlo no mueve `objetivos_pautados_en`) / borrar |
| GET/PATCH | `/api/program/days/:id` | día + ejercicios / editar metadata (título, fecha, horarios, notas del coach, notas del atleta) |
| POST | `/api/program/days/:id/exercises` | agregar ejercicio (con series) a un día |
| GET/PATCH/DELETE | `/api/program/exercises/:id` | ejercicio + series / swap-editar / borrar |
| PATCH | `/api/program/sets/:id` | completar serie real (autosetea fecha/hora del día) |
| PATCH | `/api/program/sets/:id/target` | corregir la prescripción de una serie |
| GET | `/api/coach/analisis?dias=42` | análisis agregado para el coach |
| GET | `/api/coach/adherencia?dias=90` | adherencia por posición en el día |
| GET | `/api/coach/progresion/:exercise_id?dias=180` | historia de un ejercicio: sesiones, series y mejor e1RM/tonelaje |
| GET | `/api/coach/docs?seccion=` | doc operativa del coach (fuente de verdad, se deploya con el código) |
