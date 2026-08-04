# Flujo de la semana — leer datos, prescribir, modificar

## Paso 1 — Obtener datos

```bash
curl -s -H "X-Coach-Key: $COACH_API_KEY" \
  "http://192.168.0.110:3001/api/coach/analisis?dias=42" | jq .
```

Usá `?dias=56` si querés más historial. El JSON incluye:
- `progresion_basicos` — serie temporal de e1RM y RPE por básico
- `rpe_basicos` — RPE promedio por sesión (señal de fatiga)
- `mejor_e1rm_basicos` — mejor e1RM histórico por básico
- `peso_corporal` — tendencia con PM 7d
- `volumen_por_musculo` — series por semana y músculo, fraccionado por rol (agonista suma 1.0,
  sinergista 0.5, estabilizador no suma). No es directamente comparable con volumen viejo por
  categoría: una serie de remo ahora aporta 1.0 a dorsal Y 0.5 a bíceps, no "1 serie de espalda".
- `ejercicios` — library completa con `id`, `patron`, `implemento`, `mecanica`,
  `ejercicio_padre_id`, `tipo_variante`, `proposito`, `costo_fatiga`, `sesgo_longitud`,
  `rastrea_e1rm` (usá `id` al armar la semana). **Regla:** preferí el ejercicio canónico
  (`ejercicio_padre_id: null`) por defecto; usá una variante solo cuando su `proposito` responde
  a una necesidad real de la atleta (punto débil, meseta, bloque de fuerza específico) — nunca
  por variedad sola. Detalle completo de cuándo usar cada variante en `Variantes_y_ejercicios.md`
  (material de coach, fuera de esta API). Para ver la grilla muscular completa de un ejercicio
  (todos los músculos, ranking, rol), pedí `GET /api/exercises/:id` o
  `GET /api/exercises?detalle=full`. Qué significa cada campo biomecánico y cuánto peso darle →
  sección `enciclopedia` de esta doc.
- `mesociclos` — lista de mesociclos existentes, cada uno con `id`, `nombre`, `objetivo`,
  `n_semanas` y `max_semana` (la semana más alta **dentro de ese mesociclo**). La numeración de
  semanas se reinicia por mesociclo: para numerar la próxima semana de un mesociclo dado, usá
  `max_semana + 1` de ESE mesociclo, no un contador global. Ver sección **Mesociclos** más abajo.
- `ultima_semana.max_semana` — deprecado, es el máximo global histórico (de cuando no existían
  mesociclos). No lo uses para numerar semanas nuevas.
- `sesiones_realizadas` — días con al menos una serie real completada en la ventana, ordenados
  por fecha. Por día: `semana`, `dia`, `tipo`, `fecha`, `hora_inicio`, `hora_fin`, `duracion_min`,
  `series_hechas`. La `fecha` y `hora_inicio` se autosetean solas en cuanto el atleta carga la
  primera serie de ese día — no hay paso manual de "registrar" (ese concepto ya no existe). **Usalo
  para analizar frecuencia real:** días consecutivos sin descanso, sesiones muy largas, horarios
  irregulares → todas señales de fatiga o adherencia. Ej: 3+ días seguidos o duraciones que se
  alargan progresivamente sugieren bajar volumen o intercalar descanso.
- `trac_reciente` — **últimos 7 días fijos** (hoy + 6 anteriores, orden ascendente), entrene o no el atleta ese día. 7 dimensiones en escala 1-5 (1=peor, 5=mejor) por día:
  - `fatiga_pierna`, `fatiga_empuje`, `fatiga_traccion` — dolor muscular/fatiga por patrón de movimiento
  - `descanso_alimentacion` — calidad de sueño + alimentación combinada
  - `recuperacion` — nivel de frescura general
  - `motivacion` — ganas de entrenar (escala 1-5)
  - `tecnica` — comodidad técnica percibida

  Cualquier campo puede venir `null` si el atleta no cargó ese día o no completó esa dimensión (es normal, especialmente `tecnica`/`motivacion` en días sin entrenar — no lo trates como dato faltante grave, es esperable). **Usalo para cruzar con `sesiones_realizadas` y `rpe_basicos`:** una racha de `recuperacion` o `descanso_alimentacion` bajos (1-2) en los días previos a una sesión con RPE alto es una señal más directa de fatiga acumulada que el RPE solo. Fatiga alta y sostenida en un patrón específico (ej. `fatiga_traccion` bajo varios días) sugiere bajar volumen o intensidad en los ejercicios de ese patrón en la próxima semana, no en todos.

