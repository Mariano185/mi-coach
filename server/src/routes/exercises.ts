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

// POST /api/exercises — agregar un ejercicio a la library. es_basico default 0
// (los básicos son los 3 del seed; no se crean por API). nombre único.
exercisesRouter.post("/", (req, res) => {
  const body = (req.body ?? {}) as {
    nombre?: unknown;
    categoria?: unknown;
    es_basico?: unknown;
  };
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const categoria = typeof body.categoria === "string" ? body.categoria.trim() : "";
  if (!nombre) return res.status(400).json({ error: "nombre requerido" });
  if (!categoria) return res.status(400).json({ error: "categoria requerida" });
  const es_basico = body.es_basico ? 1 : 0;

  const dup = db.prepare("SELECT 1 FROM exercises WHERE nombre = ?").get(nombre);
  if (dup) return res.status(409).json({ error: `ya existe un ejercicio "${nombre}"` });

  const id = db
    .prepare("INSERT INTO exercises (nombre, categoria, es_basico) VALUES (?, ?, ?)")
    .run(nombre, categoria, es_basico).lastInsertRowid as number;

  res.status(201).json({ id, nombre, categoria, es_basico } as Exercise);
});
