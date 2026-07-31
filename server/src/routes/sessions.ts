import { Router } from "express";
import { db } from "../db.js";
import type { Session, SessionWithSets } from "../types.js";

export const sessionsRouter = Router();

// GET /api/sessions — lista, más reciente primero.
sessionsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM sessions ORDER BY fecha DESC, id DESC")
    .all() as Session[];
  res.json(rows);
});

// GET /api/sessions/:id — sesión con sus sets (incluye nombre de ejercicio y e1RM).
sessionsRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Session | undefined;
  if (!session) return res.status(404).json({ error: "sesión no encontrada" });

  const sets = db
    .prepare(
      `SELECT v.*, e.nombre AS exercise_nombre
       FROM v_sets_e1rm v
       JOIN exercises e ON e.id = v.exercise_id
       WHERE v.session_id = ?
       ORDER BY v.id`
    )
    .all(id);

  const result: SessionWithSets = { ...session, sets: sets as SessionWithSets["sets"] };
  res.json(result);
});
