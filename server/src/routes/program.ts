import { Router } from "express";
import { db } from "../db.js";
import type {
  NewProgramWeekInput,
  ProgramDay,
  ProgramDayDetail,
  ProgramExercise,
  ProgramExerciseDetail,
  ProgramSet,
  ProgramWeek,
  ProgramWeekDetail,
  UpdateProgramSetInput,
} from "../types.js";

export const programRouter = Router();

// Nombre visible de un program_exercise: el de la tabla exercises, o el libre.
const EX_NAME_SQL = "COALESCE(e.nombre, pe.nombre_libre)";

// ---------- SEMANAS ----------

// GET /api/program/weeks — lista de semanas (más reciente primero).
programRouter.get("/weeks", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM program_weeks ORDER BY semana DESC")
    .all() as ProgramWeek[];
  res.json(rows);
});

// GET /api/program/weeks/:id — semana + sus días (con conteos para las cards).
programRouter.get("/weeks/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  const week = db.prepare("SELECT * FROM program_weeks WHERE id = ?").get(id) as
    | ProgramWeek
    | undefined;
  if (!week) return res.status(404).json({ error: "semana no encontrada" });

  const days = db
    .prepare(
      `SELECT
         pd.*,
         (SELECT COUNT(*) FROM program_exercises pe WHERE pe.day_id = pd.id) AS n_ejercicios,
         (SELECT COUNT(*) FROM program_sets ps
            JOIN program_exercises pe ON pe.id = ps.program_exercise_id
            WHERE pe.day_id = pd.id) AS n_series,
         (SELECT COUNT(*) FROM program_sets ps
            JOIN program_exercises pe ON pe.id = ps.program_exercise_id
            WHERE pe.day_id = pd.id AND ps.hecha = 1) AS n_series_hechas,
         (SELECT GROUP_CONCAT(${EX_NAME_SQL}, ' · ')
            FROM program_exercises pe
            LEFT JOIN exercises e ON e.id = pe.exercise_id
            WHERE pe.day_id = pd.id AND pe.seccion = 'main') AS nombre_ejercicios
       FROM program_days pd
       WHERE pd.week_id = ?
       ORDER BY pd.orden, pd.dia`
    )
    .all(id);

  const detail: ProgramWeekDetail = {
    ...week,
    days: days as ProgramWeekDetail["days"],
  };
  res.json(detail);
});

// ---------- DÍAS ----------

// GET /api/program/days/:id — día + ejercicios (con conteos de series).
programRouter.get("/days/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const day = db
    .prepare(
      `SELECT pd.*, pw.semana, pw.nombre AS nombre_semana
       FROM program_days pd JOIN program_weeks pw ON pw.id = pd.week_id
       WHERE pd.id = ?`
    )
    .get(id) as (ProgramDay & { semana: number; nombre_semana: string | null }) | undefined;
  if (!day) return res.status(404).json({ error: "día no encontrado" });

  const exercises = db
    .prepare(
      `SELECT
         pe.*,
         ${EX_NAME_SQL} AS nombre,
         COALESCE(e.es_basico, 0) AS es_basico,
         (SELECT COUNT(*) FROM program_sets ps WHERE ps.program_exercise_id = pe.id) AS n_series,
         (SELECT COUNT(*) FROM program_sets ps WHERE ps.program_exercise_id = pe.id AND ps.hecha = 1) AS n_series_hechas
       FROM program_exercises pe
       LEFT JOIN exercises e ON e.id = pe.exercise_id
       WHERE pe.day_id = ?
       ORDER BY pe.orden, pe.id`
    )
    .all(id);

  const detail: ProgramDayDetail = {
    ...(day as ProgramDay),
    semana: day.semana,
    nombre_semana: day.nombre_semana,
    exercises: exercises as ProgramDayDetail["exercises"],
  };
  res.json(detail);
});

