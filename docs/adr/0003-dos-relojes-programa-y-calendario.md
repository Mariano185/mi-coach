# ADR 0003 — Dos relojes: programa y calendario

**Estado:** aceptado
**Fecha:** 2026-11-14

Los datos se ordenan con dos relojes que no coinciden. El **programa** (semanas, días, ejercicios,
series) se identifica por `week_id` y número de día, y una **Semana de programa** dura 8–9 días.
El **calendario** (Ingesta diaria, Pasos diarios, Trac, Registro corporal) va por fecha, una fila
por día, entrene o no. Decidimos guardar cada cosa según su reloj y cruzarlas **solo al leer**,
con una regla fija: **la semana N va desde el día siguiente a la última sesión de la N−1 hasta su
propia última sesión** (o hasta hoy, si está en curso). Así cada fecha pertenece a una sola
semana, y los descansos posteriores a una semana pasan a ser el "antes" de la siguiente, que es lo
que el coach necesita para leer cómo llegó el atleta a su D1.

El **Objetivo nutricional** es la excepción deliberada: se guarda **en la Semana de programa**
(es parte del plan de esa semana, igual que las series), junto con la fecha en que el coach lo
pautó (`objetivos_pautados_en`). En una fecha dada vale el objetivo de su semana si esa fecha es
igual o posterior a `objetivos_pautados_en`; si es anterior, vale el que regía antes, que es el
que el atleta conocía ese día. Una semana sin objetivo hereda el anterior. Corregir un objetivo
no mueve `objetivos_pautados_en`; para que un cambio rija desde otro día, el coach manda la fecha
explícitamente.

## Considered Options

- **Atar la nutrición y el peso a la semana de programa** (guardarlos dentro de la semana):
  descartado. Los días de descanso no tienen fila de programa, y son justo los que importan en
  una recomposición.
- **Agrupar por semana ISO o calendario:** descartado por el mismo motivo que en
  `v_volumen_por_musculo`: una semana ISO mezcla dos semanas de programa.
- **La semana empieza en su primer día entrenado:** descartado. Un descanso entre el cierre con
  el coach y el D1 quedaba en la semana anterior, comparado contra un objetivo ya reemplazado.
- **Objetivo con fecha de vigencia propia, sin semana:** equivalente casi siempre, pero agregaba
  una segunda regla de fechas además de la de la semana. La regla híbrida usa una sola.
- **Contar el objetivo desde el inicio de la semana, sin `objetivos_pautados_en`:** si el coach
  pautaba tarde, los días previos quedaban comparados contra un número que el atleta no conocía,
  y el coach leía un incumplimiento que no existió.

## Consequences

- El rango de fechas de una semana solo se conoce del todo cuando termina: depende de dónde caiga
  su última sesión. Mientras está en curso, el rango llega hasta hoy.
- Entre el cierre de una semana y la creación de la siguiente, los días quedan asignados a una
  semana que todavía no existe; ahí rige el último objetivo pautado.
- El coach debe crear la semana nueva al cerrar la anterior, no por adelantado: crearla antes no
  rompe la regla, pero adelanta `objetivos_pautados_en`.
