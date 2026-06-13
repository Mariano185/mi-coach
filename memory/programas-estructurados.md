---
name: programas-estructurados
description: Decisión de migrar programas de .md plano a modelo relacional con series target+real completables
metadata:
  type: project
---

El atleta decidió (2026-06-13) rediseñar la sección Programas: dejar de guardar la rutina como `.md` plano (tabla `programs.contenido_md`) y pasar a un **modelo estructurado en BD**: semana → día → ejercicio → serie, donde cada serie tiene valores **objetivo** (peso/reps/rpe que pone el coach) y **real** (lo que completa el atleta tras entrenar).

**Decisiones tomadas:**
- Completar las series reales del programa = registrar la sesión (REEMPLAZA el flujo manual de LogSession; este queda para series sueltas).
- Solo estructurado, sin `.md` plano paralelo.
- UI drill-down estilo Hevy (referencia visual que dio el atleta): pantalla semana (cards de día) → día (cards de ejercicio) → ejercicio (tabs OBJETIVO/REAL, grid PESO·REPS·RPE, Estadísticas e1RM+tonelaje, Notas).
- Estilo: misma estructura/interacción que Hevy pero con **carácter propio** (paleta/tipografía distintiva, no clon negro+cyan).
- App es DESKTOP, no mobile — adaptar layout (más ancho, grilla de cards).

**Why:** el flujo viejo desconectaba plan (md decorativo) y registro (LogSession), forzando doble carga. El nuevo une ambos.

**How to apply:** la skill [[nueva-semana]] debe actualizarse para escribir a las tablas nuevas en vez de generar `.md`. Ver [[ui-rediseno]].
