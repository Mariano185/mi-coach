import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { createTestDb, type TestDb } from "./setup.js";

// Auth real (requireAuth de auth.ts), no el guard simplificado de createTestApp: lo que
// se prueba acá es justamente qué deja pasar cada clave.
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

const DEVICE_KEY = "test-device-key";

async function appConAuthReal() {
  const { requireAuth } = await import("../auth.js");
  const { pasosRouter } = await import("../routes/pasos.js");
  const { tracRouter } = await import("../routes/trac.js");
  const { nutricionRouter } = await import("../routes/nutricion.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", requireAuth);
  app.use("/api/pasos", pasosRouter);
  app.use("/api/trac", tracRouter);
  app.use("/api/nutricion", nutricionRouter);
  return app;
}

describe("Clave del atajo de iOS (X-Device-Key)", () => {
  let app: Awaited<ReturnType<typeof appConAuthReal>>;

  beforeAll(async () => {
    app = await appConAuthReal();
  });

  beforeEach(() => {
    db.exec("DELETE FROM pasos_diarios;");
    db.prepare("INSERT OR REPLACE INTO settings (clave, valor) VALUES ('device_api_key', ?)").run(DEVICE_KEY);
  });

  it("con la clave del atajo, cargar pasos funciona", async () => {
    const res = await request(app)
      .put("/api/pasos")
      .set("X-Device-Key", DEVICE_KEY)
      .send({ fecha: "2026-11-14", pasos: 8234 });
    expect(res.status).toBe(200);
    expect(res.body.pasos).toBe(8234);
  });

  it("con la clave del atajo, cualquier otra ruta de /api da 401", async () => {
    const h = { "X-Device-Key": DEVICE_KEY };
    expect((await request(app).get("/api/trac?fecha=2026-11-14").set(h)).status).toBe(401);
    expect((await request(app).put("/api/trac").set(h).send({ fecha: "2026-11-14", sueno: 3 })).status).toBe(401);
    expect((await request(app).get("/api/nutricion/dia?fecha=2026-11-14").set(h)).status).toBe(401);
    // Otro método sobre la misma ruta tampoco.
    expect((await request(app).get("/api/pasos").set(h)).status).toBe(401);
  });

  it("con la clave del atajo, la misma ruta con barra final o querystring también carga", async () => {
    const h = { "X-Device-Key": DEVICE_KEY };
    expect((await request(app).put("/api/pasos/").set(h).send({ fecha: "2026-11-14", pasos: 1 })).status).toBe(200);
    expect((await request(app).put("/api/pasos?x=1").set(h).send({ fecha: "2026-11-14", pasos: 2 })).status).toBe(200);
  });

  it("con la clave del atajo, variantes que no son exactamente PUT /api/pasos fallan cerrado (401)", async () => {
    const h = { "X-Device-Key": DEVICE_KEY };
    expect((await request(app).put("/API/PASOS").set(h).send({ fecha: "2026-11-14", pasos: 1 })).status).toBe(401);
    expect((await request(app).put("/api/pasos/../trac").set(h).send({ fecha: "2026-11-14", sueno: 3 })).status).toBe(401);
  });

  it("una clave del atajo incorrecta da 401", async () => {
    const res = await request(app)
      .put("/api/pasos")
      .set("X-Device-Key", "otra-clave")
      .send({ fecha: "2026-11-14", pasos: 8234 });
    expect(res.status).toBe(401);
  });

  it("la clave del atajo no sirve como clave del coach", async () => {
    const res = await request(app).get("/api/trac?fecha=2026-11-14").set("X-Coach-Key", DEVICE_KEY);
    expect(res.status).toBe(401);
  });

  it("el endpoint de pasos también acepta la clave del coach", async () => {
    const res = await request(app)
      .put("/api/pasos")
      .set("X-Coach-Key", "test-coach-key")
      .send({ fecha: "2026-11-14", pasos: 500 });
    expect(res.status).toBe(200);
  });

  it("la clave se genera si no existe, se loguea una vez y queda estable", async () => {
    const { getDeviceKey } = await import("../auth.js");
    db.prepare("DELETE FROM settings WHERE clave = 'device_api_key'").run();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const k1 = getDeviceKey();
      const k2 = getDeviceKey();
      expect(k1).toMatch(/^[0-9a-f]{48}$/);
      expect(k2).toBe(k1);
      const mensajes = log.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("device_api_key"));
      expect(mensajes).toHaveLength(1);
      expect(mensajes[0]).toContain(k1);
    } finally {
      log.mockRestore();
    }
  });
});
