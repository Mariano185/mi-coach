# Caveats de `/coach/analisis` y `/coach/adherencia`

Referencia rápida de los denominadores y ventanas de cada bloque — para no comparar números que
no son comparables entre sí. El detalle de cómo usar cada bloque para armar la semana está en
la sección `flujo-semana`.

## Ventanas por defecto

| Endpoint | Ventana default | Por qué |
|---|---|---|
| `GET /coach/analisis` | `?dias=42` (~6 semanas) | Suficiente para ver progresión de bloque sin arrastrar bloques viejos. |
| `GET /coach/adherencia` | `?dias=90` | Un patrón de posición necesita varias semanas para no ser ruido de una sesión mala. |
| `dias_programados` (en `/analisis`) | Mismo `?dias=` que `/analisis` | Ventana propia, contada por `fecha_creada` de la semana, no por `pd.fecha` — ver abajo. |

## Denominadores que NO son comparables entre sí

- **`volumen_por_musculo`** (en `/analisis`) cuenta solo series **completadas** (`hecha = 1`) en
  días con `fecha` (es decir, ya entrenados). No incluye lo programado a futuro.
- **`sesiones_realizadas`** (en `/analisis`) es estrictamente días con al menos una serie hecha
  en la ventana — un día programado y no entrenado no aparece acá.
- **`por_posicion` / `por_largo_de_dia` / `por_ejercicio`** (en `/adherencia`) también filtran
  a días con `fecha IS NOT NULL` — el `series_programadas` de estos bloques es "series
  programadas en días que sí se empezaron", no "todo lo programado". No lo compares contra
  el volumen total de la semana.
- **`dias_programados`** (en `/analisis`) es la excepción: es el único bloque que **sí** incluye
  días con `fecha = NULL`. Por eso su `series_programadas`/`series_completadas` por fila
  responde "¿cuánto programé vs. cuánto completé, incluyendo lo que no toqué?" — la pregunta que
  ningún otro bloque contesta. No mezcles sus números agregados con los de `volumen_por_musculo`
  o `sesiones_realizadas`: estos últimos solo ven una parte del programa (lo ya entrenado).

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

## `fecha` nullable — el detalle que rompe filtros ingenuos

`program_days.fecha` es nullable y se autosetea recién cuando el atleta completa la primera
serie de ese día. Una semana programada a futuro **no tiene fecha en ningún día todavía**. Por
eso varios bloques de `/analisis` y `/adherencia` filtran explícitamente por días ya
entrenados — si armás tu propio análisis cruzando datos de más de un bloque, tené en cuenta que
"sin fecha" no es un error de carga, es "todavía no lo entrenaste".

## RPE y e1RM

- El e1RM (Epley) viene **siempre precomputado** en los bloques que lo incluyen. No lo
  recalcules a mano con peso y reps — usá el valor que trae la respuesta.
- `rastrea_e1rm` marca solo los 3 movimientos de competencia (Squat, Bench, Deadlift). Las
  variantes no contaminan el e1RM del básico — su progresión se mide dentro de la variante.
