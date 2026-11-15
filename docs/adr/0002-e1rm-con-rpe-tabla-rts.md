# ADR 0002 — e1RM con RPE, tabla RTS y filtros de confianza

**Estado:** aceptado
**Fecha:** 2026-11-14

El e1RM se calculaba con Epley sobre peso × reps hechas, ignorando el RPE: una serie técnica
@5 aparecía como una caída de fuerza que no existió. Decidimos proyectar cada serie al fallo
(reps hechas + reps en reserva, RIR = 10 − RPE, interpolando los medios puntos) y convertir con
la **tabla RTS** (Tuchscherer), con tres filtros: sin e1RM si la proyección supera 10 reps, si el
RPE es menor a 5 o si no hay RPE; confianza **baja** para RPE 5–6,5 (se muestra, pero no entra en
el mejor e1RM ni en la tendencia) y **alta** para RPE ≥ 7. El cálculo vive solo en la vista
`v_program_sets_e1rm` y recalcula el historial completo.

## Considered Options

- **Epley + RIR** (`peso × (1 + (reps + RIR)/30)`): hasta 10 reps proyectadas difiere de RTS en
  ~1 %, pero infla las series largas. Se descartó por consistencia, no por precisión.
- **Por qué RTS sin validación científica directa:** no encontramos un estudio que valide la
  tabla RTS frente a otras. Se eligió porque es la que usa el coach para sus cuentas, así que la
  app y el coach muestran el mismo número. La mejora real viene de sumar el RIR y de los filtros,
  no de la tabla.

## Evidencia de los filtros

- El RPE basado en RIR es válido en atletas entrenados (Zourdos et al., 2016, *JSCR*;
  Ormsbee et al., 2019, *JSCR*).
- El error al estimar RIR crece lejos del fallo y con más reps por serie: ~2 reps a RPE 9,
  ~3,7 a RPE 7 y ~5 a RPE 5 en series largas (Zourdos et al., 2021, *JSCR*). Con series cortas
  a 1–3 RIR, el error fue menor a 1 rep (Refalo et al., 2024, *JSCR*).
- La relación reps–%1RM varía mucho entre personas y ejercicios a cargas bajas
  (Nuzzo et al., 2023, *Sports Medicine*), lo que justifica el tope de 10 reps proyectadas.

## Consequences

- Con los datos al 2026-11-14, ~1 de cada 3 series de básicos queda como baja confianza y ~3 de
  cada 4 series de accesorios no tienen e1RM (superan el tope). La progresión de accesorios se
  sigue por peso y reps en `GET /coach/progresion/:exercise_id`, no por e1RM.
