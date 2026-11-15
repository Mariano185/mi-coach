# Caveats de `/coach/analisis`, `/coach/adherencia` y `/coach/progresion`

Referencia rápida de los denominadores y ventanas de cada bloque — para no comparar números que
no son comparables entre sí. El detalle de cómo usar cada bloque para armar la semana está en
la sección `flujo-semana`.

## Ventanas por defecto

| Endpoint | Ventana default | Por qué |
|---|---|---|
| `GET /coach/analisis` | `?dias=42` (~6 semanas) | Suficiente para ver progresión de bloque sin arrastrar bloques viejos. |
| `GET /coach/adherencia` | `?dias=90` | Un patrón de posición necesita varias semanas para no ser ruido de una sesión mala. |
| `dias_programados` (en `/analisis`) | Mismo `?dias=` que `/analisis` | Ventana propia, contada por `fecha_creada` de la semana, no por `pd.fecha` — ver abajo. |
| `volumen_por_musculo` (en `/analisis`) | Mismo `?dias=` que `/analisis` | Ventana por `fecha_creada` de la semana de programa (no por semana ISO) — mismo criterio que `dias_programados`, ver abajo. |
| `ingesta_diaria` (en `/analisis`) | Mismo `?dias=` que `/analisis` | Por `fecha` calendario de la carga (no por semana de programa); solo fechas cargadas. |
| `GET /coach/progresion/:exercise_id` | `?dias=180` (~26 semanas) | Un accesorio se entrena ~1x/semana: 42 días son ~6 sesiones, muy poco para leer una tendencia. |

## Denominadores que NO son comparables entre sí

- **`volumen_por_musculo`** (en `/analisis`) trae `series_programadas` (todas las series
  prescritas, hechas o no) y `series_completadas` (solo `hecha = 1`) por músculo y semana de
  programa — **sí** incluye semanas todavía no entrenadas. Es el otro bloque, junto con
  `dias_programados`, que responde "cuánto programé vs. cuánto completé". La diferencia entre
  ambos: `dias_programados` agrega por día, `volumen_por_musculo` agrega por músculo (fraccionado
  por rol) — así que sus totales no van a coincidir número a número aunque cuenten sobre la
  misma ventana.
- **`sesiones_realizadas`** (en `/analisis`) es estrictamente días con al menos una serie hecha
  en la ventana — un día programado y no entrenado no aparece acá.
- **`por_posicion` / `por_largo_de_dia` / `por_ejercicio`** (en `/adherencia`) también filtran
  a días con `fecha IS NOT NULL` — el `series_programadas` de estos bloques es "series
  programadas en días que sí se empezaron", no "todo lo programado". No lo compares contra
  el volumen total de la semana.
- **`dias_programados`** (en `/analisis`) responde lo mismo que `volumen_por_musculo` pero por
  día en vez de por músculo: "¿cuánto programé vs. cuánto completé, incluyendo lo que no toqué?"
  No mezcles los números agregados de estos dos bloques con los de `sesiones_realizadas` o
  `/adherencia`: esos últimos solo ven una parte del programa (lo ya entrenado).
- **`GET /coach/progresion/:exercise_id`** cuenta solo series completadas **con peso y reps
  presentes** (no alcanza con `hecha = 1`, ver más abajo) y agrupa por **fecha calendario**, no
  por `program_day`. Su `n_series` de una fecha puede no coincidir con el `series_hechas` de
  `sesiones_realizadas` para ese mismo día si hubo fusión de dos `program_days`.

## `dias_programados` — cómo arma su ventana (y por qué es distinto)

Todos los demás bloques filtran por `pd.fecha` (la fecha del día, que es NULL hasta que el
atleta entrena). `dias_programados` no puede hacer eso: un día nunca entrenado es justo el caso
que quiere mostrar, y filtrar por su propia fecha lo dejaría afuera.

En cambio filtra por `program_weeks.fecha_creada` (siempre tiene valor, no es nullable):
entran las semanas creadas dentro de la ventana, más — como red de seguridad — cualquier semana
más vieja que igual tenga un día con `fecha` reciente (entrenada fuera de horario, por así
decirlo). Así, un día programado y nunca tocado aparece con `series_completadas: 0` en vez de
desaparecer del resultado.

Cada fila trae `mesociclo_id`/`mesociclo_nombre` (`null` si la semana todavía no tiene
mesociclo asignado — normal mientras el uso de mesociclos recién empieza).

**Límite conocido:** un día no entrenado y un día entrenado pero cargado más tarde en la app
(por ejemplo, el atleta carga los datos días después) se ven distintos gracias al autoseteo de
`fecha` al completar la primera serie — pero un día donde el atleta entrenó de memoria y nunca
cargó nada en la app es indistinguible de uno realmente no entrenado (ambos: `fecha: null`,
`series_completadas: 0`). Distinguir esos dos casos requeriría una columna nueva y está fuera
de alcance hoy.

## `volumen_por_musculo` — semana de programa, no semana ISO

Las semanas de programa duran 8-9 días corridos, no 7: agrupar por semana ISO
(`strftime('%Y-%W', ...)`) mezcla la mayoría de las veces dos semanas de programa distintas en
una sola fila (una semana entera puede empezar a mitad de una semana ISO y terminar a mitad de
la siguiente). Por eso este bloque agrupa por la semana de programa (identificada por `week_id`,
que es la clave real y no ambigua), no por la ISO. Cada fila trae igual la semana ISO —
`semana` — para cruzar con datos de calendario (peso corporal, Trac), pero **no la uses como
clave**: dos filas de `week_id` distintos pueden compartir la misma `semana` ISO.

