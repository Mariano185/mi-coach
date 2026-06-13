import { Router } from "express";
import { db } from "../db.js";
import type { Exercise } from "../types.js";

export const exercisesRouter = Router();

// GET /api/exercises — catálogo completo para el dropdown del form.
exercisesRouter.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT id, nombre, categoria, es_basico FROM exercises ORDER BY es_basico DESC, categoria, nombre")
    .all() as Exercise[];
  res.json(rows);
});
