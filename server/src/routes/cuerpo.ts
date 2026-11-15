import { Router } from "express";
import { db } from "../db.js";
import { esFecha } from "../validacion/fecha.js";
import type { RegistroCorporal, UpsertRegistroCorporalInput } from "../types.js";

// Registro corporal: lo que el atleta mide de su cuerpo en una fecha (GLOSSARY.md). El peso
// siempre; los Perímetros (brazo, pierna, abdomen, en cm) cuando corresponde. Uno por fecha;
// volver a cargarlo lo corrige.
export const cuerpoRouter = Router();

const PERIMETROS = ["brazo_cm", "pierna_cm", "abdomen_cm"] as const;

function esPositivo(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

// GET /api/cuerpo?fecha=YYYY-MM-DD — el registro de esa fecha, o null si no hay.
// GET /api/cuerpo                  — todos los registros, ascendente (para graficar y
//                                    buscar los últimos perímetros cargados).
cuerpoRouter.get("/", (req, res) => {
  const { fecha } = req.query;
  if (fecha !== undefined) {
    if (!esFecha(fecha)) return res.status(400).json({ error: "fecha debe tener formato YYYY-MM-DD" });
    const row = db.prepare("SELECT * FROM registro_corporal WHERE fecha = ?").get(fecha) as
      | RegistroCorporal
      | undefined;
    return res.json(row ?? null);
  }
  const rows = db.prepare("SELECT * FROM registro_corporal ORDER BY fecha ASC").all() as RegistroCorporal[];
  res.json(rows);
});

// PUT /api/cuerpo — upsert por fecha: crea el registro o lo reemplaza entero (un perímetro o
// las notas que no vienen quedan en null, igual que la Ingesta diaria).
cuerpoRouter.put("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<Record<keyof UpsertRegistroCorporalInput, unknown>>;

  if (!esFecha(body.fecha)) {
    return res.status(400).json({ error: "fecha requerida en formato YYYY-MM-DD" });
  }
  if (!esPositivo(body.peso_kg)) {
    return res.status(400).json({ error: "peso_kg es obligatorio y debe ser mayor a 0" });
  }
  const perimetros = {} as Record<(typeof PERIMETROS)[number], number | null>;
  for (const key of PERIMETROS) {
    const v = body[key] ?? null;
    if (v !== null && !esPositivo(v)) {
      return res.status(400).json({ error: `${key} es opcional, pero si viene debe ser mayor a 0` });
    }
    perimetros[key] = v;
  }
  const notasRaw = body.notas ?? null;
  if (notasRaw !== null && typeof notasRaw !== "string") {
    return res.status(400).json({ error: "notas debe ser texto" });
  }
  const notas = notasRaw?.trim() || null;

  db.prepare(
    `INSERT INTO registro_corporal (fecha, peso_kg, brazo_cm, pierna_cm, abdomen_cm, notas, actualizado_en)
     VALUES (@fecha, @peso_kg, @brazo_cm, @pierna_cm, @abdomen_cm, @notas, datetime('now'))
     ON CONFLICT(fecha) DO UPDATE SET
       peso_kg = excluded.peso_kg,
       brazo_cm = excluded.brazo_cm,
       pierna_cm = excluded.pierna_cm,
       abdomen_cm = excluded.abdomen_cm,
       notas = excluded.notas,
       actualizado_en = datetime('now')`
  ).run({ fecha: body.fecha, peso_kg: body.peso_kg, ...perimetros, notas });

  const row = db.prepare("SELECT * FROM registro_corporal WHERE fecha = ?").get(body.fecha) as RegistroCorporal;
  res.json(row);
});
