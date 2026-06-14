import { Router } from "express";
import { db } from "../db.js";
import type { BasicE1rm, Stats, WeeklyVolume, WeightTrendPoint } from "../types.js";

export const statsRouter = Router();

const SETTING_KEY: Record<string, string> = {
  "Mid/High Bar Back Squat": "rm_squat",
  "Flat Bench Press (barra)": "rm_bench",
  "Conventional Deadlift": "rm_deadlift",
};

// GET /api/stats — e1RM por básico, tendencia de peso (PM 7d), volumen semanal.
statsRouter.get("/", (_req, res) => {
  // 1) Mejor e1RM por básico vs 1RM inicial (settings).
  // LEFT JOIN para incluir básicos sin sets aún (mejor_e1rm = null → fallback a rm_inicial).
  const basicosRaw = db
    .prepare(
      `SELECT e.id AS exercise_id, e.nombre, MAX(v.e1rm) AS mejor_e1rm
       FROM exercises e
       LEFT JOIN v_sets_e1rm v ON v.exercise_id = e.id
       WHERE e.es_basico = 1
       GROUP BY e.id, e.nombre`
    )
    .all() as Array<{ exercise_id: number; nombre: string; mejor_e1rm: number | null }>;

  const getSetting = db.prepare("SELECT valor FROM settings WHERE clave = ?");
  const basicos: BasicE1rm[] = basicosRaw.map((b) => {
    const key = SETTING_KEY[b.nombre];
    const row = key ? (getSetting.get(key) as { valor: string } | undefined) : undefined;
    const rm_inicial = row ? Number(row.valor) : null;
    return {
      exercise_id: b.exercise_id,
      nombre: b.nombre,
      mejor_e1rm: b.mejor_e1rm ?? rm_inicial ?? 0,
      rm_inicial,
    };
  });

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
         strftime('%Y-%W', s.fecha) AS semana,
         SUM(CASE WHEN e.es_basico = 1 THEN 1 ELSE 0 END) AS series_basicos,
         SUM(CASE WHEN e.es_basico = 0 THEN 1 ELSE 0 END) AS series_accesorios
       FROM sets st
       JOIN sessions s ON s.id = st.session_id
       JOIN exercises e ON e.id = st.exercise_id
       GROUP BY semana
       ORDER BY semana ASC`
    )
    .all() as WeeklyVolume[];

  const result: Stats = { basicos, tendencia_peso, volumen_semanal };
  res.json(result);
});
