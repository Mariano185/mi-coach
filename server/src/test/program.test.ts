import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestDb, createTestApp, type TestDb } from "./setup.js";

// La DB se crea aquí y se expone al mock via closure con getter.
const db: TestDb = createTestDb();

vi.mock("../db.js", () => ({
  get db() { return db; },
  getSetting: (k: string) => {
    const row = db.prepare("SELECT valor FROM settings WHERE clave = ?").get(k) as { valor: string } | undefined;
    return row?.valor ?? null;
  },
  setSetting: (k: string, v: string) => {
    db.prepare("INSERT OR REPLACE INTO settings (clave, valor) VALUES (?, ?)").run(k, v);
  },
}));

const AUTH = { "x-coach-key": "test-coach-key" };

function seedWeekWithDay(testDb: TestDb) {
  const weekId = testDb
    .prepare("INSERT INTO program_weeks (semana, nombre, fecha_creada, activa) VALUES (1, 'Test', '2024-01-01', 1)")
    .run().lastInsertRowid as number;

  const dayId = testDb
    .prepare("INSERT INTO program_days (week_id, dia, tipo, titulo, orden) VALUES (?, 1, 'A', 'Día 1', 0)")
    .run(weekId).lastInsertRowid as number;

  const squat = (testDb.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;

  const exId = testDb
    .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, reps_text, orden) VALUES (?, ?, 'main', '3×5', 0)")
    .run(dayId, squat).lastInsertRowid as number;

  const insSet = testDb.prepare(
    "INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, target_rpe) VALUES (?, ?, 5, 7)"
  );
  const s1 = insSet.run(exId, 1).lastInsertRowid as number;
  const s2 = insSet.run(exId, 2).lastInsertRowid as number;
  const s3 = insSet.run(exId, 3).lastInsertRowid as number;

  return { weekId, dayId, exId, squat, setIds: [s1, s2, s3] };
}

