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
  ReorderExercisesInput,
  UpdateProgramSetInput,
  UpdateProgramSetTargetInput,
} from "../types.js";

export const programRouter = Router();

// Nombre visible de un program_exercise: el de la tabla exercises, o el libre.
const EX_NAME_SQL = "COALESCE(e.nombre, pe.nombre_libre)";

// Ejercicios de un día con sus conteos de series (programadas/hechas). Compartido entre
// GET /days/:id y POST /days/:id/exercises/reorder para no duplicar el SQL.
const EXERCISES_DEL_DIA_SQL = `
  SELECT
    pe.*,
    ${EX_NAME_SQL} AS nombre,
    COALESCE(e.es_basico, 0) AS es_basico,
    (SELECT COUNT(*) FROM program_sets ps WHERE ps.program_exercise_id = pe.id) AS n_series,
    (SELECT COUNT(*) FROM program_sets ps WHERE ps.program_exercise_id = pe.id AND ps.hecha = 1) AS n_series_hechas
  FROM program_exercises pe
  LEFT JOIN exercises e ON e.id = pe.exercise_id
  WHERE pe.day_id = ?
  ORDER BY pe.orden, pe.id`;

// ---------- SEMANAS ----------

// GET /api/program/weeks — lista de semanas (más reciente primero).
// ?mesociclo_id=N filtra por mesociclo; ?mesociclo_id=null filtra las huérfanas.
// Sin el query param, devuelve todas (retrocompatible con el coach).
programRouter.get("/weeks", (req, res) => {
  const { mesociclo_id } = req.query;
  let rows: ProgramWeek[];
  if (mesociclo_id === "null") {
    rows = db
      .prepare("SELECT * FROM program_weeks WHERE mesociclo_id IS NULL ORDER BY semana DESC")
      .all() as ProgramWeek[];
  } else if (mesociclo_id !== undefined) {
    const id = Number(mesociclo_id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "mesociclo_id inválido" });
    rows = db
      .prepare("SELECT * FROM program_weeks WHERE mesociclo_id = ? ORDER BY semana DESC")
      .all(id) as ProgramWeek[];
  } else {
    rows = db.prepare("SELECT * FROM program_weeks ORDER BY semana DESC").all() as ProgramWeek[];
  }
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
         (SELECT GROUP_CONCAT(nom, ' · ') FROM (
            SELECT ${EX_NAME_SQL} AS nom
            FROM program_exercises pe
            LEFT JOIN exercises e ON e.id = pe.exercise_id
            WHERE pe.day_id = pd.id AND pe.seccion = 'main'
            ORDER BY pe.orden, pe.id
          )) AS nombre_ejercicios
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

// PATCH /api/program/weeks/:id — reasignar una semana a otro mesociclo y/o renumerarla.
// Es la vía para acomodar semanas huérfanas (creadas antes de que existieran los mesociclos).
programRouter.patch("/weeks/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const week = db.prepare("SELECT * FROM program_weeks WHERE id = ?").get(id) as
    | ProgramWeek
    | undefined;
  if (!week) return res.status(404).json({ error: "semana no encontrada" });

  const body = (req.body ?? {}) as {
    semana?: number;
    mesociclo_id?: number | null;
    nombre?: string | null;
    bloque?: string | null;
    notas?: string | null;
  };

  if (body.semana !== undefined && !Number.isInteger(body.semana)) {
    return res.status(400).json({ error: "semana debe ser un entero" });
  }
  if (body.mesociclo_id !== undefined && body.mesociclo_id !== null) {
    const ok = db.prepare("SELECT 1 FROM mesociclos WHERE id = ?").get(body.mesociclo_id);
    if (!ok) return res.status(400).json({ error: `mesociclo_id inválido: ${body.mesociclo_id}` });
  }

  const pick = <T>(v: T | undefined, cur: T): T => (v !== undefined ? v : cur);
  const next = {
    semana: pick(body.semana, week.semana),
    mesociclo_id: pick(body.mesociclo_id, week.mesociclo_id),
    nombre: pick(body.nombre, week.nombre),
    bloque: pick(body.bloque, week.bloque),
    notas: pick(body.notas, week.notas),
  };

  const dup = db
    .prepare("SELECT 1 FROM program_weeks WHERE semana = ? AND mesociclo_id IS ? AND id != ?")
    .get(next.semana, next.mesociclo_id, id);
  if (dup) {
    return res
      .status(409)
      .json({ error: `ya existe la semana ${next.semana} en ese mesociclo` });
  }

  db.prepare(
    `UPDATE program_weeks
       SET semana=@semana, mesociclo_id=@mesociclo_id, nombre=@nombre, bloque=@bloque, notas=@notas
       WHERE id=@id`
  ).run({ id, ...next });

  const updated = db.prepare("SELECT * FROM program_weeks WHERE id = ?").get(id);
  res.json(updated);
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

  const exercises = db.prepare(EXERCISES_DEL_DIA_SQL).all(id);

  const detail: ProgramDayDetail = {
    ...(day as ProgramDay),
    semana: day.semana,
    nombre_semana: day.nombre_semana,
    exercises: exercises as ProgramDayDetail["exercises"],
  };
  res.json(detail);
});