// POST /api/program/days/:id/complete — vuelca las series REALES a sessions/sets.
// Idempotente: si el día ya tiene session_id, reusa esa sesión (borra sus sets y reinserta).
programRouter.post("/days/:id/complete", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const day = db.prepare("SELECT * FROM program_days WHERE id = ?").get(id) as
    | ProgramDay
    | undefined;
  if (!day) return res.status(404).json({ error: "día no encontrado" });
  if (!day.tipo) return res.status(400).json({ error: "el día no tiene tipo A/B; no se puede registrar" });

  // Series completadas (con peso y reps reales) de ejercicios con exercise_id válido.
  const done = db
    .prepare(
      `SELECT pe.exercise_id, ps.real_peso, ps.real_reps, ps.real_rpe, ps.n_serie, ps.notas
       FROM program_sets ps
       JOIN program_exercises pe ON pe.id = ps.program_exercise_id
       WHERE pe.day_id = ? AND ps.hecha = 1
         AND ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL
         AND pe.exercise_id IS NOT NULL
       ORDER BY pe.orden, ps.n_serie`
    )
    .all(id) as Array<{
    exercise_id: number;
    real_peso: number;
    real_reps: number;
    real_rpe: number | null;
    n_serie: number;
    notas: string | null;
  }>;

  if (done.length === 0) {
    return res.status(400).json({ error: "no hay series completadas con peso y reps reales" });
  }

  const body = (req.body ?? {}) as {
    fecha?: string;
    energia?: number | null;
    sueno_horas?: number | null;
    motivacion?: number | null;
    dolor_molestias?: string | null;
    comentarios?: string | null;
  };
  const fecha =
    body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)
      ? body.fecha
      : day.fecha_plan ?? new Date().toISOString().slice(0, 10);

  const tx = db.transaction(() => {
    let sessionId = day.session_id;
    if (sessionId) {
      db.prepare("DELETE FROM sets WHERE session_id = ?").run(sessionId);
      db.prepare(
        `UPDATE sessions SET fecha=@fecha, tipo=@tipo, energia=@energia, sueno_horas=@sueno_horas,
           motivacion=@motivacion, dolor_molestias=@dolor_molestias, comentarios=@comentarios WHERE id=@id`
      ).run({
        id: sessionId,
        fecha,
        tipo: day.tipo,
        energia: body.energia ?? null,
        sueno_horas: body.sueno_horas ?? null,
        motivacion: body.motivacion ?? null,
        dolor_molestias: body.dolor_molestias ?? null,
        comentarios: body.comentarios ?? `Día ${day.dia} del programa.`,
      });
    } else {
      sessionId = db
        .prepare(
          `INSERT INTO sessions (fecha, tipo, energia, sueno_horas, motivacion, dolor_molestias, comentarios)
           VALUES (@fecha, @tipo, @energia, @sueno_horas, @motivacion, @dolor_molestias, @comentarios)`
        )
        .run({
          fecha,
          tipo: day.tipo,
          energia: body.energia ?? null,
          sueno_horas: body.sueno_horas ?? null,
          motivacion: body.motivacion ?? null,
          dolor_molestias: body.dolor_molestias ?? null,
          comentarios: body.comentarios ?? `Día ${day.dia} del programa.`,
        }).lastInsertRowid as number;
      db.prepare("UPDATE program_days SET session_id = ? WHERE id = ?").run(sessionId, id);
    }

    const insSet = db.prepare(
      `INSERT INTO sets (session_id, exercise_id, n_serie, peso_kg, reps, rpe, rir, notas)
       VALUES (@session_id, @exercise_id, @n_serie, @peso_kg, @reps, @rpe, @rir, @notas)`
    );
    for (const d of done) {
      insSet.run({
        session_id: sessionId,
        exercise_id: d.exercise_id,
        n_serie: d.n_serie,
        peso_kg: d.real_peso,
        reps: d.real_reps,
        rpe: d.real_rpe,
        rir: d.real_rpe != null ? Math.max(0, Math.round(10 - d.real_rpe)) : null,
        notas: d.notas,
      });
    }
    return sessionId;
  });

  const sessionId = tx();
  res.status(201).json({ session_id: sessionId, sets: done.length });
});

// ---------- EJERCICIOS ----------

// GET /api/program/exercises/:id — ejercicio + sus series (target+real, e1rm/tonelaje).
programRouter.get("/exercises/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const ex = db
    .prepare(
      `SELECT pe.*, ${EX_NAME_SQL} AS nombre, COALESCE(e.es_basico,0) AS es_basico,
              pd.dia, pd.tipo
       FROM program_exercises pe
       LEFT JOIN exercises e ON e.id = pe.exercise_id
       JOIN program_days pd ON pd.id = pe.day_id
       WHERE pe.id = ?`
    )
    .get(id) as
    | (ProgramExercise & { nombre: string; es_basico: 0 | 1; dia: number; tipo: "A" | "B" | null })
    | undefined;
  if (!ex) return res.status(404).json({ error: "ejercicio no encontrado" });

  const sets = db
    .prepare(
      "SELECT * FROM v_program_sets_e1rm WHERE program_exercise_id = ? ORDER BY n_serie"
    )
    .all(id);

  const detail: ProgramExerciseDetail = {
    ...(ex as ProgramExercise),
    nombre: ex.nombre,
    es_basico: ex.es_basico,
    dia: ex.dia,
    tipo: ex.tipo,
    sets: sets as ProgramExerciseDetail["sets"],
  };
  res.json(detail);
});

// ---------- SERIES ----------

