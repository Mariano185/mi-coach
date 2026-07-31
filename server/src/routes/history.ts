import { Router } from "express";
import { db } from "../db.js";
import type { HistoryDay, HistoryDayDetail } from "../types.js";

export const historyRouter = Router();

// Nombre visible de un program_exercise: el de la tabla exercises, o el libre.
const EX_NAME_SQL = "COALESCE(e.nombre, pe.nombre_libre)";

const HISTORY_DAY_SQL = `
  SELECT
    pd.id AS day_id, pd.fecha, pw.semana, pd.dia, pd.tipo, pd.titulo,
    pd.hora_inicio, pd.hora_fin,
    (SELECT COUNT(*) FROM program_sets ps
       JOIN program_exercises pe ON pe.id = ps.program_exercise_id
      WHERE pe.day_id = pd.id AND ps.hecha = 1
        AND ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL) AS n_series
  FROM program_days pd
  JOIN program_weeks pw ON pw.id = pd.week_id
`;

// GET /api/history — días con al menos una serie real completada, más recientes primero.
// Reemplaza GET /api/sessions: lee directo de program_sets, sin el volcado manual.
historyRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM (${HISTORY_DAY_SQL} WHERE pd.fecha IS NOT NULL) h
       WHERE h.n_series > 0
       ORDER BY h.fecha DESC, h.day_id DESC`
    )
    .all() as HistoryDay[];
  res.json(rows);
});

// GET /api/history/:dayId — el día + sus series reales (con e1rm/tonelaje/rir de la vista).
historyRouter.get("/:dayId", (req, res) => {
  const dayId = Number(req.params.dayId);
  if (!Number.isInteger(dayId)) return res.status(400).json({ error: "id inválido" });

  const day = db.prepare(`${HISTORY_DAY_SQL} WHERE pd.id = ?`).get(dayId) as
    | HistoryDay
    | undefined;
  if (!day) return res.status(404).json({ error: "día no encontrado" });

  const sets = db
    .prepare(
      `SELECT pe.exercise_id, ${EX_NAME_SQL} AS exercise_nombre, v.n_serie, v.real_peso,
              v.real_reps, v.real_rpe, v.rir, v.e1rm
       FROM v_program_sets_e1rm v
       JOIN program_exercises pe ON pe.id = v.program_exercise_id
       LEFT JOIN exercises e ON e.id = pe.exercise_id
       WHERE pe.day_id = ? AND v.hecha = 1
         AND v.real_peso IS NOT NULL AND v.real_reps IS NOT NULL
       ORDER BY pe.orden, v.n_serie`
    )
    .all(dayId);

  const detail: HistoryDayDetail = {
    ...day,
    sets: sets as HistoryDayDetail["sets"],
  };
  res.json(detail);
});