// PATCH /api/program/days/:id — editar metadata del día.
// No toca ejercicios ni series. Solo pisa los campos presentes en el body.
// fecha normalmente se autosetea sola (ver PATCH /sets/:id) pero queda editable a mano
// para corregir cargas en diferido.
programRouter.patch("/days/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const day = db.prepare("SELECT * FROM program_days WHERE id = ?").get(id) as
    | ProgramDay
    | undefined;
  if (!day) return res.status(404).json({ error: "día no encontrado" });

  const body = (req.body ?? {}) as {
    titulo?: string | null;
    warmup?: string | null;
    notas?: string | null;
    notas_atleta?: string | null;
    fecha?: string | null;
    hora_inicio?: string | null;
    hora_fin?: string | null;
  };

  const pick = <T>(v: T | undefined, cur: T): T => (v !== undefined ? v : cur);
  const next = {
    titulo: pick(body.titulo, day.titulo),
    warmup: pick(body.warmup, day.warmup),
    notas: pick(body.notas, day.notas),
    notas_atleta: pick(body.notas_atleta, day.notas_atleta),
    fecha: pick(body.fecha, day.fecha),
    hora_inicio: pick(body.hora_inicio, day.hora_inicio),
    hora_fin: pick(body.hora_fin, day.hora_fin),
  };

  db.prepare(
    `UPDATE program_days
       SET titulo=@titulo, warmup=@warmup, notas=@notas, notas_atleta=@notas_atleta,
           fecha=@fecha, hora_inicio=@hora_inicio, hora_fin=@hora_fin
       WHERE id=@id`
  ).run({ id, ...next });

  const updated = db.prepare("SELECT * FROM program_days WHERE id = ?").get(id);
  res.json(updated);
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
    | (ProgramExercise & { nombre: string; es_basico: 0 | 1; dia: number; tipo: string | null })
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

// PATCH /api/program/exercises/:id — swap/editar un ejercicio ya prescrito.
// Permite cambiar el exercise_id (ej: Leg Curl → RDL), nombre libre, sección,
// y los textos objetivo (reps/carga/rpe) y notas. No toca las series target/real.
programRouter.patch("/exercises/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const ex = db.prepare("SELECT * FROM program_exercises WHERE id = ?").get(id) as
    | ProgramExercise
    | undefined;
  if (!ex) return res.status(404).json({ error: "ejercicio no encontrado" });

  const body = (req.body ?? {}) as {
    exercise_id?: number | null;
    nombre_libre?: string | null;
    seccion?: string;
    reps_text?: string | null;
    carga_text?: string | null;
    rpe_text?: string | null;
    notas?: string | null;
  };

  // Si mandan exercise_id (no null), validar que exista en la library.
  if (body.exercise_id !== undefined && body.exercise_id !== null) {
    const ok = db.prepare("SELECT 1 FROM exercises WHERE id = ?").get(body.exercise_id);
    if (!ok) return res.status(400).json({ error: `exercise_id inválido: ${body.exercise_id}` });
  }
  if (body.seccion !== undefined && !["main", "accesorio", "core"].includes(body.seccion)) {
    return res.status(400).json({ error: "seccion debe ser main|accesorio|core" });
  }

  // Merge: solo pisa los campos presentes en el body (undefined = no tocar).
  const pick = <T>(v: T | undefined, cur: T): T => (v !== undefined ? v : cur);
  const next = {
    exercise_id: pick(body.exercise_id, ex.exercise_id),
    nombre_libre: pick(body.nombre_libre, ex.nombre_libre),
    seccion: pick(body.seccion, ex.seccion),
    reps_text: pick(body.reps_text, ex.reps_text),
    carga_text: pick(body.carga_text, ex.carga_text),
    rpe_text: pick(body.rpe_text, ex.rpe_text),
    notas: pick(body.notas, ex.notas),
  };

  db.prepare(
    `UPDATE program_exercises
       SET exercise_id=@exercise_id, nombre_libre=@nombre_libre, seccion=@seccion,
           reps_text=@reps_text, carga_text=@carga_text, rpe_text=@rpe_text, notas=@notas
       WHERE id=@id`
  ).run({ id, ...next });

  const updated = db
    .prepare(
      `SELECT pe.*, ${EX_NAME_SQL} AS nombre, COALESCE(e.es_basico,0) AS es_basico
       FROM program_exercises pe
       LEFT JOIN exercises e ON e.id = pe.exercise_id
       WHERE pe.id = ?`
    )
    .get(id);
  res.json(updated);
});

