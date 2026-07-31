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

describe("GET /api/stats", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("calcula mejor_e1rm por básico desde program_sets (no sessions/sets)", async () => {
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (1, '2024-01-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, tipo, fecha, orden) VALUES (?, 1, 'A', '2026-01-10', 0)")
      .run(weekId).lastInsertRowid as number;
    const bench = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
    const exId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, bench).lastInsertRowid as number;

    // Dos series: la de 7 reps a 75kg debe ganar sobre la de 4 reps a 80kg (Epley pondera reps).
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, 1, 75, 7, 8, 1)"
    ).run(exId);
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, 2, 80, 4, 7.5, 1)"
    ).run(exId);

    const res = await request(app).get("/api/stats").set(AUTH);
    expect(res.status).toBe(200);
    const bench_stat = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
    expect(bench_stat.mejor_e1rm).toBeCloseTo(75 * (1 + 7 / 30), 1);
  });

  it("básico sin series usa rm_inicial de settings como fallback", async () => {
    db.prepare("INSERT OR REPLACE INTO settings (clave, valor) VALUES ('rm_squat', '95')").run();

    const res = await request(app).get("/api/stats").set(AUTH);
    expect(res.status).toBe(200);
    const squat_stat = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Mid/High Bar Back Squat");
    expect(squat_stat.mejor_e1rm).toBe(95);
    expect(squat_stat.rm_inicial).toBe(95);
  });
});
