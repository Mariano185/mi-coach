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

describe("PUT /api/pasos — Pasos diarios", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM pasos_diarios;");
    app = await createTestApp(db);
  });

  it("guarda los pasos de una fecha", async () => {
    const res = await request(app).put("/api/pasos").set(AUTH).send({ fecha: "2026-11-14", pasos: 8234 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fecha: "2026-11-14", pasos: 8234 });
  });

  it("un envío nuevo para la misma fecha la corrige (upsert)", async () => {
    await request(app).put("/api/pasos").set(AUTH).send({ fecha: "2026-11-14", pasos: 3000 });
    const res = await request(app).put("/api/pasos").set(AUTH).send({ fecha: "2026-11-14", pasos: 9100 });
    expect(res.status).toBe(200);
    expect(res.body.pasos).toBe(9100);

    const dia = await request(app).get("/api/nutricion/dia?fecha=2026-11-14").set(AUTH);
    expect(dia.body.pasos).toMatchObject({ fecha: "2026-11-14", pasos: 9100 });
  });

  it("acepta 0 pasos", async () => {
    const res = await request(app).put("/api/pasos").set(AUTH).send({ fecha: "2026-11-14", pasos: 0 });
    expect(res.status).toBe(200);
    expect(res.body.pasos).toBe(0);
  });

  it.each([
    ["negativo", -1],
    ["decimal", 8234.5],
    ["texto", "8234"],
    ["faltante", undefined],
  ])("rechaza pasos %s con 400", async (_caso, pasos) => {
    const res = await request(app).put("/api/pasos").set(AUTH).send({ fecha: "2026-11-14", pasos });
    expect(res.status).toBe(400);
  });

  it.each([["2026-02-30"], ["14/11/2026"], [undefined]])("rechaza la fecha %s con 400", async (fecha) => {
    const res = await request(app).put("/api/pasos").set(AUTH).send({ fecha, pasos: 100 });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/nutricion/dia — pasos de la fecha", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM pasos_diarios;");
    app = await createTestApp(db);
  });

  it("trae pasos null si la fecha no tiene Pasos diarios", async () => {
    const res = await request(app).get("/api/nutricion/dia?fecha=2026-11-14").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.pasos).toBeNull();
  });
});

// Fecha UTC de hace n días: /coach/analisis arma la ventana con date('now') de SQLite (UTC).
function haceDias(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("GET /api/coach/analisis — pasos_diarios", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM pasos_diarios;");
    app = await createTestApp(db);
  });

  it("trae solo las fechas que llegaron dentro de ?dias=N, en orden ascendente", async () => {
    for (const [n, pasos] of [[1, 9000], [20, 4000], [3, 0], [10, 12000]] as const) {
      await request(app).put("/api/pasos").set(AUTH).send({ fecha: haceDias(n), pasos });
    }
    const res = await request(app).get("/api/coach/analisis?dias=14").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.pasos_diarios).toEqual([
      { fecha: haceDias(10), pasos: 12000 },
      { fecha: haceDias(3), pasos: 0 },
      { fecha: haceDias(1), pasos: 9000 },
    ]);
  });

  it("sin envíos en la ventana, el bloque es []", async () => {
    await request(app).put("/api/pasos").set(AUTH).send({ fecha: haceDias(30), pasos: 5000 });
    const res = await request(app).get("/api/coach/analisis?dias=7").set(AUTH);
    expect(res.body.pasos_diarios).toEqual([]);
  });
});
