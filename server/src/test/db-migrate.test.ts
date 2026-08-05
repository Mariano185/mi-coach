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

    db.close();
  });
});