// POST /api/program/days/:id/exercises — agregar un ejercicio a un día existente.
// Body igual al objeto exercises[] de POST /program/weeks.
programRouter.post("/days/:id/exercises", (req, res) => {
  const dayId = Number(req.params.id);
  if (!Number.isInteger(dayId)) return res.status(400).json({ error: "id inválido" });

  const day = db.prepare("SELECT 1 FROM program_days WHERE id = ?").get(dayId);
  if (!day) return res.status(404).json({ error: "día no encontrado" });

  const body = (req.body ?? {}) as {
    exercise_id?: number | null;
    nombre_libre?: string | null;
    seccion?: string;
    reps_text?: string | null;
    carga_text?: string | null;
    rpe_text?: string | null;
    notas?: string | null;
    sets?: Array<{
      n_serie: number;
      target_reps?: number | null;
      target_rpe?: number | null;
      target_peso?: number | null;
    }>;
  };

  if (body.exercise_id != null) {
    const ok = db.prepare("SELECT 1 FROM exercises WHERE id = ?").get(body.exercise_id);
    if (!ok) return res.status(400).json({ error: `exercise_id inválido: ${body.exercise_id}` });
  }
  const seccion = body.seccion ?? "accesorio";
  if (!["main", "accesorio", "core"].includes(seccion)) {
    return res.status(400).json({ error: "seccion debe ser main|accesorio|core" });
  }

  const maxOrden = db
    .prepare("SELECT COALESCE(MAX(orden),0) AS m FROM program_exercises WHERE day_id = ?")
    .get(dayId) as { m: number };

  const insEx = db.prepare(
    `INSERT INTO program_exercises (day_id, exercise_id, nombre_libre, seccion, reps_text, carga_text, rpe_text, notas, orden)
     VALUES (@day_id, @exercise_id, @nombre_libre, @seccion, @reps_text, @carga_text, @rpe_text, @notas, @orden)`
  );
  const insSet = db.prepare(
    `INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, target_rpe, target_peso)
     VALUES (@program_exercise_id, @n_serie, @target_reps, @target_rpe, @target_peso)`
  );

  const exId = db.transaction(() => {
    const id = insEx.run({
      day_id: dayId,
      exercise_id: body.exercise_id ?? null,
      nombre_libre: body.nombre_libre ?? null,
      seccion,
      reps_text: body.reps_text ?? null,
      carga_text: body.carga_text ?? null,
      rpe_text: body.rpe_text ?? null,
      notas: body.notas ?? null,
      orden: maxOrden.m + 1,
    }).lastInsertRowid as number;

    for (const s of body.sets ?? []) {
      insSet.run({
        program_exercise_id: id,
        n_serie: s.n_serie,
        target_reps: s.target_reps ?? null,
        target_rpe: s.target_rpe ?? null,
        target_peso: s.target_peso ?? null,
      });
    }
    return id;
  })();

  const created = db.prepare(
    `SELECT pe.*, ${EX_NAME_SQL} AS nombre, COALESCE(e.es_basico,0) AS es_basico
     FROM program_exercises pe LEFT JOIN exercises e ON e.id = pe.exercise_id WHERE pe.id = ?`
  ).get(exId);
  res.status(201).json(created);
});