// PATCH /api/program/sets/:id — completar/editar valores reales de una serie.
programRouter.patch("/sets/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const set = db.prepare("SELECT * FROM program_sets WHERE id = ?").get(id) as
    | ProgramSet
    | undefined;
  if (!set) return res.status(404).json({ error: "serie no encontrada" });

  const body = (req.body ?? {}) as UpdateProgramSetInput;

  const num = (v: unknown): number | null | undefined =>
    v === undefined ? undefined : v === null ? null : Number(v);
  for (const [k, v] of Object.entries({
    real_peso: num(body.real_peso),
    real_reps: num(body.real_reps),
    real_rpe: num(body.real_rpe),
  })) {
    if (v !== undefined && v !== null && (!Number.isFinite(v) || v < 0)) {
      return res.status(400).json({ error: `${k} inválido` });
    }
  }

  const next = {
    real_peso: body.real_peso !== undefined ? num(body.real_peso) : set.real_peso,
    real_reps: body.real_reps !== undefined ? num(body.real_reps) : set.real_reps,
    real_rpe: body.real_rpe !== undefined ? num(body.real_rpe) : set.real_rpe,
    notas: body.notas !== undefined ? body.notas : set.notas,
    hecha:
      body.hecha !== undefined
        ? body.hecha
          ? 1
          : 0
        : // auto: si tiene peso y reps reales, marcar hecha.
          (body.real_peso ?? set.real_peso) != null && (body.real_reps ?? set.real_reps) != null
        ? 1
        : set.hecha,
  };

  db.prepare(
    `UPDATE program_sets
       SET real_peso=@real_peso, real_reps=@real_reps, real_rpe=@real_rpe, notas=@notas, hecha=@hecha
       WHERE id=@id`
  ).run({ id, ...next });

  const updated = db
    .prepare("SELECT * FROM v_program_sets_e1rm WHERE id = ?")
    .get(id);
  res.json(updated);
});

// ---------- CREAR SEMANA (la usa el coach / skill nueva-semana) ----------

// POST /api/program/weeks — crea una semana estructurada completa.
programRouter.post("/weeks", (req, res) => {
  const body = req.body as NewProgramWeekInput;
  if (!body || !Number.isInteger(body.semana)) {
    return res.status(400).json({ error: "semana requerida (entero)" });
  }
  if (!Array.isArray(body.days) || body.days.length === 0) {
    return res.status(400).json({ error: "la semana necesita al menos un día" });
  }
  const dup = db.prepare("SELECT 1 FROM program_weeks WHERE semana = ?").get(body.semana);
  if (dup) return res.status(409).json({ error: `la semana ${body.semana} ya existe` });

  const insWeek = db.prepare(
    `INSERT INTO program_weeks (semana, nombre, bloque, notas, fecha_creada, activa)
     VALUES (@semana, @nombre, @bloque, @notas, @fecha_creada, 1)`
  );
  const insDay = db.prepare(
    `INSERT INTO program_days (week_id, dia, tipo, titulo, warmup, fecha_plan, orden)
     VALUES (@week_id, @dia, @tipo, @titulo, @warmup, @fecha_plan, @orden)`
  );
  const insEx = db.prepare(
    `INSERT INTO program_exercises (day_id, exercise_id, nombre_libre, seccion, reps_text, carga_text, rpe_text, notas, orden)
     VALUES (@day_id, @exercise_id, @nombre_libre, @seccion, @reps_text, @carga_text, @rpe_text, @notas, @orden)`
  );
  const insSet = db.prepare(
    `INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, target_rpe)
     VALUES (@program_exercise_id, @n_serie, @target_reps, @target_rpe)`
  );

  const tx = db.transaction((input: NewProgramWeekInput) => {
    const weekId = insWeek.run({
      semana: input.semana,
      nombre: input.nombre ?? null,
      bloque: input.bloque ?? null,
      notas: input.notas ?? null,
      fecha_creada: new Date().toISOString().slice(0, 10),
    }).lastInsertRowid as number;

    input.days.forEach((d, di) => {
      const dayId = insDay.run({
        week_id: weekId,
        dia: d.dia,
        tipo: d.tipo ?? null,
        titulo: d.titulo ?? null,
        warmup: d.warmup ?? null,
        fecha_plan: d.fecha_plan ?? null,
        orden: di,
      }).lastInsertRowid as number;

      d.exercises.forEach((ex, ei) => {
        const exId = insEx.run({
          day_id: dayId,
          exercise_id: ex.exercise_id ?? null,
          nombre_libre: ex.nombre_libre ?? null,
          seccion: ex.seccion ?? "accesorio",
          reps_text: ex.reps_text ?? null,
          carga_text: ex.carga_text ?? null,
          rpe_text: ex.rpe_text ?? null,
          notas: ex.notas ?? null,
          orden: ei,
        }).lastInsertRowid as number;

        for (const s of ex.sets) {
          insSet.run({
            program_exercise_id: exId,
            n_serie: s.n_serie,
            target_reps: s.target_reps ?? null,
            target_rpe: s.target_rpe ?? null,
          });
        }
      });
    });
    return weekId;
  });

  const weekId = tx(body);
  res.status(201).json({ id: weekId });
});