### Adherencia por posición en el día

Endpoint separado (no viene en `/analisis`):

```bash
curl -s -H "X-Coach-Key: $COACH_API_KEY" \
  "http://192.168.0.110:3001/api/coach/adherencia?dias=90" | jq .
```

Responde una pregunta distinta a "qué se completó": **¿el orden importa?** Si los últimos
ejercicios de un día se caen sistemáticamente, ¿es porque van tarde (día demasiado largo) o
porque son ejercicios puntuales que no gustan, sin importar dónde los pongas? Son diagnósticos
opuestos y piden ajustes distintos (acortar el día vs. cambiar el ejercicio).

Tres bloques sobre la misma base:
- `por_posicion` — % de series completadas agrupado por posición absoluta en el orden del día
  (1º, 2º, 3º...). Es la respuesta directa.
- `por_largo_de_dia` — lo mismo, pero cruzado con la cantidad de ejercicios del día
  (`n_ejercicios_dia`). **Usá este para confirmar el diagnóstico de `por_posicion`**: si el % cae
  en la posición 5 pero esa fila solo aparece en días de 6+ ejercicios, el problema es el largo
  del día, no la posición en sí — la conclusión accionable es programar días más cortos.
- `por_ejercicio` — % de series completadas por nombre de ejercicio (con su `posicion_prom`),
  ordenado de peor a mejor. Filtra ejercicios con menos de 3 series programadas (muestra
  insuficiente). Es el diagnóstico alternativo: un ejercicio puntual que se cae siempre,
  independientemente de dónde lo pongas.

Cada fila lleva `dias` (cuántos días distintos la sostienen) y la respuesta trae
`dias_analizados` — **no saques conclusiones de filas apoyadas en 1-2 días**, esperá a tener
más volumen de datos.

**Solo cuenta días efectivamente entrenados** (con `fecha`, no programados a futuro ni
saltados). Por eso `series_programadas` acá no va a coincidir con volúmenes de otras partes del
análisis — es un denominador distinto a propósito (adherencia condicional a "empezaste el día",
no adherencia global).

Ventana default 90 días (no 42): hacen falta varias semanas para que un patrón de posición
sea confiable, no ruido de una sola sesión mala.

---

## Paso 4 — Construir la semana

- 4 días (o los que decidas): organizá el volumen por patrón de movimiento como venías haciendo
  (ej. un día con Squat + Bench como main, otro con Deadlift + Bench), pero eso es solo tu criterio
  de programación — no hace falta codificarlo en el campo `tipo`.
- `tipo` de cada día es **texto libre y opcional**: podés dejarlo sin mandar (`null`), o ponerle
  cualquier etiqueta corta que te sirva como referencia (ej. `"Piernas"`, `"Push"`, `"A"`). Ya no
  está restringido a los valores `"A"`/`"B"` — usalo solo si te aporta claridad, no es obligatorio
  para crear un día.
- `seccion` válidas: `"main"` (básicos), `"accesorio"`, `"core"`
- Usá los `exercise_id` de `analisis.ejercicios`

### Prescripción por serie vs. por ejercicio

Cada ejercicio tiene **dos niveles de prescripción**:

**Nivel ejercicio** — se muestra como resumen en la card del día y como fallback de la columna "Carga sugerida":
- `reps_text` — string libre de resumen, ej. `"6-8"` o `"3×5"`
- `carga_text` — string libre, ej. `"~82.5 kg"` o `"~70% 1RM"`
- `rpe_text` — string libre, ej. `"7-8"`

**Nivel serie** — se muestra en la pestaña **Objetivo** del ejercicio, una fila por serie:
- `target_reps` — número entero, la meta de reps de esa serie concreta
- `target_rpe` — número decimal, el RPE objetivo de esa serie concreta
- `target_peso` — número (kg), la **carga objetivo de esa serie concreta**

**Regla:** `target_reps`, `target_rpe` y `target_peso` tienen prioridad en la vista, cada uno por
separado. Si los seteás, la app los muestra por serie; si los omitís (null), la app cae al
`reps_text`/`rpe_text`/`carga_text` del ejercicio respectivamente, como fallback.