// POST /api/program/days/:id/exercises/reorder — reordena TODOS los ejercicios del día.
// Body: {ids: [3, 1, 2]} → orden 0,1,2 en ese orden. El array debe ser exactamente el
// conjunto de ejercicios del día (mismo tamaño, sin duplicados, todos del día): así el
// resultado siempre es 0..n-1 denso, sin huecos ni empates (los datos viejos tienen
// muchos orden=0 y esto los normaliza de paso). No existe un PATCH de orden suelto:
// setear uno solo dejaría empates cuyo desempate dependería del id de inserción.
programRouter.post("/days/:id/exercises/reorder", (req, res) => {
  const dayId = Number(req.params.id);
  if (!Number.isInteger(dayId)) return res.status(400).json({ error: "id inválido" });

  const day = db.prepare("SELECT 1 FROM program_days WHERE id = ?").get(dayId);
  if (!day) return res.status(404).json({ error: "día no encontrado" });

  const body = (req.body ?? {}) as ReorderExercisesInput;
  if (!Array.isArray(body.ids)) return res.status(400).json({ error: "ids debe ser un array" });
  if (!body.ids.every((n) => Number.isInteger(n))) {
    return res.status(400).json({ error: "ids debe contener enteros" });
  }
  if (new Set(body.ids).size !== body.ids.length) {
    return res.status(400).json({ error: "ids tiene duplicados" });
  }

  const actuales = db
    .prepare("SELECT id FROM program_exercises WHERE day_id = ?")
    .all(dayId) as Array<{ id: number }>;
  const setActual = new Set(actuales.map((r) => r.id));

  if (body.ids.length !== setActual.size) {
    return res.status(400).json({
      error: `ids debe contener los ${setActual.size} ejercicios del día (llegaron ${body.ids.length})`,
    });
  }
  const ajeno = body.ids.find((exId) => !setActual.has(exId));
  if (ajeno !== undefined) {
    return res.status(400).json({ error: `el ejercicio ${ajeno} no pertenece al día ${dayId}` });
  }

  // Validación terminada → recién ahora se abre la transacción.
  const upd = db.prepare("UPDATE program_exercises SET orden = ? WHERE id = ? AND day_id = ?");
  db.transaction(() => {
    body.ids.forEach((exId, i) => upd.run(i, exId, dayId));
  })();

  const exercises = db.prepare(EXERCISES_DEL_DIA_SQL).all(dayId);
  res.json({ ok: true, exercises });
});

// DELETE /api/program/exercises/:id — eliminar un ejercicio prescrito (y sus series target/real).
programRouter.delete("/exercises/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const ex = db.prepare("SELECT 1 FROM program_exercises WHERE id = ?").get(id);
  if (!ex) return res.status(404).json({ error: "ejercicio no encontrado" });

  db.prepare("DELETE FROM program_exercises WHERE id = ?").run(id);
  res.json({ ok: true });
});

