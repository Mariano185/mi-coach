# Powerbuilding Coach

App local para registrar entrenamientos de powerbuilding y dejar a **Claude Code** configurado como coach que analiza la semana y arma la próxima rutina. Todo corre en `localhost`, un solo usuario, sin nube, sin auth, sin API de Claude (el coach sos vos invocando Claude Code desde la terminal en esta carpeta).

## Stack

- **Frontend:** React + TypeScript + Vite (`client/`, puerto 5173)
- **Backend:** Node + TypeScript + Express + `better-sqlite3` (`server/`, puerto 3001)
- **Base de datos:** SQLite, un solo archivo `coach.db` en esta carpeta (se crea y seedea solo al arrancar)

## Requisitos

- Node.js 20+ (probado con Node 24). `npm` 10+.
- En Windows, `better-sqlite3` usa binarios precompilados; normalmente **no** necesitás herramientas de compilación. Si la instalación fallara compilando, instalá los build tools de C++ (Visual Studio Build Tools con "Desktop development with C++") y reintentá `npm install`.

## Instalar

Desde esta carpeta (`mi-coach/`):

```bash
npm install
```

Instala las dependencias de la raíz y de ambos workspaces (`server/` y `client/`).

## Correr

```bash
npm run dev
```

Levanta backend y frontend juntos (vía `concurrently`):

- API: http://localhost:3001
- App: **http://localhost:5173** ← abrí esto en el navegador

La primera vez se crea `coach.db` con el esquema, la Exercise Library y unos datos de ejemplo (≈2 semanas) para que el dashboard no esté vacío. Para empezar de cero, borrá `coach.db` y reiniciá.

Otros scripts: `npm run build` (compila server + client), `npm run dev:server` / `npm run dev:client` (por separado).

## Cómo lo uso

1. **Durante la semana:** en la pestaña *Registrar sesión* cargo cada entrenamiento (tipo A/B, ejercicios, series con peso/reps/RPE/RIR, y energía/sueño/motivación). En *Peso / Nutrición* cargo el peso corporal y la comida.
2. **Vistas:** *Historial* (sesiones expandibles + filtro por ejercicio), *Dashboard* (mejor e1RM por básico vs 1RM inicial, tendencia de peso con promedio móvil 7d, volumen semanal básicos vs accesorios), *Programas* (rutinas generadas).
3. **A fin de semana:** abro **Claude Code en esta carpeta** y pido:
   > *"analizá la semana y armá la próxima"*

   El coach lee `coach.db`, analiza progresión/fatiga/volumen siguiendo `CLAUDE.md` y los principios de evidencia, escribe la rutina en `programas/semana-XX.md` y la guarda en la tabla `programs`.

## Estructura

```
mi-coach/
├── CLAUDE.md          # rol del coach + queries SQL útiles (leélo)
├── coach.db           # SQLite (autogenerado; ignorado por git)
├── server/            # API Express + esquema/seed en src/db.ts
├── client/            # UI React (5 vistas)
└── programas/         # rutinas generadas (semana-XX.md)
```

## Modelo de datos

`exercises`, `sessions`, `sets`, `bodyweight`, `programs`, `settings` (1RM de partida). El e1RM (Epley `peso*(1+reps/30)`) **no se guarda**: se calcula en la vista `v_sets_e1rm`. Detalles y queries en [`CLAUDE.md`](./CLAUDE.md).

## API (REST)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/exercises` | catálogo de ejercicios |
| GET / POST | `/api/sessions` | listar / crear sesión (con sus sets, en transacción) |
| GET | `/api/sessions/:id` | sesión con sets + e1RM |
| POST | `/api/sets` | agregar un set suelto |
| GET / POST | `/api/bodyweight` | listar / crear registro de peso |
| GET | `/api/stats` | e1RM por básico, tendencia de peso, volumen semanal |
| GET / POST | `/api/programs` | listar / guardar rutina |
| GET | `/api/programs/:id` | leer una rutina |
```
