# ADR 0001 — Enciclopedia técnica de ejercicios y biomecánica

**Estado:** propuesto
**Fecha:** 2026-07-31

## Contexto

La tabla `exercises` tiene 4 columnas: `id, nombre, categoria, es_basico`. Es la única
fuente de vocabulario del coach (0 prescripciones usan `nombre_libre`), así que su calidad
es el techo de lo que el coach puede prescribir y razonar.

Diagnóstico sobre los datos reales (73 filas):

- **58 de 73 ejercicios nunca se usaron.** Las 13 variantes de básicos (ids 62–74:
  pausa 3s, spoto, board press, déficit, rack pull…) tienen **cero** prescripciones.
  No es que el coach las use mal: no tiene forma de relacionarlas con su ejercicio padre
  ni de saber para qué sirve cada una.
- **`categoria` mezcla tres ejes ortogonales**: implemento (`Smith/Multipower`), región
  (`Piernas`), rol en el programa (`Básico`) y músculos (`Espalda/Deltoides post.`).
  Por eso `GET /coach/analisis → volumen_por_categoria` (coach.ts:65) reporta cosas como
  "Smith/Multipower: 16 series", que no dice nada sobre qué músculos se entrenaron.
- **`es_basico` no significa "compuesto"**: se usa solo para filtrar los 3 movimientos de
  competencia sobre los que se sigue e1RM (stats.ts:28,44 · coach.ts:20,35,48) y está
  acoplado al mapa `SETTING_KEY` → `rm_squat/rm_bench/rm_deadlift`. El rol "principal del
  día" ya lo cubre `program_exercises.seccion='main'`.
- **Duplicados por falta de modelo de identidad**: `9 Incline DB Bench Press` ≈
  `29 Incline DB Press 30°`; `13 Face Pulls` ≈ `55 Face pull en polea alta`;
  `4 Incline Bench (Smith)` ≈ `40 Press inclinado 30° en Smith`. Fragmentan el historial
  y el e1RM del mismo ejercicio real.
- **Cero biomecánica**: sin acciones articulares, longitud muscular, perfil de resistencia,
  costo de fatiga ni exigencia articular. Esto último es concreto: el atleta arrastra una
  molestia de rodilla (aparece en los warmups) y hoy el coach no puede filtrar por eso.

Momento oportuno: solo 15 ejercicios usados y ~7 series registradas en total, así que
reestructurar ahora es casi gratis. En seis meses de historial sería doloroso.

## Decisión

Cuatro tablas, conservando `exercises.id` (referenciado por `program_exercises.exercise_id`).

```
patrones ──< ejercicios >── ejercicios        (self-FK: variante → padre)
                 │
                 └──< ejercicio_musculos >── musculos
```

### `musculos` (~35 filas)

Catálogo canónico. `id, nombre, nombre_en, grupo, region, biarticular`.

`region` permite hipertrofia regional (p. ej. `porción larga` del tríceps, `vasto lateral`),
que es donde la selección de ejercicio realmente decide. `biarticular` marca los músculos
cuya longitud depende de dos articulaciones (isquios, recto femoral, cabeza larga de
tríceps y bíceps) — necesario para razonar sobre `sesgo_longitud`.

### `patrones` (~12 filas)

`sentadilla, bisagra de cadera, empuje horizontal, empuje vertical, tracción horizontal,
tracción vertical, extensión de rodilla, flexión de rodilla, extensión de cadera,
abducción de hombro, flexión de codo, extensión de codo, anti-extensión, anti-rotación`.

Habilita dos consultas que hoy son imposibles: "dame otro empuje horizontal" (sustitución)
y el balance empuje/tracción semanal.

### `ejercicios` (rework de `exercises`)

| Grupo | Campos |
|---|---|
| Identidad | `patron_id`, `implemento`, `angulo_grados`, `agarre`, `postura`, `unilateral` |
| Linaje | `ejercicio_padre_id`, `tipo_variante`, `transferencia`, `proposito` |
| Biomecánica | `mecanica`, `fuerza`, `sesgo_longitud`, `perfil_resistencia`, `cadena`, `carga_axial` |
| Costo (heurístico) | `costo_fatiga`, `demanda_estabilidad`, `demanda_tecnica` (1–5) |
| Tracking | `rastrea_e1rm` (reemplaza `es_basico`), `es_competitivo` |
| Texto | `notas_tecnicas`, `contraindicaciones`, `cues` |

### `ejercicio_musculos`

`ejercicio_id, musculo_id, rol, orden, fraccion_volumen`.

Responde "todos los músculos de mayor a menor grado". **Cada variante lleva su propia
grilla**, no la hereda: así el ángulo de 30° vs 60° puede desplazar el énfasis.

- `rol`: `agonista | sinergista | estabilizador`
- `orden`: 1 = mayor contribución (ordinal, no porcentual — ver "Qué NO guardamos")
- `fraccion_volumen`: `1.0 | 0.5 | 0.25 | 0` — para contar series fraccionadas
  (un remo cuenta 1 para dorsal ancho y 0.5 para bíceps).

## Vocabularios controlados

| Campo | Valores |
|---|---|
| `implemento` | `barra · mancuerna · polea · maquina · smith · peso_corporal · banda · kettlebell` |
| `tipo_variante` | `angulo · agarre · postura · tempo · pausa · rom · resistencia_acomodada · implemento · unilateral` |
| `mecanica` | `compuesto · aislamiento` |
| `fuerza` | `empuje · traccion · estatico` |
| `sesgo_longitud` | `alargado · medio · acortado` |
| `perfil_resistencia` | `ascendente · descendente · campana · constante` |
| `cadena` | `abierta · cerrada` |
| `rol` | `agonista · sinergista · estabilizador` |

