# Caveats de `/coach/analisis` y `/coach/adherencia`

Referencia rápida de los denominadores y ventanas de cada bloque — para no comparar números que
no son comparables entre sí. El detalle de cómo usar cada bloque para armar la semana está en
la sección `flujo-semana`.

## Ventanas por defecto

| Endpoint | Ventana default | Por qué |
|---|---|---|
| `GET /coach/analisis` | `?dias=42` (~6 semanas) | Suficiente para ver progresión de bloque sin arrastrar bloques viejos. |
| `GET /coach/adherencia` | `?dias=90` | Un patrón de posición necesita varias semanas para no ser ruido de una sesión mala. |

## Denominadores que NO son comparables entre sí

- **`volumen_por_musculo`** (en `/analisis`) cuenta solo series **completadas** (`hecha = 1`) en
  días con `fecha` (es decir, ya entrenados). No incluye lo programado a futuro.
- **`sesiones_realizadas`** (en `/analisis`) es estrictamente días con al menos una serie hecha
  en la ventana — un día programado y no entrenado no aparece acá.
- **`por_posicion` / `por_largo_de_dia` / `por_ejercicio`** (en `/adherencia`) también filtran
  a días con `fecha IS NOT NULL` — el `series_programadas` de estos bloques es "series
  programadas en días que sí se empezaron", no "todo lo programado". No lo compares contra
  el volumen total de la semana.

Ninguno de estos bloques responde hoy "¿cuánto programé en total, incluyendo lo que no
entrené?" — es una limitación conocida, no un bug. Si necesitás esa comparación, decíselo al
atleta para que lo pida como mejora.

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