**Importante — no uses `carga_text` para expresar cargas distintas por serie** (ej. no escribas
`"90/85 kg (top set)"`). Ese campo es un solo string a nivel ejercicio: la app lo muestra igual en
las 3 filas, así que cualquier intento de codificar "serie 1 pesa distinto que la 2 y 3" ahí generó
justamente el bug que reportó el atleta (carga sugerida repetida en todas las filas). Para cargas
distintas por serie, usá `target_peso` en cada objeto de `sets[]`. Reservá `carga_text` para un
resumen genérico (ej. `"~82.5 kg"` cuando todas las series pesan igual, o `"~70% 1RM"` si es relativo).

**Cuándo usar reps/RPE/peso distintos por serie:**
- Top set + back-off (serie 1 más pesada, 2-3 más livianas) — **este es el patrón correcto para el
  caso "S1: 90kg, S2-S3: 85kg"**:
  ```json
  { "n_serie": 1, "target_reps": 5, "target_rpe": 8, "target_peso": 90 },
  { "n_serie": 2, "target_reps": 5, "target_rpe": 7, "target_peso": 85 },
  { "n_serie": 3, "target_reps": 5, "target_rpe": 7, "target_peso": 85 }
  ```
- Series de activación o rampa (primera más liviana, última más pesada)
  ```json
  { "n_serie": 1, "target_reps": 6, "target_rpe": 6, "target_peso": 70 },
  { "n_serie": 2, "target_reps": 6, "target_rpe": 7, "target_peso": 77.5 },
  { "n_serie": 3, "target_reps": 6, "target_rpe": 8, "target_peso": 82.5 }
  ```
- Series AMRAP al final (última serie con más reps objetivo)
  ```json
  { "n_serie": 1, "target_reps": 5, "target_rpe": 7, "target_peso": 80 },
  { "n_serie": 2, "target_reps": 5, "target_rpe": 7, "target_peso": 80 },
  { "n_serie": 3, "target_reps": 8, "target_rpe": 9, "target_peso": 75 }
  ```
- Todas iguales (caso estándar, `target_peso` opcional si `carga_text` ya alcanza):
  ```json
  { "n_serie": 1, "target_reps": 5, "target_rpe": 7, "target_peso": 82.5 },
  { "n_serie": 2, "target_reps": 5, "target_rpe": 7, "target_peso": 82.5 },
  { "n_serie": 3, "target_reps": 5, "target_rpe": 7, "target_peso": 82.5 }
  ```

**Convención para `reps_text`:** usá solo el rango de reps sin el número de series delante — la app sabe cuántas series hay. Ej: `"6-8"` en vez de `"4×6-8"`. El número de series lo determinan los objetos `sets[]`.

---

## Mesociclos

Las semanas se agrupan en **mesociclos** (ej. "Acumulación octubre", "Fuerza pre-test") para que
el atleta no tenga que scrollear un listado plano de todas las semanas históricas. Cada semana
pertenece a un mesociclo (`mesociclo_id`) o queda suelta (`null`, "sin mesociclo").

**Importante — la numeración de `semana` se reinicia por mesociclo**, no es un contador global.
La semana 1 de "Fuerza pre-test" y la semana 1 de "Acumulación octubre" coexisten sin problema.

Endpoints (`/api/mesociclos`, mismo header `X-Coach-Key`):

```bash
# Listar mesociclos existentes (con n_semanas y max_semana ya vienen en analisis.mesociclos)
curl -s -H "X-Coach-Key: $COACH_API_KEY" http://192.168.0.110:3001/api/mesociclos | jq .

# Crear un mesociclo nuevo
curl -s -X POST -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  -d '{ "nombre": "Fuerza pre-test", "objetivo": "fuerza máxima", "notas": "Bloque de 6 semanas antes del test de 1RM" }' \
  http://192.168.0.110:3001/api/mesociclos

# Reasignar/renumerar una semana ya creada (útil para acomodar semanas viejas sin mesociclo)
curl -s -X PATCH -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  -d '{ "mesociclo_id": 3, "semana": 1 }' \
  http://192.168.0.110:3001/api/program/weeks/<id_de_la_semana>
```

**Al crear una semana nueva**: preguntale al atleta si sigue dentro del mesociclo actual o si
arranca uno nuevo (ej. terminó un bloque de acumulación y empieza uno de fuerza). Si sigue en el
mismo, mandá el `mesociclo_id` existente y numerá con `max_semana + 1` de ese mesociclo. Si es un
mesociclo nuevo, creálo primero (POST `/api/mesociclos`) y arrancá esa semana en `1`.

