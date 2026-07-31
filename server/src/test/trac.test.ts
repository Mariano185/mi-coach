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

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("PUT /api/trac", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM trac;");
    app = await createTestApp(db);
  });

  it("crea un registro nuevo para una fecha sin datos previos", async () => {
    const res = await request(app)
      .put("/api/trac")
      .set(AUTH)
      .send({
        fecha: "2026-07-08",
        fatiga_pierna: 3,
        fatiga_empuje: 4,
        fatiga_traccion: 2,
        descanso_alimentacion: 5,
        recuperacion: 4,
        motivacion: 5,
        tecnica: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.fecha).toBe("2026-07-08");
    expect(res.body.fatiga_pierna).toBe(3);
    expect(res.body.tecnica).toBe(3);

    const row = db.prepare("SELECT * FROM trac WHERE fecha = ?").get("2026-07-08") as { fatiga_empuje: number };
    expect(row.fatiga_empuje).toBe(4);
  });

  it("es upsert: repetir la misma fecha actualiza en vez de duplicar", async () => {
    await request(app).put("/api/trac").set(AUTH).send({ fecha: "2026-07-08", motivacion: 2 });
    const res = await request(app).put("/api/trac").set(AUTH).send({ fecha: "2026-07-08", motivacion: 5 });

    expect(res.status).toBe(200);
    expect(res.body.motivacion).toBe(5);

    const count = (db.prepare("SELECT COUNT(*) AS n FROM trac").get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it("guarda null en los campos no enviados (sin lógica cruzada)", async () => {
    const res = await request(app)
      .put("/api/trac")
      .set(AUTH)
      .send({ fecha: "2026-07-08", fatiga_pierna: 4, tecnica: 2 });

    expect(res.status).toBe(200);
    expect(res.body.fatiga_pierna).toBe(4);
    expect(res.body.tecnica).toBe(2);
    expect(res.body.fatiga_empuje).toBeNull();
    expect(res.body.fatiga_traccion).toBeNull();
    expect(res.body.descanso_alimentacion).toBeNull();
    expect(res.body.recuperacion).toBeNull();
    expect(res.body.motivacion).toBeNull();
  });

  it("rechaza valores fuera de rango en fatiga_pierna", async () => {
    const res = await request(app).put("/api/trac").set(AUTH).send({ fecha: "2026-07-08", fatiga_pierna: 6 });
    expect(res.status).toBe(400);
  });

  it("rechaza valores fuera de rango en tecnica", async () => {
    const res = await request(app).put("/api/trac").set(AUTH).send({ fecha: "2026-07-08", tecnica: 0 });
    expect(res.status).toBe(400);
  });

  it("rechaza valores negativos", async () => {
    const res = await request(app).put("/api/trac").set(AUTH).send({ fecha: "2026-07-08", recuperacion: -1 });
    expect(res.status).toBe(400);
  });

  it("rechaza valores no enteros", async () => {
    const res = await request(app).put("/api/trac").set(AUTH).send({ fecha: "2026-07-08", motivacion: 3.5 });
    expect(res.status).toBe(400);
  });

  it("rechaza si falta la fecha", async () => {
    const res = await request(app).put("/api/trac").set(AUTH).send({ motivacion: 3 });
    expect(res.status).toBe(400);
  });

  it("rechaza fecha con formato inválido", async () => {
    const res = await request(app).put("/api/trac").set(AUTH).send({ fecha: "08-07-2026", motivacion: 3 });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/trac", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM trac;");
    app = await createTestApp(db);
  });

  it("devuelve null para una fecha sin registro", async () => {
    const res = await request(app).get("/api/trac?fecha=2026-07-08").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("devuelve el registro para una fecha cargada", async () => {
    await request(app).put("/api/trac").set(AUTH).send({ fecha: "2026-07-08", fatiga_pierna: 3 });
    const res = await request(app).get("/api/trac?fecha=2026-07-08").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.fatiga_pierna).toBe(3);
  });

  it("rechaza sin query param fecha", async () => {
    const res = await request(app).get("/api/trac").set(AUTH);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/coach/analisis — trac_reciente", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM trac;");
    app = await createTestApp(db);
  });

  it("devuelve 7 días consecutivos con huecos en null y los días sembrados con sus valores", async () => {
    const hoy = daysAgo(0);
    const hace3 = daysAgo(3);

    await request(app).put("/api/trac").set(AUTH).send({ fecha: hoy, motivacion: 5, tecnica: 4 });
    await request(app).put("/api/trac").set(AUTH).send({ fecha: hace3, recuperacion: 2 });

    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    expect(res.status).toBe(200);

    const trac = res.body.trac_reciente as Array<Record<string, unknown>>;
    expect(trac).toHaveLength(7);
    expect(trac[6].fecha).toBe(hoy);
    expect(trac[0].fecha).toBe(daysAgo(6));

    // orden ascendente y consecutivo
    for (let i = 1; i < trac.length; i++) {
      const prev = new Date(trac[i - 1].fecha as string);
      const cur = new Date(trac[i].fecha as string);
      expect((cur.getTime() - prev.getTime()) / 86400000).toBe(1);
    }

    const hoyEntry = trac.find((t) => t.fecha === hoy)!;
    expect(hoyEntry.motivacion).toBe(5);
    expect(hoyEntry.tecnica).toBe(4);

    const hace3Entry = trac.find((t) => t.fecha === hace3)!;
    expect(hace3Entry.recuperacion).toBe(2);

    // un día sin registro: todos los campos null
    const diaSinRegistro = trac.find((t) => t.fecha !== hoy && t.fecha !== hace3)!;
    expect(diaSinRegistro.fatiga_pierna).toBeNull();
    expect(diaSinRegistro.motivacion).toBeNull();
  });

  it("no rompe el resto del payload de análisis", async () => {
    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.trac_reciente)).toBe(true);
  });
});
