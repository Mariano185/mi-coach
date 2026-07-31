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
  // LEFT JOIN para incluir básicos sin series completadas aún (mejor_e1rm = null → fallback
  // a rm_inicial). Lee program_sets (única fuente de verdad), no sessions/sets.
  const basicosRaw = db
    .prepare(
      `SELECT e.id AS exercise_id, e.nombre, MAX(v.e1rm) AS mejor_e1rm
       FROM exercises e
       LEFT JOIN program_exercises pe ON pe.exercise_id = e.id
       LEFT JOIN v_program_sets_e1rm v ON v.program_exercise_id = pe.id AND v.e1rm IS NOT NULL
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
         strftime('%Y-%W', pd.fecha) AS semana,
         SUM(CASE WHEN e.es_basico = 1 THEN 1 ELSE 0 END) AS series_basicos,
         SUM(CASE WHEN e.es_basico = 0 THEN 1 ELSE 0 END) AS series_accesorios
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