describe("PATCH /api/program/sets/:id", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("marca hecha=1 automáticamente cuando llegan peso y reps", async () => {
    const { setIds } = seedWeekWithDay(db);

    const res = await request(app)
      .patch(`/api/program/sets/${setIds[0]}`)
      .set(AUTH)
      .send({ real_peso: 95, real_reps: 5, real_rpe: 7 });

    expect(res.status).toBe(200);
    expect(res.body.hecha).toBe(1);
    expect(res.body.real_peso).toBe(95);
    expect(res.body.e1rm).toBeCloseTo(95 * (1 + 5 / 30), 1);
  });

  it("baja hecha=0 si se borran peso o reps", async () => {
    const { setIds } = seedWeekWithDay(db);

    db.prepare("UPDATE program_sets SET real_peso=100, real_reps=5, hecha=1 WHERE id=?").run(setIds[0]);

    const res = await request(app)
      .patch(`/api/program/sets/${setIds[0]}`)
      .set(AUTH)
      .send({ real_peso: null });

    expect(res.status).toBe(200);
    expect(res.body.hecha).toBe(0);
  });

  it("autosetea fecha y hora_inicio del día al completar la primera serie", async () => {
    const { dayId, setIds } = seedWeekWithDay(db);

    const before = db.prepare("SELECT fecha, hora_inicio FROM program_days WHERE id = ?").get(dayId) as {
      fecha: string | null;
      hora_inicio: string | null;
    };
    expect(before.fecha).toBeNull();
    expect(before.hora_inicio).toBeNull();

    const res = await request(app)
      .patch(`/api/program/sets/${setIds[0]}`)
      .set(AUTH)
      .send({ real_peso: 95, real_reps: 5 });

    expect(res.status).toBe(200);
    const after = db.prepare("SELECT fecha, hora_inicio FROM program_days WHERE id = ?").get(dayId) as {
      fecha: string | null;
      hora_inicio: string | null;
    };
    expect(after.fecha).not.toBeNull();
    expect(after.hora_inicio).not.toBeNull();
  });

  it("no pisa una fecha ya existente (COALESCE es idempotente)", async () => {
    const { dayId, setIds } = seedWeekWithDay(db);
    db.prepare("UPDATE program_days SET fecha = '2020-01-01' WHERE id = ?").run(dayId);

    await request(app)
      .patch(`/api/program/sets/${setIds[0]}`)
      .set(AUTH)
      .send({ real_peso: 95, real_reps: 5 });

    const day = db.prepare("SELECT fecha FROM program_days WHERE id = ?").get(dayId) as { fecha: string };
    expect(day.fecha).toBe("2020-01-01");
  });

  it("borrar el peso no borra la fecha ya autoseteada", async () => {
    const { dayId, setIds } = seedWeekWithDay(db);

    await request(app)
      .patch(`/api/program/sets/${setIds[0]}`)
      .set(AUTH)
      .send({ real_peso: 95, real_reps: 5 });
    const fechaSeteada = (
      db.prepare("SELECT fecha FROM program_days WHERE id = ?").get(dayId) as { fecha: string }
    ).fecha;

    const res = await request(app)
      .patch(`/api/program/sets/${setIds[0]}`)
      .set(AUTH)
      .send({ real_peso: null });

    expect(res.status).toBe(200);
    expect(res.body.hecha).toBe(0);
    const day = db.prepare("SELECT fecha FROM program_days WHERE id = ?").get(dayId) as { fecha: string };
    expect(day.fecha).toBe(fechaSeteada);
  });

  it("rechaza valores negativos", async () => {
    const { setIds } = seedWeekWithDay(db);
    const res = await request(app)
      .patch(`/api/program/sets/${setIds[0]}`)
      .set(AUTH)
      .send({ real_peso: -10 });
    expect(res.status).toBe(400);
  });

  it("devuelve 404 para una serie inexistente", async () => {
    seedWeekWithDay(db);
    const res = await request(app)
      .patch("/api/program/sets/99999")
      .set(AUTH)
      .send({ real_peso: 100 });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/program/weeks", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("crea una semana completa con días, ejercicios y series", async () => {
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;

    const res = await request(app)
      .post("/api/program/weeks")
      .set(AUTH)
      .send({
        semana: 1,
        nombre: "Acumulación",
        bloque: "Bloque 1",
        days: [
          {
            dia: 1,
            tipo: "A",
            titulo: "Squat día",
            exercises: [
              {
                exercise_id: squat,
                seccion: "main",
                reps_text: "3×5",
                carga_text: "~90 kg",
                rpe_text: "7",
                sets: [
                  { n_serie: 1, target_reps: 5, target_rpe: 7 },
                  { n_serie: 2, target_reps: 5, target_rpe: 7 },
                  { n_serie: 3, target_reps: 5, target_rpe: 7 },
                ],
              },
            ],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf("number");

    const week = db.prepare("SELECT * FROM program_weeks WHERE id = ?").get(res.body.id) as { semana: number; nombre: string } | undefined;
    expect(week?.semana).toBe(1);
    expect(week?.nombre).toBe("Acumulación");

    const days = db.prepare("SELECT * FROM program_days WHERE week_id = ?").all(res.body.id);
    expect(days).toHaveLength(1);

    const sets = db
      .prepare(
        "SELECT ps.* FROM program_sets ps JOIN program_exercises pe ON pe.id = ps.program_exercise_id JOIN program_days pd ON pd.id = pe.day_id WHERE pd.week_id = ?"
      )
      .all(res.body.id);
    expect(sets).toHaveLength(3);
  });

  it("rechaza duplicar la misma semana", async () => {
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;
    const body = {
      semana: 1,
      days: [{ dia: 1, tipo: "A", exercises: [{ exercise_id: squat, sets: [{ n_serie: 1 }] }] }],
    };

    await request(app).post("/api/program/weeks").set(AUTH).send(body);
    const res = await request(app).post("/api/program/weeks").set(AUTH).send(body);
    expect(res.status).toBe(409);
  });

  it("rechaza semana sin días", async () => {
    const res = await request(app)
      .post("/api/program/weeks")
      .set(AUTH)
      .send({ semana: 1, days: [] });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/program/weeks/:id", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("devuelve la semana con conteos de series por día", async () => {
    const { weekId, setIds } = seedWeekWithDay(db);

    db.prepare("UPDATE program_sets SET real_peso=100, real_reps=5, hecha=1 WHERE id=?").run(setIds[0]);
    db.prepare("UPDATE program_sets SET real_peso=100, real_reps=5, hecha=1 WHERE id=?").run(setIds[1]);

    const res = await request(app).get(`/api/program/weeks/${weekId}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.semana).toBe(1);
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].n_series).toBe(3);
    expect(res.body.days[0].n_series_hechas).toBe(2);
  });

  it("devuelve 404 para semana inexistente", async () => {
    const res = await request(app).get("/api/program/weeks/99999").set(AUTH);
    expect(res.status).toBe(404);
  });
});

describe("target_peso por serie (carga sugerida distinta por fila)", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("POST /program/weeks con target_peso distinto por serie no lo repite entre filas", async () => {
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;

    const res = await request(app)
      .post("/api/program/weeks")
      .set(AUTH)
      .send({
        semana: 1,
        days: [
          {
            dia: 1,
            tipo: "A",
            exercises: [
              {
                exercise_id: squat,
                seccion: "main",
                carga_text: "90/85 kg (top set)",
                sets: [
                  { n_serie: 1, target_reps: 5, target_rpe: 8, target_peso: 90 },
                  { n_serie: 2, target_reps: 5, target_rpe: 7, target_peso: 85 },
                  { n_serie: 3, target_reps: 5, target_rpe: 7, target_peso: 85 },
                ],
              },
            ],
          },
        ],
      });

    expect(res.status).toBe(201);

    const day = db.prepare("SELECT id FROM program_days WHERE week_id = ?").get(res.body.id) as { id: number };
    const exercise = db.prepare("SELECT id FROM program_exercises WHERE day_id = ?").get(day.id) as { id: number };
    const exRes = await request(app).get(`/api/program/exercises/${exercise.id}`).set(AUTH);

    expect(exRes.status).toBe(200);
    const sets = exRes.body.sets as Array<{ n_serie: number; target_peso: number | null }>;
    expect(sets.find((s) => s.n_serie === 1)?.target_peso).toBe(90);
    expect(sets.find((s) => s.n_serie === 2)?.target_peso).toBe(85);
    expect(sets.find((s) => s.n_serie === 3)?.target_peso).toBe(85);
  });

  it("POST /program/weeks sin target_peso guarda null (sin inventar un valor)", async () => {
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;

    const res = await request(app)
      .post("/api/program/weeks")
      .set(AUTH)
      .send({
        semana: 1,
        days: [
          {
            dia: 1,
            tipo: "A",
            exercises: [
              {
                exercise_id: squat,
                seccion: "main",
                carga_text: "~80 kg",
                sets: [{ n_serie: 1, target_reps: 5, target_rpe: 7 }],
              },
            ],
          },
        ],
      });

    const day = db.prepare("SELECT id FROM program_days WHERE week_id = ?").get(res.body.id) as { id: number };
    const exercise = db.prepare("SELECT id FROM program_exercises WHERE day_id = ?").get(day.id) as { id: number };
    const set = db.prepare("SELECT target_peso FROM program_sets WHERE program_exercise_id = ?").get(exercise.id) as { target_peso: number | null };

    expect(set.target_peso).toBeNull();
  });

  it("PATCH /program/sets/:id/target actualiza target_peso de una serie ya creada", async () => {
    const { setIds } = seedWeekWithDay(db);

    const res = await request(app)
      .patch(`/api/program/sets/${setIds[0]}/target`)
      .set(AUTH)
      .send({ target_peso: 92.5 });

    expect(res.status).toBe(200);
    expect(res.body.target_peso).toBe(92.5);

    const row = db.prepare("SELECT target_peso FROM program_sets WHERE id = ?").get(setIds[0]) as { target_peso: number };
    expect(row.target_peso).toBe(92.5);
  });

  it("PATCH /program/sets/:id/target rechaza valores inválidos", async () => {
    const { setIds } = seedWeekWithDay(db);

    const res = await request(app)
      .patch(`/api/program/sets/${setIds[0]}/target`)
      .set(AUTH)
      .send({ target_peso: -5 });

    expect(res.status).toBe(400);
  });

  it("PATCH /program/sets/:id (valores reales del atleta) sigue funcionando sin cambios", async () => {
    const { setIds } = seedWeekWithDay(db);

    const res = await request(app)
      .patch(`/api/program/sets/${setIds[0]}`)
      .set(AUTH)
      .send({ real_peso: 90, real_reps: 5, real_rpe: 8 });

    expect(res.status).toBe(200);
    expect(res.body.real_peso).toBe(90);
    expect(res.body.hecha).toBe(1);
  });
});

describe("tipo de día libre y opcional (sin restricción A/B)", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("POST /program/weeks crea un día sin tipo", async () => {
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;

    const res = await request(app)
      .post("/api/program/weeks")
      .set(AUTH)
      .send({
        semana: 1,
        days: [{ dia: 1, exercises: [{ exercise_id: squat, sets: [{ n_serie: 1 }] }] }],
      });

    expect(res.status).toBe(201);
    const day = db.prepare("SELECT tipo FROM program_days WHERE week_id = ?").get(res.body.id) as { tipo: string | null };
    expect(day.tipo).toBeNull();
  });

  it("POST /program/weeks crea un día con etiqueta de texto libre", async () => {
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;

    const res = await request(app)
      .post("/api/program/weeks")
      .set(AUTH)
      .send({
        semana: 1,
        days: [{ dia: 1, tipo: "Piernas", exercises: [{ exercise_id: squat, sets: [{ n_serie: 1 }] }] }],
      });

    expect(res.status).toBe(201);
    const day = db.prepare("SELECT tipo FROM program_days WHERE week_id = ?").get(res.body.id) as { tipo: string | null };
    expect(day.tipo).toBe("Piernas");
  });

  it("día sin tipo: se crea y se lee con tipo null, sin restricción A/B", async () => {
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, nombre, fecha_creada, activa) VALUES (2, 'Test', '2024-01-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, titulo, orden) VALUES (?, 1, 'Día 1', 0)")
      .run(weekId).lastInsertRowid as number;

    const res = await request(app).get(`/api/program/days/${dayId}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBeNull();
  });

  it("día con etiqueta libre: se lee tal cual, sin normalizar a A/B", async () => {
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, nombre, fecha_creada, activa) VALUES (3, 'Test', '2024-01-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, tipo, titulo, orden) VALUES (?, 1, 'Piernas', 'Día 1', 0)")
      .run(weekId).lastInsertRowid as number;

    const res = await request(app).get(`/api/program/days/${dayId}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe("Piernas");
  });

  it("regresión: una semana con días tipo A/B se sigue creando y leyendo igual", async () => {
    const { dayId } = seedWeekWithDay(db); // seedea con tipo 'A'

    const res = await request(app).get(`/api/program/days/${dayId}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe("A");
  });

  it("PATCH /program/days/:id guarda notas del atleta y se leen después", async () => {
    const { dayId } = seedWeekWithDay(db);

    const patchRes = await request(app)
      .patch(`/api/program/days/${dayId}`)
      .set(AUTH)
      .send({ notas: "Dolor leve en el hombro derecho durante el press." });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.notas).toBe("Dolor leve en el hombro derecho durante el press.");

    const getRes = await request(app).get(`/api/program/days/${dayId}`).set(AUTH);
    expect(getRes.status).toBe(200);
    expect(getRes.body.notas).toBe("Dolor leve en el hombro derecho durante el press.");
  });

  it("PATCH /program/days/:id con notas vacías las borra (guarda null)", async () => {
    const { dayId } = seedWeekWithDay(db);
    await request(app).patch(`/api/program/days/${dayId}`).set(AUTH).send({ notas: "texto previo" });

    const patchRes = await request(app)
      .patch(`/api/program/days/${dayId}`)
      .set(AUTH)
      .send({ notas: null });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.notas).toBeNull();

    const getRes = await request(app).get(`/api/program/days/${dayId}`).set(AUTH);
    expect(getRes.body.notas).toBeNull();
  });
});

describe("semanas y mesociclos", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks; DELETE FROM mesociclos;");
    app = await createTestApp(db);
  });

  function seedMesociclo(nombre: string): number {
    return db
      .prepare("INSERT INTO mesociclos (nombre, orden, fecha_creada) VALUES (?, 0, '2026-01-01')")
      .run(nombre).lastInsertRowid as number;
  }

  it("dos mesociclos distintos pueden tener ambos una semana 1", async () => {
    const m1 = seedMesociclo("Acumulación");
    const m2 = seedMesociclo("Fuerza");
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;
    const body = (mesociclo_id: number) => ({
      semana: 1,
      mesociclo_id,
      days: [{ dia: 1, exercises: [{ exercise_id: squat, sets: [{ n_serie: 1 }] }] }],
    });

    const res1 = await request(app).post("/api/program/weeks").set(AUTH).send(body(m1));
    const res2 = await request(app).post("/api/program/weeks").set(AUTH).send(body(m2));

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });

  it("rechaza duplicar semana dentro del mismo mesociclo", async () => {
    const m1 = seedMesociclo("Acumulación");
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;
    const body = {
      semana: 1,
      mesociclo_id: m1,
      days: [{ dia: 1, exercises: [{ exercise_id: squat, sets: [{ n_serie: 1 }] }] }],
    };

    const res1 = await request(app).post("/api/program/weeks").set(AUTH).send(body);
    const res2 = await request(app).post("/api/program/weeks").set(AUTH).send(body);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(409);
  });

  it("crear una semana sin mesociclo_id sigue funcionando (queda huérfana)", async () => {
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;
    const res = await request(app)
      .post("/api/program/weeks")
      .set(AUTH)
      .send({
        semana: 1,
        days: [{ dia: 1, exercises: [{ exercise_id: squat, sets: [{ n_serie: 1 }] }] }],
      });

    expect(res.status).toBe(201);
    const week = db.prepare("SELECT mesociclo_id FROM program_weeks WHERE id = ?").get(res.body.id) as {
      mesociclo_id: number | null;
    };
    expect(week.mesociclo_id).toBeNull();
  });

  it("GET /weeks?mesociclo_id=N filtra correctamente", async () => {
    const m1 = seedMesociclo("Acumulación");
    const m2 = seedMesociclo("Fuerza");
    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', ?)").run(m1);
    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (2, '2026-01-01', ?)").run(m1);
    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', ?)").run(m2);

    const res = await request(app).get(`/api/program/weeks?mesociclo_id=${m1}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((w: { mesociclo_id: number }) => w.mesociclo_id === m1)).toBe(true);
  });

  it("GET /weeks sin filtro sigue devolviendo todas (retrocompatibilidad)", async () => {
    const m1 = seedMesociclo("Acumulación");
    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', ?)").run(m1);
    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', NULL)").run();

    const res = await request(app).get("/api/program/weeks").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("PATCH /weeks/:id reasigna una semana de un mesociclo a otro", async () => {
    const m1 = seedMesociclo("Acumulación");
    const m2 = seedMesociclo("Fuerza");
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', ?)")
      .run(m1).lastInsertRowid as number;

    const res = await request(app)
      .patch(`/api/program/weeks/${weekId}`)
      .set(AUTH)
      .send({ mesociclo_id: m2, semana: 3 });

    expect(res.status).toBe(200);
    expect(res.body.mesociclo_id).toBe(m2);
    expect(res.body.semana).toBe(3);
  });

  it("PATCH /weeks/:id rechaza mover a un mesociclo_id inexistente", async () => {
    const m1 = seedMesociclo("Acumulación");
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', ?)")
      .run(m1).lastInsertRowid as number;

    const res = await request(app)
      .patch(`/api/program/weeks/${weekId}`)
      .set(AUTH)
      .send({ mesociclo_id: 99999 });

    expect(res.status).toBe(400);
  });
});
