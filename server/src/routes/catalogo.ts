import { Router } from "express";
import { db } from "../db.js";
import type { Musculo, Patron } from "../types.js";

export const catalogoRouter = Router();

const GRUPOS_MUSCULO = ["pecho", "espalda", "hombro", "brazo", "pierna", "core"] as const;

// GET /api/musculos?grupo=pierna — catálogo canónico de músculos (48), con
// n_ejercicios (cuántos del catálogo lo tocan) para que el coach vea de un
// vistazo los huecos: un músculo con n_ejercicios=0 no tiene forma de
// entrenarse todavía con el catálogo actual.
catalogoRouter.get("/musculos", (req, res) => {
  const grupo = req.query.grupo;
  if (grupo !== undefined && !GRUPOS_MUSCULO.includes(grupo as (typeof GRUPOS_MUSCULO)[number])) {
    return res.status(400).json({ error: `grupo debe ser uno de: ${GRUPOS_MUSCULO.join(", ")}` });
  }

  const rows = db
    .prepare(
      `SELECT m.id, m.nombre, m.nombre_en, m.grupo, m.region, m.biarticular,
              COUNT(em.exercise_id) AS n_ejercicios
       FROM musculos m
       LEFT JOIN ejercicio_musculos em ON em.musculo_id = m.id
       WHERE @grupo IS NULL OR m.grupo = @grupo
       GROUP BY m.id
       ORDER BY m.grupo, m.nombre`
    )
    .all({ grupo: grupo ?? null }) as Musculo[];

  res.json(rows);
});

// GET /api/patrones — catálogo canónico de patrones de movimiento (20).
catalogoRouter.get("/patrones", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.nombre, p.plano, p.descripcion,
              COUNT(e.id) AS n_ejercicios
       FROM patrones p
       LEFT JOIN exercises e ON e.patron_id = p.id
       GROUP BY p.id
       ORDER BY p.id`
    )
    .all() as Patron[];

  res.json(rows);
});
