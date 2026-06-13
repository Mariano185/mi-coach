import { Router } from "express";
import { db } from "../db.js";
import type { Bodyweight, NewBodyweightInput } from "../types.js";

export const bodyweightRouter = Router();

// GET /api/bodyweight — registros ordenados por fecha ascendente (para graficar).
bodyweightRouter.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM bodyweight ORDER BY fecha ASC, id ASC")
    .all() as Bodyweight[];
  res.json(rows);
});

// POST /api/bodyweight — nuevo registro de peso/nutrición.
bodyweightRouter.post("/", (req, res) => {
  const body = req.body as NewBodyweightInput;

  if (typeof body.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
    return res.status(400).json({ error: "fecha requerida en formato YYYY-MM-DD" });
  }
  if (typeof body.peso_kg !== "number" || body.peso_kg <= 0) {
    return res.status(400).json({ error: "peso_kg inválido" });
  }
  if (body.hambre != null && (body.hambre < 1 || body.hambre > 10)) {
    return res.status(400).json({ error: "hambre debe estar entre 1 y 10" });
  }

  const result = db
    .prepare(
      `INSERT INTO bodyweight (fecha, peso_kg, kcal_objetivo, proteina_g, hambre, digestion, notas)
       VALUES (@fecha, @peso_kg, @kcal_objetivo, @proteina_g, @hambre, @digestion, @notas)`
    )
    .run({
      fecha: body.fecha,
      peso_kg: body.peso_kg,
      kcal_objetivo: body.kcal_objetivo ?? null,
      proteina_g: body.proteina_g ?? null,
      hambre: body.hambre ?? null,
      digestion: body.digestion ?? null,
      notas: body.notas ?? null,
    });

  res.status(201).json({ id: result.lastInsertRowid });
});
