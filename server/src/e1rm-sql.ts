// DDL de v_program_sets_e1rm: la ÚNICA fuente del e1RM (convención del proyecto: nunca
// recalcularlo en JS ni en SQL ad-hoc). Vive en su propio módulo para que db.ts y el
// setup de tests creen exactamente la misma vista — si el test tuviera su copia a mano,
// los tests pasarían contra una fórmula que producción ya no usa.
//
// Método (ADR 0002, e1rm-con-rpe-tabla-rts): cada serie se proyecta al fallo y se
// convierte con la tabla RTS de Tuchscherer.
//   1. reps en reserva   = 10 − RPE, sin redondear (RPE 8,5 → 1,5)
//   2. reps proyectadas  = reps hechas + reps en reserva
//   3. %1RM              = tabla RTS, interpolando linealmente entre filas
//   4. e1RM              = peso ÷ %1RM, redondeado a 1 decimal
// Sin e1RM (NULL) si: no hay RPE (no se asume 10), RPE < 5, o proyecta > 10 reps.
// Confianza: 'alta' con RPE ≥ 7; 'baja' con RPE 5–6,5 (se muestra marcada, pero no
// cuenta para el mejor e1RM ni para la tendencia). NULL cuando no hay e1RM.

// Reps al fallo → %1RM (índice 0 = 1 rep).
export const TABLA_RTS: readonly number[] = [100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9];

export const RPE_MIN_E1RM = 5;
export const RPE_CONFIANZA_ALTA = 7;

const PROY = "(ps.real_reps + 10.0 - ps.real_rpe)";

// CASE con un tramo lineal por cada par de filas consecutivas de la tabla. Se genera
// desde TABLA_RTS para no tipear diez constantes dos veces, pero lo evalúa SQLite.
function pctRtsSql(): string {
  const tramos = TABLA_RTS.slice(1).map((pct, i) => {
    const desde = TABLA_RTS[i];
    const repsDesde = i + 1;
    return `WHEN ${PROY} <= ${repsDesde + 1} THEN ${desde} + (${PROY} - ${repsDesde}) * (${pct} - ${desde})`;
  });
  return `CASE WHEN ${PROY} <= 1 THEN ${TABLA_RTS[0]} ${tramos.join(" ")} END`;
}

const TIENE_E1RM = `ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL AND ps.real_reps >= 1
             AND ps.real_rpe IS NOT NULL AND ps.real_rpe >= ${RPE_MIN_E1RM} AND ps.real_rpe <= 10
             AND ${PROY} <= 10`;

export const V_PROGRAM_SETS_E1RM_SQL = `
  CREATE VIEW v_program_sets_e1rm AS
    SELECT
      ps.*,
      CASE WHEN ${TIENE_E1RM}
           THEN ROUND(ps.real_peso * 100.0 / (${pctRtsSql()}), 1) END AS e1rm,
      CASE WHEN ${TIENE_E1RM}
           THEN CASE WHEN ps.real_rpe >= ${RPE_CONFIANZA_ALTA} THEN 'alta' ELSE 'baja' END END AS e1rm_confianza,
      CASE WHEN ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL
           THEN ROUND(ps.real_peso * ps.real_reps, 1) END AS tonelaje,
      CASE WHEN ps.real_rpe IS NOT NULL
           THEN MAX(0, ROUND(10 - ps.real_rpe)) END AS rir
    FROM program_sets ps;
`;
