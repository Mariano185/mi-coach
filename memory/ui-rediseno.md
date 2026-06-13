---
name: ui-rediseno
description: Tema visual "Forge" del frontend y arquitectura de la UI de Programas drill-down
metadata:
  type: project
---

El frontend (client/) se rediseñó (2026-06-13) con un tema propio llamado **"Forge"**: negro carbón + acento **lima eléctrico** (`--lime: #c8f54a`), tipografía display condensada **Oswald** para títulos/números y **Barlow** para texto (cargadas desde Google Fonts en `client/index.html`). Grano sutil de fondo, micro-animaciones `rise` con stagger, `prefers-reduced-motion` respetado. Todas las variables en `client/src/styles.css`.

**Sección Programas — arquitectura drill-down** (reemplaza el viejo render del .md plano):
- `client/src/pages/Programs.tsx` = orquestador, navegación con estado discriminado `{level: week|day|exercise}` (no boolean props).
- `pages/program/WeekView.tsx` — selector de semana + grilla de cards de día.
- `pages/program/DayView.tsx` — cards de ejercicio agrupadas por sección (main/accesorio/core) + botón "Registrar día" que llama `completeProgramDay`.
- `pages/program/ExerciseView.tsx` — tabs Objetivo/Real, grid PESO·REPS·RPE editable (guardado optimista onBlur vía `updateProgramSet`), Estadísticas en vivo (e1RM mejor + tonelaje), derivadas en render con useMemo.
- Componentes: `components/icons.tsx` (SVG inline), `components/CoachNotes.tsx` (markdown mínimo para notas del coach).

**Endpoints** (server/src/routes/program.ts, montado en `/api/program`): weeks, weeks/:id, days/:id, days/:id/complete, exercises/:id, sets/:id (PATCH), POST weeks. Ver [[programas-estructurados]].

**Skills aplicadas:** frontend-design, react-best-practices, composition-patterns, accessibility (todas en `mi-coach/.agents/skills/`).

**Caveat operativo:** la conexión SQLite del server (WAL) tiene lock; para inspeccionar/editar `coach.db` con `node -e` hay que parar el server primero Y usar **ruta absoluta** a `mi-coach/coach.db` (si el cwd queda en client/ o server/, node crea un coach.db vacío espurio). Mejor consultar vía la API REST con el server corriendo.
