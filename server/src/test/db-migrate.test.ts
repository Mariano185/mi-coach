import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Este es el único test que ejercita migrate()/initDb() contra una DB real en disco
// (no el helper createTestDb() de setup.ts, que arma el schema a mano y nunca corre
// las migraciones reales). Existe para blindar la migración de drop de es_basico
// (issue #11): DROP COLUMN no es idempotente en SQLite (tira "no such column" si se
// corre dos veces sobre una tabla que ya no tiene la columna), así que initDb()
// tiene que poder correr repetidas veces sin explotar — como pasa en cada restart
// del servicio en producción.

const dir = mkdtempSync(join(tmpdir(), "mi-coach-migrate-test-"));
const dbPath = join(dir, "test.db");
process.env.COACH_DB_PATH = dbPath;

afterAll(() => {
  delete process.env.COACH_DB_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe("initDb() — migración idempotente", () => {
  it("correr initDb() dos veces no tira excepción y deja exercises sin es_basico", async () => {
    const { db, initDb } = await import("../db.js");

    expect(() => initDb()).not.toThrow();
    expect(() => initDb()).not.toThrow();

    const cols = db.prepare("PRAGMA table_info(exercises)").all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === "es_basico")).toBe(false);
    expect(cols.some((c) => c.name === "rastrea_e1rm")).toBe(true);
  });

  it("una DB con la vista Epley vieja recalcula el e1RM de todo el historial con RTS al arrancar (issue #14)", async () => {
    const { db, initDb } = await import("../db.js");

    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (99, '2024-01-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, '2024-01-02', 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, nombre_libre, seccion, orden) VALUES (?, 'x', 'main', 0)")
      .run(dayId).lastInsertRowid as number;
    const setId = db
      .prepare(
        "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, 1, 80, 3, 7, 1)"
      )
      .run(peId).lastInsertRowid as number;

    // Simula una DB desplegada antes del cambio: la vista calcula Epley y no tiene confianza.
    db.exec("DROP VIEW v_program_sets_e1rm");
    db.exec(`CREATE VIEW v_program_sets_e1rm AS
      SELECT ps.*, ROUND(ps.real_peso * (1 + ps.real_reps / 30.0), 1) AS e1rm,
             NULL AS tonelaje, NULL AS rir
      FROM program_sets ps`);
    expect((db.prepare("SELECT e1rm FROM v_program_sets_e1rm WHERE id = ?").get(setId) as { e1rm: number }).e1rm).toBe(88);

    initDb();
    initDb(); // idempotente

    const fila = db.prepare("SELECT e1rm, e1rm_confianza FROM v_program_sets_e1rm WHERE id = ?").get(setId);
    expect(fila).toEqual({ e1rm: 95.6, e1rm_confianza: "alta" });

    db.close();
  });
});
