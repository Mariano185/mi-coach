import { Router } from "express";
import { db } from "../db.js";
import type { NewSessionInput, Session, SessionWithSets } from "../types.js";

export const sessionsRouter = Router();

function isInt1to10(v: unknown): boolean {
  return v == null || (typeof v === "number" && v >= 1 && v <= 10);
}

// GET /api/sessions — lista, más reciente primero.
sessionsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM sessions ORDER BY fecha DESC, id DESC")
    .all() as Session[];
  res.json(rows);
});

// GET /api/sessions/:id — sesión con sus sets (incluye nombre de ejercicio y e1RM).
sessionsRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Session | undefined;
  if (!session) return res.status(404).json({ error: "sesión no encontrada" });

  const sets = db
    .prepare(
      `SELECT v.*, e.nombre AS exercise_nombre
       FROM v_sets_e1rm v
       JOIN exercises e ON e.id = v.exercise_id
       WHERE v.session_id = ?
       ORDER BY v.id`
    )
    .all(id);

  const result: SessionWithSets = { ...session, sets: sets as SessionWithSets["sets"] };
  res.json(result);
});

// POST /api/sessions — crea sesión + sus sets en una transacción.
sessionsRouter.post("/", (req, res) => {
  const body = req.body as NewSessionInput;

  if (!body || typeof body.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
    return res.status(400).json({ error: "fecha requerida en formato YYYY-MM-DD" });
  }
  if (body.tipo !== "A" && body.tipo !== "B") {
    return res.status(400).json({ error: "tipo debe ser 'A' o 'B'" });
  }
  if (!isInt1to10(body.energia) || !isInt1to10(body.motivacion)) {
    return res.status(400).json({ error: "energia/motivacion deben estar entre 1 y 10" });
  }
  if (!Array.isArray(body.sets) || body.sets.length === 0) {
    return res.status(400).json({ error: "la sesión necesita al menos un set" });
  }

  // Validar cada set y que el ejercicio exista.
  const exExists = db.prepare("SELECT 1 FROM exercises WHERE id = ?");
  for (const s of body.sets) {
    if (!Number.isInteger(s.exercise_id) || !exExists.get(s.exercise_id)) {
      return res.status(400).json({ error: `exercise_id inválido: ${s.exercise_id}` });
    }
    if (typeof s.peso_kg !== "number" || s.peso_kg < 0) {
      return res.status(400).json({ error: "peso_kg inválido" });
    }
    if (!Number.isInteger(s.reps) || s.reps <= 0) {
      return res.status(400).json({ error: "reps inválido" });
    }
  }

  const insertSession = db.prepare(
    `INSERT INTO sessions (fecha, tipo, energia, sueno_horas, motivacion, dolor_molestias, comentarios)
     VALUES (@fecha, @tipo, @energia, @sueno_horas, @motivacion, @dolor_molestias, @comentarios)`
  );
  const insertSet = db.prepare(
    `INSERT INTO sets (session_id, exercise_id, n_serie, peso_kg, reps, rpe, rir, notas)
     VALUES (@session_id, @exercise_id, @n_serie, @peso_kg, @reps, @rpe, @rir, @notas)`
  );

  const tx = db.transaction((input: NewSessionInput) => {
    const result = insertSession.run({
      fecha: input.fecha,
      tipo: input.tipo,
      energia: input.energia ?? null,
      sueno_horas: input.sueno_horas ?? null,
      motivacion: input.motivacion ?? null,
      dolor_molestias: input.dolor_molestias ?? null,
      comentarios: input.comentarios ?? null,
    });
    const sessionId = result.lastInsertRowid as number;
    for (const s of input.sets) {
      insertSet.run({
        session_id: sessionId,
        exercise_id: s.exercise_id,
        n_serie: s.n_serie,
        peso_kg: s.peso_kg,
        reps: s.reps,
        rpe: s.rpe ?? null,
        rir: s.rir ?? null,
        notas: s.notas ?? null,
      });
    }
    return sessionId;
  });

  const newId = tx(body);
  res.status(201).json({ id: newId });
});
