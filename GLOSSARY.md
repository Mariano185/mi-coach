# mi-coach

App de un solo atleta para registrar entrenamiento de powerbuilding y composición corporal.
Un coach IA externo prescribe; el atleta registra lo que realmente hizo.

## Language

### Programa

**Semana de programa**:
Unidad de prescripción del entrenamiento; dura lo que dure el ciclo de días que contiene (típicamente 8–9 días), no 7. Sus días toman fecha recién cuando se entrenan. Cada fecha del calendario pertenece a una sola Semana de programa: la semana N va desde el día siguiente a la última sesión de la N−1 hasta su propia última sesión (o hasta hoy, si está en curso). La nutrición, los pasos, el Trac y los registros corporales se guardan por fecha, no dentro de la semana; se asocian a ella solo al leerlos.
_Avoid_: semana (a secas), semana ISO, semana calendario

**e1RM**:
El 1RM estimado de una serie a partir de su peso, sus reps y su RPE: se proyecta la serie al fallo (reps hechas + reps en reserva) y se convierte con la tabla RTS. No existe para series que proyectadas superan 10 reps, con RPE menor a 5, ni sin RPE.
_Avoid_: 1RM (a secas), RM estimado, Epley

**Confianza del e1RM**:
Alta si la serie fue a RPE 7 o más; baja si fue a RPE 5–6,5. Solo los de confianza alta cuentan para el mejor e1RM y la tendencia.

**Trac**:
La autoevaluación diaria del atleta, del 1 al 5, de fatiga por patrón (pierna, empuje, tracción), **Sueño**, recuperación, motivación y técnica. Una por fecha, entrene o no.

**Sueño**:
Cómo siente el atleta que durmió, del 1 al 5; es una percepción, no horas. Hasta noviembre de 2026 ese mismo valor se llamaba "descanso/alimentación" y mezclaba sueño y comida.
_Avoid_: descanso/alimentación, horas de sueño

### Nutrición

**Objetivo nutricional**:
Las kcal diarias y los macros diarios (proteína, carbohidratos, grasas, en gramos; siempre los cuatro) que el coach pauta como parte de una **Semana de programa**. Rige igual todos los días, entrene o no (es un promedio pensado para ambos tipos de día, no hay kcal distintas para entreno y descanso). En una fecha vale el objetivo de la semana a la que pertenece esa fecha, salvo que el coach lo haya pautado después de esa fecha: entonces vale el que regía antes (el que el atleta conocía ese día). Si una semana no trae objetivo, sigue rigiendo el anterior. Pertenece al coach; el atleta no lo edita.
_Avoid_: meta, kcal objetivo del día, pauta

**Nota nutricional**:
El texto del coach que acompaña a un **Objetivo nutricional**. Es solo de nutrición; las notas de entrenamiento no hablan de nutrición.
_Avoid_: notas de la semana, comentario

**Ingesta diaria**:
Lo que el atleta realmente consumió en una fecha: kcal, proteína, carbohidratos y grasas, sumados fuera de la app (MyFitnessPal) y cargados al cerrar el día, con un comentario opcional del atleta (ej. "la cena fue a ojo"). Hay a lo sumo una por fecha; volver a cargarla la corrige. Una fecha sin Ingesta diaria significa "no cargado", nunca "comió 0".
_Avoid_: comida, registro nutricional, macros del día

### Actividad

**Pasos diarios**:
El total de pasos de una fecha calendario completa, según Apple Health. Llegan solos al empezar el día siguiente, etiquetados con la fecha del día que terminó; un nuevo envío para la misma fecha la corrige.
_Avoid_: actividad, NEAT, pasos (a secas)

### Cuerpo

**Registro corporal**:
Lo que el atleta mide de su cuerpo en una fecha: el peso (siempre) y, cuando corresponde, sus **Perímetros**, más notas propias. Hay a lo sumo uno por fecha. Independiente de la **Ingesta diaria**.
_Avoid_: bodyweight (en prosa), pesada, medición

**Perímetro**:
La circunferencia de una zona del cuerpo medida con cinta, en cm: brazo, pierna o abdomen.
_Avoid_: diámetro, contorno, medida, cintura (es el de abdomen)

**Protocolo de medición**:
La forma fija de tomar cada **Perímetro** para que sean comparables entre fechas: brazo derecho flexionado y contraído en el punto más grueso del bíceps; muslo derecho a mitad entre ingle y rodilla, de pie; abdomen a la altura del ombligo, relajado, tras exhalar, en ayunas.