**Semanas sin mesociclo**: si el atleta te pide asignar semanas viejas (creadas antes de que
existieran los mesociclos) a un mesociclo, usá `PATCH /api/program/weeks/:id` con el
`mesociclo_id` correspondiente — no hace falta recrear la semana.

---

## Paso 5 — Guardar la semana

```bash
curl -s -X POST \
  -H "X-Coach-Key: $COACH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "semana": <max_semana_del_mesociclo+1>,
    "mesociclo_id": <id_del_mesociclo>,
    "nombre": "Acumulación semana 2",
    "bloque": "Acumulación · Semana 2 de 6",
    "notas": "Nota general del coach (opcional)",
    "days": [
      {
        "dia": 1,
        "tipo": "Piernas",
        "titulo": "Squat + Bench",
        "warmup": "5 min bici + movilidad cadera",
        "notas": "Foco en velocidad de la barra hoy. Si el squat sale liviano, sumá 2.5 kg.",
        "exercises": [
          {
            "exercise_id": 1,
            "seccion": "main",
            "reps_text": "3×5",
            "carga_text": "~82.5 kg",
            "rpe_text": "7",
            "notas": "Pausa 1s abajo. Codos pegados.",
            "sets": [
              { "n_serie": 1, "target_reps": 5, "target_rpe": 7 },
              { "n_serie": 2, "target_reps": 5, "target_rpe": 7 },
              { "n_serie": 3, "target_reps": 5, "target_rpe": 7 }
            ]
          },
          {
            "exercise_id": 3,
            "seccion": "main",
            "reps_text": "3×5",
            "carga_text": "~67.5 kg",
            "rpe_text": "7",
            "sets": [
              { "n_serie": 1, "target_reps": 5, "target_rpe": 7 },
              { "n_serie": 2, "target_reps": 5, "target_rpe": 7 },
              { "n_serie": 3, "target_reps": 5, "target_rpe": 7 }
            ]
          }
        ]
      }
    ]
  }' \
  http://192.168.0.110:3001/api/program/weeks
```

Respuesta exitosa: `{ "id": <week_id> }` con status 201.
Error 409 = semana con ese número ya existe.

**No mandes `fecha_plan`** — se eliminó (nunca se usaba en la práctica). La `fecha` real de cada
día se autosetea sola en el server apenas el atleta carga la primera serie, así que no hace falta
planificarla al crear la semana.

---

## Modificar ejercicios de una semana ya creada

Control completo ejercicio por ejercicio. Primero obtené los IDs del día:

```bash
curl -s -H "X-Coach-Key: $COACH_API_KEY" \
  http://192.168.0.110:3001/api/program/days/<day_id>
# → lista de exercises con su id, seccion, nombre, reps_text, rpe_text
```

### Agregar ejercicio a un día

```bash
curl -s -X POST \
  -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "exercise_id": 22,
    "seccion": "accesorio",
    "reps_text": "3x10-12",
    "carga_text": "~60 kg",
    "rpe_text": "8",
    "sets": [
      { "n_serie": 1, "target_reps": 10, "target_rpe": 8 },
      { "n_serie": 2, "target_reps": 10, "target_rpe": 8 },
      { "n_serie": 3, "target_reps": 10, "target_rpe": 8 }
    ]
  }' \
  http://192.168.0.110:3001/api/program/days/<day_id>/exercises
```

### Eliminar ejercicio de un día

```bash
curl -s -X DELETE \
  -H "X-Coach-Key: $COACH_API_KEY" \
  http://192.168.0.110:3001/api/program/exercises/<exercise_id>
```

### Reordenar ejercicios de un día

```bash
curl -s -X POST \
  -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  -d '{ "ids": [12, 8, 5] }' \
  http://192.168.0.110:3001/api/program/days/<day_id>/exercises/reorder
```

`ids` tiene que traer **todos** los ejercicios del día (no un subconjunto), en el orden nuevo
deseado. Devuelve la lista ya reordenada. Usalo si sospechás (o confirmaste con
`GET /coach/adherencia`) que un día está mal ordenado — mové lo importante al principio.

### Borrar semana completa

```bash
curl -s -X DELETE \
  -H "X-Coach-Key: $COACH_API_KEY" \
  http://192.168.0.110:3001/api/program/weeks/<week_id>
# week_id viene de GET /api/program/weeks
```

---

## Editar un ejercicio ya prescrito (swap / cambio puntual)

Si el atleta pide cambiar un ejercicio de un día ya creado, **no recrees la semana**.
Primero obtené el `id` del ejercicio en ese día:

