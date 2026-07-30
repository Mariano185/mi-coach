import { Router } from "express";
import { db } from "../db.js";
import type {
  Mesociclo,
  MesocicloConSemanas,
  NewMesocicloInput,
  ProgramWeek,
  UpdateMesocicloInput,
} from "../types.js";

export const mesociclosRouter = Router();

// GET /api/mesociclos — lista con conteo de semanas por mesociclo.
mesociclosRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*,
         (SELECT COUNT(*) FROM program_weeks pw WHERE pw.mesociclo_id = m.id) AS n_semanas
       FROM mesociclos m
       ORDER BY m.orden DESC, m.id DESC`
    )
    .all() as MesocicloConSemanas[];
  res.json(rows);
});

// GET /api/mesociclos/:id — mesociclo + sus semanas (orden ascendente).
mesociclosRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const mesociclo = db.prepare("SELECT * FROM mesociclos WHERE id = ?").get(id) as
    | Mesociclo
    | undefined;
  if (!mesociclo) return res.status(404).json({ error: "mesociclo no encontrado" });

  const semanas = db
    .prepare("SELECT * FROM program_weeks WHERE mesociclo_id = ? ORDER BY semana ASC")
    .all(id) as ProgramWeek[];

  res.json({ ...mesociclo, semanas });
});

// POST /api/mesociclos — crea un mesociclo nuevo.
mesociclosRouter.post("/", (req, res) => {
  const body = (req.body ?? {}) as NewMesocicloInput;
  if (!body.nombre || typeof body.nombre !== "string") {
    return res.status(400).json({ error: "nombre requerido" });
  }

  const id = db
    .prepare(
      `INSERT INTO mesociclos (nombre, objetivo, notas, fecha_inicio, fecha_fin, orden, fecha_creada)
       VALUES (@nombre, @objetivo, @notas, @fecha_inicio, @fecha_fin, @orden, @fecha_creada)`
    )
    .run({
      nombre: body.nombre,
      objetivo: body.objetivo ?? null,
      notas: body.notas ?? null,
      fecha_inicio: body.fecha_inicio ?? null,
      fecha_fin: body.fecha_fin ?? null,
      orden: 0,
      fecha_creada: new Date().toISOString().slice(0, 10),
    }).lastInsertRowid as number;

  const created = db.prepare("SELECT * FROM mesociclos WHERE id = ?").get(id);
  res.status(201).json(created);
});

// PATCH /api/mesociclos/:id — edita metadata del mesociclo. Solo pisa campos presentes.
mesociclosRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const mesociclo = db.prepare("SELECT * FROM mesociclos WHERE id = ?").get(id) as
    | Mesociclo
    | undefined;
  if (!mesociclo) return res.status(404).json({ error: "mesociclo no encontrado" });

  const body = (req.body ?? {}) as UpdateMesocicloInput;
  if (body.nombre !== undefined && (!body.nombre || typeof body.nombre !== "string")) {
    return res.status(400).json({ error: "nombre inválido" });
  }

  const pick = <T>(v: T | undefined, cur: T): T => (v !== undefined ? v : cur);
  const next = {
    nombre: pick(body.nombre, mesociclo.nombre),
    objetivo: pick(body.objetivo, mesociclo.objetivo),
    notas: pick(body.notas, mesociclo.notas),
    fecha_inicio: pick(body.fecha_inicio, mesociclo.fecha_inicio),
    fecha_fin: pick(body.fecha_fin, mesociclo.fecha_fin),
    orden: pick(body.orden, mesociclo.orden),
  };

  db.prepare(
    `UPDATE mesociclos
       SET nombre=@nombre, objetivo=@objetivo, notas=@notas,
           fecha_inicio=@fecha_inicio, fecha_fin=@fecha_fin, orden=@orden
       WHERE id=@id`
  ).run({ id, ...next });

  const updated = db.prepare("SELECT * FROM mesociclos WHERE id = ?").get(id);
  res.json(updated);
});

// DELETE /api/mesociclos/:id — borra el mesociclo. Las semanas quedan con
// mesociclo_id = NULL (ON DELETE SET NULL en el FK), nunca se borran.
mesociclosRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const mesociclo = db.prepare("SELECT 1 FROM mesociclos WHERE id = ?").get(id);
  if (!mesociclo) return res.status(404).json({ error: "mesociclo no encontrado" });

  db.prepare("DELETE FROM mesociclos WHERE id = ?").run(id);
  res.json({ ok: true });
});
