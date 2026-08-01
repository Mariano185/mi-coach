import { Router } from "express";
import { db } from "../db.js";
import type { Exercise, ExerciseDetalle } from "../types.js";

export const exercisesRouter = Router();

const DETALLE_COLS = `
  e.*,
  p.nombre AS patron_nombre,
  padre.nombre AS ejercicio_padre_nombre
`;

// GET /api/exercises — catálogo. Por default, forma compacta (no romper al cliente
// actual). ?detalle=full trae todas las columnas de la enciclopedia + músculos +
// variantes por ejercicio, para el coach.
exercisesRouter.get("/", (req, res) => {
  if (req.query.detalle !== "full") {
    const rows = db
      .prepare("SELECT id, nombre, categoria, es_basico FROM exercises ORDER BY es_basico DESC, categoria, nombre")
      .all() as Exercise[];
    return res.json(rows);
  }

  const rows = db
    .prepare(
      `SELECT ${DETALLE_COLS}
       FROM exercises e
       LEFT JOIN patrones p ON p.id = e.patron_id
       LEFT JOIN exercises padre ON padre.id = e.ejercicio_padre_id
       ORDER BY e.es_basico DESC, e.categoria, e.nombre`
    )
    .all() as Array<Omit<ExerciseDetalle, "variantes" | "musculos">>;

  const detalle = rows.map((r) => attachMusculosYVariantes(r));
  res.json(detalle);
});

// GET /api/exercises/:id — un ejercicio con su biomecánica, variantes y grilla
// muscular completa (cada variante lleva la suya, no la hereda del padre).
exercisesRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const row = db
    .prepare(
      `SELECT ${DETALLE_COLS}
       FROM exercises e
       LEFT JOIN patrones p ON p.id = e.patron_id
       LEFT JOIN exercises padre ON padre.id = e.ejercicio_padre_id
       WHERE e.id = ?`
    )
    .get(id) as Omit<ExerciseDetalle, "variantes" | "musculos"> | undefined;
  if (!row) return res.status(404).json({ error: "ejercicio no encontrado" });

  res.json(attachMusculosYVariantes(row));
});

function attachMusculosYVariantes(
  row: Omit<ExerciseDetalle, "variantes" | "musculos">
): ExerciseDetalle {
  const variantes = db
    .prepare("SELECT id, nombre, tipo_variante FROM exercises WHERE ejercicio_padre_id = ? ORDER BY nombre")
    .all(row.id) as ExerciseDetalle["variantes"];

  const musculos = db
    .prepare(
      `SELECT em.musculo_id, m.nombre, m.grupo, em.rol, em.orden, em.fraccion_volumen
       FROM ejercicio_musculos em
       JOIN musculos m ON m.id = em.musculo_id
       WHERE em.exercise_id = ?
       ORDER BY em.orden`
    )
    .all(row.id) as ExerciseDetalle["musculos"];

  return { ...row, variantes, musculos };
}

// POST /api/exercises — agregar un ejercicio a la library. es_basico default 0
// (los básicos son los 3 del seed; no se crean por API). nombre único.
// Los campos de la enciclopedia (biomecánica, patron_id, etc.) no se cargan acá:
// se curan vía el seed (docs/adr/0001, fase 2), no a mano por request suelto.
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
