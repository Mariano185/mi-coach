import { Router } from "express";
import { db } from "../db.js";
import { esFecha } from "../validacion/fecha.js";
import type { PasosDiarios, UpsertPasosDiariosInput } from "../types.js";

// Pasos diarios (GLOSSARY.md): el total de una fecha según Apple Health. Los manda un
// atajo de iOS al empezar el día siguiente, con la clave del dispositivo (X-Device-Key,
// ver auth.ts), que solo autoriza esta ruta. Una fila por fecha; reenviar la corrige.
export const pasosRouter = Router();

// PUT /api/pasos — upsert por fecha: { fecha: YYYY-MM-DD, pasos: entero ≥ 0 }.
pasosRouter.put("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<Record<keyof UpsertPasosDiariosInput, unknown>>;

  if (!esFecha(body.fecha)) {
    return res.status(400).json({ error: "fecha requerida en formato YYYY-MM-DD" });
  }
  const { pasos } = body;
  if (typeof pasos !== "number" || !Number.isInteger(pasos) || pasos < 0) {
    return res.status(400).json({ error: "pasos es obligatorio y debe ser un entero ≥ 0" });
  }

  db.prepare(
    `INSERT INTO pasos_diarios (fecha, pasos, actualizado_en)
     VALUES (@fecha, @pasos, datetime('now'))
     ON CONFLICT(fecha) DO UPDATE SET
       pasos = excluded.pasos,
       actualizado_en = datetime('now')`
  ).run({ fecha: body.fecha, pasos });

  const row = db.prepare("SELECT * FROM pasos_diarios WHERE fecha = ?").get(body.fecha) as PasosDiarios;
  res.json(row);
});