// DELETE /api/program/weeks/:id — borrar semana completa (cascade days/exercises/sets).
programRouter.delete("/weeks/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const week = db.prepare("SELECT semana FROM program_weeks WHERE id = ?").get(id) as { semana: number } | undefined;
  if (!week) return res.status(404).json({ error: "semana no encontrada" });

  db.prepare("DELETE FROM program_weeks WHERE id = ?").run(id);
  res.json({ ok: true, semana: week.semana });
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
        ? body.hecha ? 1 : 0
        : // auto: deriva de los valores finales (sube y baja según peso+reps).
          (() => {
            const peso = body.real_peso !== undefined ? num(body.real_peso) : set.real_peso;
            const reps = body.real_reps !== undefined ? num(body.real_reps) : set.real_reps;
            return peso != null && reps != null ? 1 : 0;
          })(),
  };

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE program_sets
         SET real_peso=@real_peso, real_reps=@real_reps, real_rpe=@real_rpe, notas=@notas, hecha=@hecha
         WHERE id=@id`
    ).run({ id, ...next });

    // La fecha/hora del entrenamiento es la del primer dato cargado, no la de un registro
    // manual posterior (que podía llegar días después). COALESCE = solo escribe si está NULL,
    // así que respeta cualquier edición manual previa y es idempotente entre series del mismo día.
    if (next.hecha === 1) {
      db.prepare(
        `UPDATE program_days
            SET fecha = COALESCE(fecha, date('now', 'localtime')),
                hora_inicio = COALESCE(hora_inicio, time('now', 'localtime'))
          WHERE id = (SELECT pe.day_id FROM program_exercises pe WHERE pe.id = ?)`
      ).run(set.program_exercise_id);
    }
  });
  tx();

  const updated = db
    .prepare("SELECT * FROM v_program_sets_e1rm WHERE id = ?")
    .get(id);
  res.json(updated);
});

// PATCH /api/program/sets/:id/target — el coach corrige la prescripción (target_reps/rpe/peso)
// de una serie ya creada, sin recrear el ejercicio. No toca real_*/hecha (eso es del atleta).
programRouter.patch("/sets/:id/target", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const set = db.prepare("SELECT * FROM program_sets WHERE id = ?").get(id) as
    | ProgramSet
    | undefined;
  if (!set) return res.status(404).json({ error: "serie no encontrada" });

  const body = (req.body ?? {}) as UpdateProgramSetTargetInput;

  const num = (v: unknown): number | null | undefined =>
    v === undefined ? undefined : v === null ? null : Number(v);
  for (const [k, v] of Object.entries({
    target_reps: num(body.target_reps),
    target_rpe: num(body.target_rpe),
    target_peso: num(body.target_peso),
  })) {
    if (v !== undefined && v !== null && (!Number.isFinite(v) || v < 0)) {
      return res.status(400).json({ error: `${k} inválido` });
    }
  }

  const next = {
    target_reps: body.target_reps !== undefined ? num(body.target_reps) : set.target_reps,
    target_rpe: body.target_rpe !== undefined ? num(body.target_rpe) : set.target_rpe,
    target_peso: body.target_peso !== undefined ? num(body.target_peso) : set.target_peso,
  };

  db.prepare(
    `UPDATE program_sets
       SET target_reps=@target_reps, target_rpe=@target_rpe, target_peso=@target_peso
       WHERE id=@id`
  ).run({ id, ...next });

  const updated = db.prepare("SELECT * FROM v_program_sets_e1rm WHERE id = ?").get(id);
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
  if (body.mesociclo_id != null) {
    const ok = db.prepare("SELECT 1 FROM mesociclos WHERE id = ?").get(body.mesociclo_id);
    if (!ok) return res.status(400).json({ error: `mesociclo_id inválido: ${body.mesociclo_id}` });
  }
  const dup = db
    .prepare("SELECT 1 FROM program_weeks WHERE semana = ? AND mesociclo_id IS ?")
    .get(body.semana, body.mesociclo_id ?? null);
  if (dup) return res.status(409).json({ error: `la semana ${body.semana} ya existe en ese mesociclo` });

  const insWeek = db.prepare(
    `INSERT INTO program_weeks (semana, nombre, bloque, notas, fecha_creada, activa, mesociclo_id)
     VALUES (@semana, @nombre, @bloque, @notas, @fecha_creada, 1, @mesociclo_id)`
  );
  const insDay = db.prepare(
    `INSERT INTO program_days (week_id, dia, tipo, titulo, warmup, notas, orden)
     VALUES (@week_id, @dia, @tipo, @titulo, @warmup, @notas, @orden)`
  );
  const insEx = db.prepare(
    `INSERT INTO program_exercises (day_id, exercise_id, nombre_libre, seccion, reps_text, carga_text, rpe_text, notas, orden)
     VALUES (@day_id, @exercise_id, @nombre_libre, @seccion, @reps_text, @carga_text, @rpe_text, @notas, @orden)`
  );
  const insSet = db.prepare(
    `INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, target_rpe, target_peso)
     VALUES (@program_exercise_id, @n_serie, @target_reps, @target_rpe, @target_peso)`
  );

  const tx = db.transaction((input: NewProgramWeekInput) => {
    const weekId = insWeek.run({
      semana: input.semana,
      nombre: input.nombre ?? null,
      bloque: input.bloque ?? null,
      notas: input.notas ?? null,
      fecha_creada: new Date().toISOString().slice(0, 10),
      mesociclo_id: input.mesociclo_id ?? null,
    }).lastInsertRowid as number;

    input.days.forEach((d, di) => {
      const dayId = insDay.run({
        week_id: weekId,
        dia: d.dia,
        tipo: d.tipo ?? null,
        titulo: d.titulo ?? null,
        warmup: d.warmup ?? null,
        notas: d.notas ?? null,
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
            target_peso: s.target_peso ?? null,
          });
        }
      });
    });
    return weekId;
  });

  const weekId = tx(body);
  res.status(201).json({ id: weekId });
});
