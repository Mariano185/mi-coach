import { Router } from "express";
import { db } from "../db.js";
import type { IngestaDiaria, UpsertIngestaDiariaInput } from "../types.js";

// Ingesta diaria: lo que el atleta comió en una fecha (GLOSSARY.md). Una por fecha;
// volver a cargarla la corrige. Una fecha sin carga es "no cargado", nunca 0 kcal:
// por eso los cuatro valores son obligatorios y no hay defaults.
export const ingestaRouter = Router();

const VALORES = ["kcal", "proteina_g", "carbohidratos_g", "grasas_g"] as const;

// YYYY-MM-DD y además una fecha real del calendario (rechaza 2026-02-30: Date la
// "normaliza" a otro día, así que se compara la vuelta).
function esFecha(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// GET /api/ingesta?fecha=YYYY-MM-DD           — la carga de esa fecha, o null si no hay.
// GET /api/ingesta?desde=YYYY-MM-DD&hasta=... — solo las fechas cargadas del rango
//                                               (inclusivo), ascendente.
ingestaRouter.get("/", (req, res) => {
  const { fecha, desde, hasta } = req.query;

  if (fecha !== undefined) {
    if (!esFecha(fecha)) return res.status(400).json({ error: "fecha debe tener formato YYYY-MM-DD" });
    const row = db.prepare("SELECT * FROM ingesta_diaria WHERE fecha = ?").get(fecha) as
      | IngestaDiaria
      | undefined;
    return res.json(row ?? null);
  }

  if (!esFecha(desde) || !esFecha(hasta)) {
    return res
      .status(400)
      .json({ error: "pasá ?fecha=YYYY-MM-DD o el rango ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD" });
  }
  const rows = db
    .prepare("SELECT * FROM ingesta_diaria WHERE fecha BETWEEN ? AND ? ORDER BY fecha ASC")
    .all(desde, hasta) as IngestaDiaria[];
  res.json(rows);
});

// PUT /api/ingesta — upsert por fecha: crea la carga o reemplaza la existente (el
// comentario también: no mandarlo lo borra, igual que los demás campos).
ingestaRouter.put("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<Record<keyof UpsertIngestaDiariaInput, unknown>>;

  if (!esFecha(body.fecha)) {
    return res.status(400).json({ error: "fecha requerida en formato YYYY-MM-DD" });
  }
  for (const key of VALORES) {
    const v = body[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      return res.status(400).json({ error: `${key} es obligatorio y debe ser un entero ≥ 0` });
    }
  }
  const comentarioRaw = body.comentario ?? null;
  if (comentarioRaw !== null && typeof comentarioRaw !== "string") {
    return res.status(400).json({ error: "comentario debe ser texto" });
  }
  // Comentario en blanco = sin comentario.
  const comentario = comentarioRaw?.trim() || null;

  db.prepare(
    `INSERT INTO ingesta_diaria (fecha, kcal, proteina_g, carbohidratos_g, grasas_g, comentario, actualizado_en)
     VALUES (@fecha, @kcal, @proteina_g, @carbohidratos_g, @grasas_g, @comentario, datetime('now'))
     ON CONFLICT(fecha) DO UPDATE SET
       kcal = excluded.kcal,
       proteina_g = excluded.proteina_g,
       carbohidratos_g = excluded.carbohidratos_g,
       grasas_g = excluded.grasas_g,
       comentario = excluded.comentario,
       actualizado_en = datetime('now')`
  ).run({
    fecha: body.fecha,
    kcal: body.kcal,
    proteina_g: body.proteina_g,
    carbohidratos_g: body.carbohidratos_g,
    grasas_g: body.grasas_g,
    comentario,
  });

  const row = db.prepare("SELECT * FROM ingesta_diaria WHERE fecha = ?").get(body.fecha) as IngestaDiaria;
  res.json(row);
});
