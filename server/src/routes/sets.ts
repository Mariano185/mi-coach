import { Router } from "express";
import { db } from "../db.js";
import type { NewSetInput } from "../types.js";

export const setsRouter = Router();

// POST /api/sets — agregar un set suelto a una sesión existente (para editar después).
setsRouter.post("/", (req, res) => {
  const body = req.body as NewSetInput & { session_id?: number };

  if (!Number.isInteger(body.session_id)) {
    return res.status(400).json({ error: "session_id requerido" });
  }
  if (!db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(body.session_id)) {
    return res.status(404).json({ error: "sesión no encontrada" });
  }
  if (!Number.isInteger(body.exercise_id) || !db.prepare("SELECT 1 FROM exercises WHERE id = ?").get(body.exercise_id)) {
    return res.status(400).json({ error: "exercise_id inválido" });
  }
  if (typeof body.peso_kg !== "number" || body.peso_kg < 0) {
    return res.status(400).json({ error: "peso_kg inválido" });
  }
  if (!Number.isInteger(body.reps) || body.reps <= 0) {
    return res.status(400).json({ error: "reps inválido" });
  }

  const result = db
    .prepare(
      `INSERT INTO sets (session_id, exercise_id, n_serie, peso_kg, reps, rpe, rir, notas)
       VALUES (@session_id, @exercise_id, @n_serie, @peso_kg, @reps, @rpe, @rir, @notas)`
    )
    .run({
      session_id: body.session_id,
      exercise_id: body.exercise_id,
      n_serie: body.n_serie,
      peso_kg: body.peso_kg,
      reps: body.reps,
      rpe: body.rpe ?? null,
      rir: body.rir ?? null,
      notas: body.notas ?? null,
    });

  res.status(201).json({ id: result.lastInsertRowid });
});