`semana_programa` es el número dentro del mesociclo (se reinicia por mesociclo — dos semanas
con el mismo `semana_programa` en `mesociclo_id` distintos son semanas distintas, no la misma
fila). `mesociclo_id` es `null` mientras la semana no tenga mesociclo asignado.

La ventana usa el mismo criterio que `dias_programados` (ver abajo): filtra por `fecha_creada`
de la semana, con la ISO como red de seguridad para semanas viejas entrenadas hace poco.

## `ingesta_diaria` — sin carga no es cero

Es el único bloque de calendario que **no** rellena las fechas vacías: el Trac trae una fila por
día con huecos en `null`, la Ingesta diaria trae solo las fechas que el atleta cargó. A propósito:
una fecha sin carga es "no cargado", y una fila con ceros o nulls se confunde fácil con "comió 0".
Contá cuántas fechas de la ventana tienen carga antes de sacar un promedio, y no compares un
promedio de 3 días cargados contra uno de 7 como si fueran equivalentes.

## `fecha` nullable — el detalle que rompe filtros ingenuos

`program_days.fecha` es nullable y se autosetea recién cuando el atleta completa la primera
serie de ese día. Una semana programada a futuro **no tiene fecha en ningún día todavía**. Por
eso varios bloques de `/analisis` y `/adherencia` filtran explícitamente por días ya
entrenados — si armás tu propio análisis cruzando datos de más de un bloque, tené en cuenta que
"sin fecha" no es un error de carga, es "todavía no lo entrenaste".

## RPE y e1RM

- El e1RM viene **siempre precomputado** en los bloques que lo incluyen. No lo recalcules a
  mano — usá el valor que trae la respuesta.
- **Método: serie proyectada al fallo + tabla RTS** (Tuchscherer). Reps en reserva = 10 − RPE,
  sin redondear (RPE 8,5 → 1,5); reps proyectadas = reps hechas + reps en reserva; el %1RM sale
  de la tabla RTS, interpolando linealmente entre filas; e1RM = peso ÷ %1RM, a 1 decimal.

  | Reps al fallo | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | %1RM | 100 | 95,5 | 92,2 | 89,2 | 86,3 | 83,7 | 81,1 | 78,6 | 76,2 | 73,9 |

  Ejemplos: 80×3 @7 → 95,6 · 85×3 @9 → 95,3 · 100×2 @8,5 (3,5 proyectadas, 90,7 %) → 110,3.
- **Sin e1RM** (`e1rm: null`) cuando: no hay RPE cargado (no se asume RPE 10), el RPE es < 5,
  o la serie proyecta más de 10 reps al fallo (ej. 75×9 @8 → 11). Por eso la mayoría de los
  accesorios no tiene e1RM: su progresión se sigue por peso y reps en
  `GET /coach/progresion/:exercise_id`.
- **Confianza del e1RM** (`e1rm_confianza`): `"alta"` con RPE ≥ 7; `"baja"` con RPE 5–6,5. Una
  serie de confianza baja (típicamente técnica) trae su e1RM, pero **no cuenta** para
  `mejor_e1rm_basicos`, el mejor/actual de `/stats` ni el `mejor_e1rm` de `/coach/progresion`:
  no es una caída de fuerza, es una serie lejos del fallo. `progresion_basicos` sí trae esas
  filas, marcadas, para que las veas.
- **Los e1RM históricos cambiaron** (2026-11, issue #14): antes se calculaban con Epley sobre
  peso × reps, ignorando el RPE. La vista recalcula todo el historial con el método nuevo, así
  que **no compares contra números de análisis viejos** (notas, planillas, conversaciones
  previas): compará siempre contra lo que devuelve la API hoy.
- `rastrea_e1rm` marca solo los 3 movimientos de competencia (Squat, Bench, Deadlift). Las
  variantes no contaminan el e1RM del básico — su progresión se mide dentro de la variante, y
  para eso está `GET /coach/progresion/:exercise_id`, que no filtra por `rastrea_e1rm` y
  funciona con cualquier ejercicio de la library, no solo los 3 básicos.
- `progresion_basicos` no trae una fila por serie: agrupa por `(nombre, fecha, peso_kg, reps,
  RPE)`. Un día con top set + back-off (dos cargas distintas) te da dos filas, y la misma carga a
  RPE distinto también (el e1RM depende del RPE), cada una con su `e1rm` y `e1rm_confianza`.
  `rpe_min`/`rpe_max` siguen en la respuesta por compatibilidad, pero dentro de una fila son
  iguales. No promedies el RPE entre filas de un mismo día para "reconstruir la sesión" — usá
  `rpe_basicos` si necesitás el promedio por sesión, ya viene calculado.

## Bloques opt-in

`ejercicios` no viaja por defecto (pesa ~55% del payload para un catálogo que rara vez cambia
entre semanas). Pedilo con `?incluir=ejercicios`. `generado.analisis_bloques` de `/coach/docs`
marca `opt_in: true` en los bloques que hay que pedir explícitamente — no asumas que un bloque
no listado en una respuesta de `/analisis` no existe, puede ser opt-in.
