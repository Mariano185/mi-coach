import { Router } from "express";
import { db } from "../db.js";
import type { BasicE1rm, Stats, WeeklyVolume, WeightTrendPoint } from "../types.js";

export const statsRouter = Router();

// Ventana del e1RM "actual": mejor de las últimas N sesiones DE ESE básico (no días de
// calendario — con frecuencias bajas por básico, una ventana fija se vacía por rotación
// normal). N=3 cubre un ciclo pesado/técnico/volumen sin que el día de volumen arrastre
// el valor hacia abajo (siempre pierde contra el día pesado dentro de esas 3 sesiones).
const SESIONES_ACTUAL = 3;

// "Se le sigue el e1RM": los movimientos de competencia. Ver docs/adr/0001.
const RASTREA_E1RM = "e.rastrea_e1rm = 1";

// GET /api/stats — e1RM por básico (histórico + actual), tendencia de peso (PM 7d), volumen semanal.
statsRouter.get("/", (_req, res) => {
  // 1) e1RM por básico: PR histórico (MAX de siempre) + actual (MAX de las últimas
  // SESIONES_ACTUAL sesiones entrenadas). Se agrupa por día primero para que el mejor set
  // de cada sesión compita entero contra el de otras sesiones — así el día pesado siempre
  // gana sobre el de volumen dentro de la ventana. FROM exercises sin más joins garantiza
  // que los 3 básicos aparezcan aunque no tengan series (null → "Sin datos" en el cliente).
  const basicos = db
    .prepare(
      `WITH dias AS (
         SELECT e.id AS exercise_id, pd.fecha, MAX(v.e1rm) AS e1rm_dia
         FROM exercises e
         JOIN program_exercises pe ON pe.exercise_id = e.id
         JOIN program_days      pd ON pd.id = pe.day_id
         JOIN v_program_sets_e1rm v ON v.program_exercise_id = pe.id
         WHERE ${RASTREA_E1RM} AND v.e1rm IS NOT NULL AND pd.fecha IS NOT NULL
         GROUP BY e.id, pd.fecha
       ),
       rankeado AS (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY fecha DESC) AS rn
         FROM dias
       )
       SELECT e.id AS exercise_id, e.nombre,
         (SELECT MAX(e1rm_dia) FROM dias d WHERE d.exercise_id = e.id) AS mejor_e1rm,
         -- en empate de PR gana la fecha más reciente (el PR "vigente")
         (SELECT d.fecha FROM dias d WHERE d.exercise_id = e.id
            ORDER BY d.e1rm_dia DESC, d.fecha DESC LIMIT 1)            AS mejor_fecha,
         (SELECT MAX(e1rm_dia) FROM rankeado r
            WHERE r.exercise_id = e.id AND r.rn <= ?)                  AS actual_e1rm,
         (SELECT MAX(fecha) FROM dias d WHERE d.exercise_id = e.id)    AS ultima_fecha
       FROM exercises e
       WHERE ${RASTREA_E1RM}
       ORDER BY e.id`
    )
    .all(SESIONES_ACTUAL) as BasicE1rm[];

  // 2) Tendencia de peso con promedio móvil de 7 días (window function en SQL).
  const tendencia_peso = db
    .prepare(
      `SELECT
         fecha,
         peso_kg,
         ROUND(AVG(peso_kg) OVER (
           ORDER BY fecha
           ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
         ), 2) AS promedio_movil_7d
       FROM bodyweight
       ORDER BY fecha ASC`
    )
    .all() as WeightTrendPoint[];

  // 3) Volumen semanal: series de básicos vs accesorios, agrupado por semana ISO.
  const volumen_semanal = db
    .prepare(
      `SELECT
         strftime('%Y-%W', pd.fecha) AS semana,
         SUM(CASE WHEN ${RASTREA_E1RM} THEN 1 ELSE 0 END) AS series_basicos,
         SUM(CASE WHEN ${RASTREA_E1RM} THEN 0 ELSE 1 END) AS series_accesorios
       FROM program_sets ps
       JOIN program_exercises pe ON pe.id = ps.program_exercise_id
       JOIN program_days pd ON pd.id = pe.day_id
       JOIN exercises e ON e.id = pe.exercise_id
       WHERE ps.hecha = 1 AND ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL
         AND pd.fecha IS NOT NULL
       GROUP BY semana
       ORDER BY semana ASC`
    )
    .all() as WeeklyVolume[];

  const result: Stats = { basicos, tendencia_peso, volumen_semanal };
  res.json(result);
});
