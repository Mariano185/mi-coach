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

describe("GET /api/coach/analisis", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("expone notas_coach y notas_atleta por separado en sesiones_realizadas", async () => {
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, nombre, fecha_creada, activa) VALUES (1, 'Test', '2024-01-01', 1)")
      .run().lastInsertRowid as number;

    const hoy = new Date().toISOString().slice(0, 10);
    const dayId = db
      .prepare(
        "INSERT INTO program_days (week_id, dia, tipo, titulo, notas, notas_atleta, fecha, orden) VALUES (?, 1, 'A', 'Día 1', ?, ?, ?, 0)"
      )
      .run(weekId, "Subí 2.5kg si el RPE acompaña.", "Sentí flojo el hombro.", hoy).lastInsertRowid as number;

    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;
    const exId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, reps_text, orden) VALUES (?, ?, 'main', '3×5', 0)")
      .run(dayId, squat).lastInsertRowid as number;

    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, real_peso, real_reps, hecha) VALUES (?, 1, 5, 100, 5, 1)"
    ).run(exId);

    const res = await request(app).get("/api/coach/analisis?dias=42").set(AUTH);
    expect(res.status).toBe(200);

    const sesion = res.body.sesiones_realizadas.find((s: { dia: number }) => s.dia === 1);
    expect(sesion).toBeDefined();
    expect(sesion.notas_coach).toBe("Subí 2.5kg si el RPE acompaña.");
    expect(sesion.notas_atleta).toBe("Sentí flojo el hombro.");
    expect(sesion.notas).toBeUndefined();
  });
});
