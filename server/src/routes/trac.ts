import { Router } from "express";
import { db } from "../db.js";
import type { TracEntry, UpsertTracInput } from "../types.js";

export const tracRouter = Router();

const DIMENSIONES = [
  "fatiga_pierna",
  "fatiga_empuje",
  "fatiga_traccion",
  "descanso_alimentacion",
  "recuperacion",
  "motivacion",
  "tecnica",
] as const;

// GET /api/trac?fecha=YYYY-MM-DD — registro de esa fecha, o null si no fue cargado.
tracRouter.get("/", (req, res) => {
  const fecha = req.query.fecha;
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: "fecha requerida en formato YYYY-MM-DD" });
  }

  const row = db.prepare("SELECT * FROM trac WHERE fecha = ?").get(fecha) as TracEntry | undefined;
  res.json(row ?? null);
});

// PUT /api/trac — upsert por fecha: crea el registro si no existe, o reemplaza sus valores.
tracRouter.put("/", (req, res) => {
  const body = (req.body ?? {}) as UpsertTracInput;

  if (typeof body.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
    return res.status(400).json({ error: "fecha requerida en formato YYYY-MM-DD" });
  }

  const values: Record<string, number | null> = {};
  for (const key of DIMENSIONES) {
    const v = body[key];
    if (v === undefined || v === null) {
      values[key] = null;
      continue;
    }
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return res.status(400).json({ error: `${key} debe ser un entero entre 1 y 5` });
    }
    values[key] = v;
  }

  db.prepare(
    `INSERT INTO trac (fecha, fatiga_pierna, fatiga_empuje, fatiga_traccion,
                        descanso_alimentacion, recuperacion, motivacion, tecnica, actualizado_en)
     VALUES (@fecha, @fatiga_pierna, @fatiga_empuje, @fatiga_traccion,
             @descanso_alimentacion, @recuperacion, @motivacion, @tecnica, datetime('now'))
     ON CONFLICT(fecha) DO UPDATE SET
       fatiga_pierna = excluded.fatiga_pierna,
       fatiga_empuje = excluded.fatiga_empuje,
       fatiga_traccion = excluded.fatiga_traccion,
       descanso_alimentacion = excluded.descanso_alimentacion,
       recuperacion = excluded.recuperacion,
       motivacion = excluded.motivacion,
       tecnica = excluded.tecnica,
       actualizado_en = datetime('now')`
  ).run({ fecha: body.fecha, ...values });

  const updated = db.prepare("SELECT * FROM trac WHERE fecha = ?").get(body.fecha);
  res.json(updated);
});
