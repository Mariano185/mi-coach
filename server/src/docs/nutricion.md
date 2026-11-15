# Nutrición — pautar el Objetivo nutricional

El **Objetivo nutricional** es parte del plan de una **Semana de programa**, igual que las series:
lo pautás vos, en la semana, y el atleta lo ve arriba de la pantalla Nutrición con cuatro barras
(kcal, proteína, carbohidratos y grasas) contra lo que cargó ese día. El atleta no lo edita.

## Qué mandar

Siempre **los cuatro valores juntos**, como enteros diarios: `objetivo_kcal`,
`objetivo_proteina_g`, `objetivo_carbohidratos_g`, `objetivo_grasas_g`. Mandar solo algunos es
`400`. Es **un promedio diario único** que rige igual todos los días, entrene o no: no pautes kcal
distintas para días de entreno y de descanso (la app no las distingue y el atleta vería un número
que no aplica la mitad de los días).

Opcional: `nota_nutricional`, el texto que acompaña al objetivo (acepta **negritas** y listas con
`-`, como tus otras notas). Es solo de nutrición: no la mezcles con `notas` de la semana, que son
de entrenamiento.

Va en el mismo payload de `POST /api/program/weeks` o después, con el PATCH parcial:

```bash
curl -s -X PATCH -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  "http://192.168.0.110:3001/api/program/weeks/$WEEK_ID" \
  -d '{"objetivo_kcal":2400,"objetivo_proteina_g":190,"objetivo_carbohidratos_g":250,"objetivo_grasas_g":70,
       "nota_nutricional":"**Recomp**: déficit leve.\n- Proteína alta todos los días"}'
```

Para leerlo: `GET /api/program/weeks/:id` trae los seis campos (`objetivo_*`,
`nota_nutricional`, `objetivos_pautados_en`). El objetivo que rige en una fecha concreta, ya
resuelto con las reglas de abajo, viene en `GET /api/nutricion/dia?fecha=YYYY-MM-DD` y en cada fila
de `ingesta_diaria` de `/coach/analisis` (campo `objetivo`, `null` si todavía no regía ninguno).

## La regla de fechas

Cada fecha del calendario pertenece a una sola Semana de programa: **la semana N va desde el día
siguiente a la última sesión de la N−1 hasta su propia última sesión** (o hasta hoy, si es la
última). Los descansos después de cerrar una semana son el "antes" de la siguiente.

En una fecha rige el objetivo de su semana **si esa fecha es igual o posterior a
`objetivos_pautados_en`**; si no, rige el anterior (el que el atleta conocía ese día). Una semana
sin objetivo hereda el anterior: si no cambia, no hace falta repetirlo.

- `objetivos_pautados_en` se fija solo, en **hoy**, la primera vez que la semana recibe objetivo.
- **Corregir** el objetivo (mandar otros valores o solo la nota) **no lo mueve**: arreglar un error
  no cambia qué días cubre.
- Para que un cambio rija desde otro día a propósito (un ajuste a mitad de semana, o pautar con
  fecha retroactiva), mandá `objetivos_pautados_en: "YYYY-MM-DD"` explícito.

## Cuándo crear la semana

**Creá la semana nueva al cerrar la anterior**, no por adelantado. Crearla antes no rompe la
regla, pero adelanta `objetivos_pautados_en` y además corta el rango de la semana en curso en su
última sesión hasta ese momento: los días que siguen pasan a la semana nueva y se comparan contra
su objetivo.

Al leer cumplimiento, compará cada `ingesta_diaria` contra **su** `objetivo` (el de esa fila), no
contra el objetivo actual: si cambiaste el objetivo a mitad de la ventana, las fechas viejas se
miden contra el que regía entonces.