## Ejemplos

### Ángulo como eje de variación (caso Incline DB Press)

```
Press inclinado con mancuernas          ← canónico
├── 15–20°  pectoral esternal aún dominante
├── 30°     pico de pectoral clavicular          ← sweet spot pecho superior
├── 45°     deltoides anterior escala a co-agonista
└── 60°     deltoides anterior pasa a agonista principal
```

Cada fila tiene su propio `ejercicio_musculos`: a 30° el orden es
`pectoral clavicular (1) → tríceps (2) → deltoides anterior (3)`; a 60° se invierte a
`deltoides anterior (1) → pectoral clavicular (2)`. Eso es lo que el coach lee para elegir.

### Variantes de fuerza (caso bench)

```
Flat Bench Press (id 3)                 rastrea_e1rm=1, es_competitivo=1
├── Pausa 3s          transf. 0.95   propósito: fuerza en posición baja
├── Spoto press       transf. 0.93   propósito: tensión constante, sin rebote
├── Board press       transf. 0.90   propósito: bloqueo (tercio superior)
├── Tempo excéntrico  transf. 0.92   propósito: control excéntrico / hipertrofia
└── Cadenas o bandas  transf. 0.88   propósito: aceleración, fuerza-velocidad
```

Permite razonar: *falla abajo → pausa/spoto; falla en el lockout → board press/rack pull;
fatiga alta → bajar `costo_fatiga` sin cambiar de patrón*.

### Volumen fraccionado por músculo

Vista `v_volumen_por_musculo` que reemplaza a `volumen_por_categoria`: series semanales
por músculo, ponderadas por `fraccion_volumen`. Es la métrica con mejor respaldo
científico (ver Referencias) y hoy es incomputable.

## Qué NO guardamos y por qué

| Descartado | Motivo |
|---|---|
| `% activación EMG` | La amplitud de EMG de superficie no permite inferir hipertrofia ni fuerza entre ejercicios (Vigotsky et al.). Sería falsa precisión. Usamos rol funcional + orden ordinal. |
| `nivel: principiante/avanzado` | Arbitrario; la app es de un solo usuario cuyo nivel se conoce. |
| MET / calorías | Irrelevante para powerbuilding. |
| Instrucciones largas e imágenes | Inflan el payload de `/coach/analisis`. Si se quieren, van en tabla aparte. |

**Advertencia de honestidad científica** que debe quedar en la doc del coach: la evidencia
sobre `sesgo_longitud` es prometedora pero **mixta** — es criterio de desempate, no ley.
Los campos `costo_fatiga`, `demanda_estabilidad` y `demanda_tecnica` son **heurísticas
declaradas, no mediciones**.

## Migración

Aditiva, en fases, sin romper nada:

1. Tablas nuevas (`musculos`, `patrones`, `ejercicio_musculos`) + columnas nuevas en
   `exercises`. Migración idempotente en `db.ts`, como el resto.
2. Seed de catálogos y backfill de los 73 existentes (ids intactos); fusión de duplicados
   reapuntando `program_exercises.exercise_id` (impacto real: casi nulo).
3. Ampliación a ~55–65 canónicos + ~70–85 variantes (≈120–150 filas totales).
4. Vista `v_volumen_por_musculo` + exposición en `/api/coach/analisis`; retirar
   `volumen_por_categoria`.
5. Retirar `categoria` y `es_basico` (este último → `rastrea_e1rm`), actualizando
   `stats.ts`, `coach.ts`, `exercises.ts`, tipos espejados y tests.

Alcance acordado: **solo backend/API**, sin cambios de frontend.

## Referencias

Búsqueda bibliográfica vía PubMed:

- Schoenfeld BJ, Ogborn D, Krieger JW. *Dose-response relationship between weekly
  resistance training volume and increases in muscle mass.* J Sports Sci.
  [DOI](https://doi.org/10.1080/02640414.2016.1210197) — respaldo de volumen por músculo.
- Baz-Valle E, et al. *Total number of sets as a training volume quantification method for
  muscle hypertrophy.* JSCR. [DOI](https://doi.org/10.1519/JSC.0000000000002776)
- Vigotsky AD, et al. *Interpreting signal amplitudes in surface electromyography studies.*
  Front Physiol. [DOI](https://doi.org/10.3389/fphys.2017.00985) — por qué NO guardamos EMG.
- Maeo S, et al. *Hamstrings hypertrophy is specific to the training exercise.* MSSE.
  [DOI](https://doi.org/10.1249/MSS.0000000000003490) — especificidad por ejercicio.
- Wolf M, et al. *Does longer-muscle length resistance training cause greater longitudinal
  growth in humans?* Sports Med Health Sci.
  [DOI](https://doi.org/10.1016/j.smhs.2025.03.001)
- Varovic D, et al. *Does muscle length influence regional hypertrophy?* Int J Sports Med.
  [DOI](https://doi.org/10.1055/a-2615-4935) — contra-evidencia; obliga a matizar.
- Appleby BB, et al. *Specificity and transfer of lower-body strength.* JSCR.
  [DOI](https://doi.org/10.1519/JSC.0000000000002923) — base del coeficiente de transferencia.
