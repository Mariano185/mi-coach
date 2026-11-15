import { Router } from "express";
import { db } from "../db.js";
import { calendarioDesdeDb } from "../calendario.js";
import { esFecha } from "../validacion/fecha.js";
import type { IngestaDiaria, NutricionDia, PasosDiarios } from "../types.js";

// Vista del día de Nutrición: lo que el atleta comió en una fecha junto con el Objetivo
// nutricional que regía ese día (reglas de fechas del ADR 0003, en calendario.ts).
export const nutricionRouter = Router();

// GET /api/nutricion/dia?fecha=YYYY-MM-DD — { fecha, ingesta | null, objetivo | null, pasos | null }.
nutricionRouter.get("/dia", (req, res) => {
  const { fecha } = req.query;
  if (!esFecha(fecha)) return res.status(400).json({ error: "fecha requerida en formato YYYY-MM-DD" });

  const ingesta = (db.prepare("SELECT * FROM ingesta_diaria WHERE fecha = ?").get(fecha) as
    | IngestaDiaria
    | undefined) ?? null;
  const objetivo = calendarioDesdeDb(db).objetivoEn(fecha);
  const pasos = (db.prepare("SELECT * FROM pasos_diarios WHERE fecha = ?").get(fecha) as
    | PasosDiarios
    | undefined) ?? null;
  res.json({ fecha, ingesta, objetivo, pasos } satisfies NutricionDia);
});
