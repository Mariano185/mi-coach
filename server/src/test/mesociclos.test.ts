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

describe("mesociclos", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks; DELETE FROM mesociclos;");
    app = await createTestApp(db);
  });

  it("POST / rechaza sin nombre", async () => {
    const res = await request(app).post("/api/mesociclos").set(AUTH).send({});
    expect(res.status).toBe(400);
  });

  it("POST / crea un mesociclo", async () => {
    const res = await request(app)
      .post("/api/mesociclos")
      .set(AUTH)
      .send({ nombre: "Acumulación octubre", objetivo: "hipertrofia" });

    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe("Acumulación octubre");
    expect(res.body.objetivo).toBe("hipertrofia");
    expect(res.body.notas).toBeNull();
  });

  it("GET / lista mesociclos con n_semanas correcto", async () => {
    const m1 = db
      .prepare("INSERT INTO mesociclos (nombre, orden, fecha_creada) VALUES ('M1', 0, '2026-01-01')")
      .run().lastInsertRowid as number;
    const m2 = db
      .prepare("INSERT INTO mesociclos (nombre, orden, fecha_creada) VALUES ('M2', 1, '2026-01-01')")
      .run().lastInsertRowid as number;

    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', ?)").run(m1);
    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (2, '2026-01-01', ?)").run(m1);
    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', ?)").run(m2);

    const res = await request(app).get("/api/mesociclos").set(AUTH);
    expect(res.status).toBe(200);

    const byId = new Map(res.body.map((m: { id: number; n_semanas: number }) => [m.id, m.n_semanas]));
    expect(byId.get(m1)).toBe(2);
    expect(byId.get(m2)).toBe(1);
  });

  it("GET /:id devuelve el mesociclo con sus semanas ordenadas", async () => {
    const m1 = db
      .prepare("INSERT INTO mesociclos (nombre, orden, fecha_creada) VALUES ('M1', 0, '2026-01-01')")
      .run().lastInsertRowid as number;
    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (2, '2026-01-01', ?)").run(m1);
    db.prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', ?)").run(m1);

    const res = await request(app).get(`/api/mesociclos/${m1}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.semanas).toHaveLength(2);
    expect(res.body.semanas[0].semana).toBe(1);
    expect(res.body.semanas[1].semana).toBe(2);
  });

  it("GET /:id devuelve 404 si no existe", async () => {
    const res = await request(app).get("/api/mesociclos/99999").set(AUTH);
    expect(res.status).toBe(404);
  });

  it("PATCH /:id edita solo los campos presentes", async () => {
    const m1 = db
      .prepare("INSERT INTO mesociclos (nombre, objetivo, orden, fecha_creada) VALUES ('M1', 'fuerza', 0, '2026-01-01')")
      .run().lastInsertRowid as number;

    const res = await request(app)
      .patch(`/api/mesociclos/${m1}`)
      .set(AUTH)
      .send({ notas: "nota nueva" });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe("M1");
    expect(res.body.objetivo).toBe("fuerza");
    expect(res.body.notas).toBe("nota nueva");
  });

  it("DELETE /:id borra el mesociclo pero deja las semanas huérfanas (mesociclo_id = NULL)", async () => {
    const m1 = db
      .prepare("INSERT INTO mesociclos (nombre, orden, fecha_creada) VALUES ('M1', 0, '2026-01-01')")
      .run().lastInsertRowid as number;
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, fecha_creada, mesociclo_id) VALUES (1, '2026-01-01', ?)")
      .run(m1).lastInsertRowid as number;

    const res = await request(app).delete(`/api/mesociclos/${m1}`).set(AUTH);
    expect(res.status).toBe(200);

    const mesociclo = db.prepare("SELECT 1 FROM mesociclos WHERE id = ?").get(m1);
    expect(mesociclo).toBeUndefined();

    const week = db.prepare("SELECT mesociclo_id FROM program_weeks WHERE id = ?").get(weekId) as {
      mesociclo_id: number | null;
    };
    expect(week.mesociclo_id).toBeNull();
  });
});
