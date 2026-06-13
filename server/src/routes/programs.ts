import { Router } from "express";
import { db } from "../db.js";
import type { NewProgramInput, Program } from "../types.js";

export const programsRouter = Router();

// GET /api/programs — lista de rutinas generadas, más reciente primero.
programsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT id, semana, fecha_creada, resumen FROM programs ORDER BY semana DESC, id DESC")
    .all();
  res.json(rows);
});

// GET /api/programs/:id — una rutina completa (con su markdown).
programsRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  const row = db.prepare("SELECT * FROM programs WHERE id = ?").get(id) as Program | undefined;
  if (!row) return res.status(404).json({ error: "programa no encontrado" });
  res.json(row);
});

// POST /api/programs — guarda una rutina (la usa el coach al generar la semana).
programsRouter.post("/", (req, res) => {
  const body = req.body as NewProgramInput;
  if (!Number.isInteger(body.semana)) {
    return res.status(400).json({ error: "semana requerida (entero)" });
  }
  if (typeof body.contenido_md !== "string" || body.contenido_md.trim() === "") {
    return res.status(400).json({ error: "contenido_md requerido" });
  }
  const result = db
    .prepare(
      `INSERT INTO programs (semana, fecha_creada, contenido_md, resumen)
       VALUES (@semana, @fecha_creada, @contenido_md, @resumen)`
    )
    .run({
      semana: body.semana,
      fecha_creada: new Date().toISOString().slice(0, 10),
      contenido_md: body.contenido_md,
      resumen: body.resumen ?? null,
    });
  res.status(201).json({ id: result.lastInsertRowid });
});
