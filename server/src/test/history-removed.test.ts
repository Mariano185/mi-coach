import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createTestDb, createTestApp, type TestDb } from "./setup.js";

// Issue #17: la pestaña Historial se sacó y con ella las rutas /api/history. Los
// entrenos se siguen viendo en Programas (semana → día → ejercicio).

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

describe("/api/history ya no existe", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    app = await createTestApp(db);
  });

  it("GET /api/history responde 404", async () => {
    const res = await request(app).get("/api/history").set(AUTH);
    expect(res.status).toBe(404);
  });

  it("GET /api/history/:dayId responde 404 aunque el día exista y esté entrenado", async () => {
    // Un día real con una serie hecha: con la ruta vieja esto daba 200, así que el 404
    // prueba que la ruta no está, no que el día falta.
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (1, '2024-01-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, tipo, fecha, orden) VALUES (?, 1, 'A', '2026-01-10', 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, nombre_libre, seccion, orden) VALUES (?, 'Sentadilla', 'main', 0)")
      .run(dayId).lastInsertRowid as number;
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, 1, 100, 5, 7, 1)"
    ).run(peId);

    const res = await request(app).get(`/api/history/${dayId}`).set(AUTH);
    expect(res.status).toBe(404);
  });
});