```bash
curl -s -H "X-Coach-Key: $COACH_API_KEY" \
  http://192.168.0.110:3001/api/program/days/<day_id>
```

Luego aplicá el cambio:

```bash
curl -s -X PATCH \
  -H "X-Coach-Key: $COACH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "exercise_id": 22, "reps_text": "8-10", "rpe_text": "8" }' \
  http://192.168.0.110:3001/api/program/exercises/<exercise_id>
```

Campos editables: `exercise_id` (swap), `nombre_libre`, `seccion`, `reps_text`, `carga_text`, `rpe_text`, `notas`.
Solo pisás los campos que mandás. Las series target/real no se tocan.

---

## Corregir la prescripción de una serie ya creada (target_reps/rpe/peso)

Si necesitás ajustar la meta de **una serie puntual** de un ejercicio ya prescrito (ej. corregir el
`target_peso` de la serie 1 porque te equivocaste, o subir el RPE objetivo de la última serie), no
hace falta borrar y recrear el ejercicio. Primero obtené el `id` de la serie:

```bash
curl -s -H "X-Coach-Key: $COACH_API_KEY" \
  http://192.168.0.110:3001/api/program/exercises/<exercise_id>
# → objeto con sets[], cada uno con su id, n_serie, target_reps, target_rpe, target_peso
```

Luego aplicá el cambio a esa serie:

```bash
curl -s -X PATCH \
  -H "X-Coach-Key: $COACH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "target_peso": 92.5 }' \
  http://192.168.0.110:3001/api/program/sets/<set_id>/target
```

Campos editables: `target_reps`, `target_rpe`, `target_peso`. Solo pisás los que mandás.
**No confundir con `PATCH /program/sets/<set_id>` (sin `/target`)** — ese es el endpoint que usa el
atleta para completar sus valores *reales* (`real_peso`/`real_reps`/`real_rpe`); este otro, con
`/target`, es el que usás vos para corregir lo *prescripto*.

---

## Notas del coach (3 niveles)

Podés dejarle notas al atleta en **tres niveles**, cada uno se muestra en su pantalla:

| Nivel | Campo | Dónde lo ve el atleta | Para qué |
|-------|-------|------------------------|----------|
| **Semana** | `notas` en el body de la semana | Pantalla de la semana, panel "Notas del coach" | Resumen del microciclo, objetivo del bloque, avisos generales |
| **Día** | `notas` en cada objeto `days[]` | Pantalla del día, panel "Notas del día" | Foco de la sesión, autorregulación ("si X sale liviano, sumá Y") |
| **Ejercicio** | `notas` en cada objeto `exercises[]` | Pantalla del ejercicio, panel "Notas del coach" | Técnica, tempo, cue específico, recordatorio de progresión |

Las notas aceptan **markdown mínimo**: `**negrita**` y listas con `-` al inicio de línea. Nada más (no headings, no links).

### Setear notas al crear la semana

Incluí el campo `notas` en el nivel que corresponda dentro del JSON de `POST /program/weeks` (ver ejemplo del Paso 5: día y ejercicio ya lo muestran).

### Editar/agregar notas en una semana ya creada

**Nota de la semana** — `PATCH /api/program/weeks/:id` con el campo `notas` (el mismo endpoint
que se usa para reasignar mesociclo/renumerar, ver sección **Mesociclos** arriba):

```bash
curl -s -X PATCH \
  -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  -d '{ "notas": "Semana de deload: bajamos volumen 40%, mantené la intensidad." }' \
  http://192.168.0.110:3001/api/program/weeks/<week_id>
```

**Nota de un día** — `PATCH /program/days/:id`:

```bash
curl -s -X PATCH \
  -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  -d '{ "notas": "Hoy priorizá descanso entre series pesadas: 3 min mínimo." }' \
  http://192.168.0.110:3001/api/program/days/<day_id>
```

Campos editables del día: `titulo`, `warmup`, `notas`. Solo pisás los que mandás; no toca ejercicios ni series. El `<day_id>` sale de `GET /program/weeks/<week_id>`.

**Nota de un ejercicio** — usá el `PATCH /program/exercises/:id` de la sección anterior con el campo `notas`:

```bash
curl -s -X PATCH \
  -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  -d '{ "notas": "**Tempo 3-1-1.** Si llegás a RPE 9 antes de la última serie, frená." }' \
  http://192.168.0.110:3001/api/program/exercises/<exercise_id>
```

Para **borrar** una nota, mandá `"notas": null`.
