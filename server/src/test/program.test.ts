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

describe("POST /api/program/days/:id/complete", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM sets; DELETE FROM sessions; DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("falla con 400 si no hay series completadas", async () => {
    const { dayId } = seedWeekWithDay(db);
    const res = await request(app)
      .post(`/api/program/days/${dayId}/complete`)
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no hay series/i);
  });

  it("crea una sesión real con los sets completados", async () => {
    const { dayId, setIds } = seedWeekWithDay(db);

    db.prepare("UPDATE program_sets SET real_peso=100, real_reps=5, real_rpe=7, hecha=1 WHERE id=?").run(setIds[0]);
    db.prepare("UPDATE program_sets SET real_peso=100, real_reps=5, real_rpe=7.5, hecha=1 WHERE id=?").run(setIds[1]);

    const res = await request(app)
      .post(`/api/program/days/${dayId}/complete`)
      .set(AUTH)
      .send({ energia: 8, sueno_horas: 7.5 });

    expect(res.status).toBe(201);
    expect(res.body.sets).toBe(2);
    expect(res.body.session_id).toBeTypeOf("number");

    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(res.body.session_id) as { tipo: string; energia: number } | undefined;
    expect(session?.tipo).toBe("A");
    expect(session?.energia).toBe(8);

    const sets = db.prepare("SELECT * FROM sets WHERE session_id = ?").all(res.body.session_id);
    expect(sets).toHaveLength(2);

    const day = db.prepare("SELECT session_id FROM program_days WHERE id = ?").get(dayId) as { session_id: number };
    expect(day.session_id).toBe(res.body.session_id);
  });

  it("es idempotente: re-llamar reusa la sesión y actualiza los sets", async () => {
    const { dayId, setIds } = seedWeekWithDay(db);

    db.prepare("UPDATE program_sets SET real_peso=100, real_reps=5, hecha=1 WHERE id=?").run(setIds[0]);

    const res1 = await request(app).post(`/api/program/days/${dayId}/complete`).set(AUTH).send({});
    expect(res1.status).toBe(201);
    const sessionId = res1.body.session_id;

    db.prepare("UPDATE program_sets SET real_peso=102.5, real_reps=5, hecha=1 WHERE id=?").run(setIds[1]);
    const res2 = await request(app).post(`/api/program/days/${dayId}/complete`).set(AUTH).send({});
    expect(res2.status).toBe(201);
    expect(res2.body.session_id).toBe(sessionId);
    expect(res2.body.sets).toBe(2);

    const count = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    expect(count).toBe(1);
  });
});

describe("PATCH /api/program/sets/:id", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM sets; DELETE FROM sessions; DELETE FROM program_weeks;");
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
    db.exec("DELETE FROM sets; DELETE FROM sessions; DELETE FROM program_weeks;");
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
    db.exec("DELETE FROM sets; DELETE FROM sessions; DELETE FROM program_weeks;");
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
