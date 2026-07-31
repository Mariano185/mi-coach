import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestDb, createTestApp, type TestDb } from "./setup.js";

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

function seedDayConSerieHecha(fecha: string | null, semana: number) {
  const weekId = db
    .prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (?, '2024-01-01', 1)")
    .run(semana).lastInsertRowid as number;
  const dayId = db
    .prepare("INSERT INTO program_days (week_id, dia, tipo, titulo, fecha, orden) VALUES (?, 1, 'A', 'Día 1', ?, 0)")
    .run(weekId, fecha).lastInsertRowid as number;
  const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;
  const exId = db
    .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
    .run(dayId, squat).lastInsertRowid as number;
  db.prepare(
    "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, 1, 100, 5, 7, 1)"
  ).run(exId);
  return { weekId, dayId, exId };
}

describe("GET /api/history", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("devuelve solo días con series hechas, ordenados por fecha DESC", async () => {
    seedDayConSerieHecha("2026-01-10", 1);
    seedDayConSerieHecha("2026-01-20", 2);

    const res = await request(app).get("/api/history").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].fecha).toBe("2026-01-20");
    expect(res.body[1].fecha).toBe("2026-01-10");
  });

  it("excluye días sin fecha", async () => {
    seedDayConSerieHecha(null, 1);

    const res = await request(app).get("/api/history").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("excluye días sin ninguna serie hecha", async () => {
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (1, '2024-01-01', 1)")
      .run().lastInsertRowid as number;
    db.prepare(
      "INSERT INTO program_days (week_id, dia, tipo, titulo, fecha, orden) VALUES (?, 1, 'A', 'Día 1', '2026-01-10', 0)"
    ).run(weekId);

    const res = await request(app).get("/api/history").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe("GET /api/history/:dayId", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("devuelve el día con sus series, incluyendo exercise_id, rir y e1rm calculados", async () => {
    const { dayId } = seedDayConSerieHecha("2026-01-10", 1);
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;

    const res = await request(app).get(`/api/history/${dayId}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.fecha).toBe("2026-01-10");
    expect(res.body.sets).toHaveLength(1);
    expect(res.body.sets[0].exercise_id).toBe(squat);
    expect(res.body.sets[0].exercise_nombre).toBe("Mid/High Bar Back Squat");
    expect(res.body.sets[0].e1rm).toBeCloseTo(100 * (1 + 5 / 30), 1);
    expect(res.body.sets[0].rir).toBe(3); // MAX(0, ROUND(10 - 7))
  });

  it("devuelve 404 para un día inexistente", async () => {
    const res = await request(app).get("/api/history/99999").set(AUTH);
    expect(res.status).toBe(404);
  });
});
