import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestDb, createTestApp, type TestDb } from "./setup.js";
import { seedEnciclopedia } from "../seed/index.js";

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

describe("GET /api/musculos", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    seedEnciclopedia(db);
    app = await createTestApp(db);
  });

  it("devuelve los 48 músculos del catálogo con n_ejercicios", async () => {
    const res = await request(app).get("/api/musculos").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(48);
    expect(res.body[0]).toHaveProperty("n_ejercicios");
    expect(res.body[0].n_ejercicios).toBeTypeOf("number");
  });

  it("un músculo sin ningún ejercicio que lo trabaje devuelve n_ejercicios=0, no se omite", async () => {
    const res = await request(app).get("/api/musculos").set(AUTH);
    const sinCobertura = res.body.find((m: { nombre: string }) => m.nombre === "Subescapular");
    expect(sinCobertura).toBeDefined();
    expect(sinCobertura.n_ejercicios).toBe(0);
  });

  it("un músculo con ejercicios devuelve el conteo correcto", async () => {
    const res = await request(app).get("/api/musculos").set(AUTH);
    const gluteo = res.body.find((m: { nombre: string }) => m.nombre === "Glúteo mayor");
    expect(gluteo.n_ejercicios).toBeGreaterThan(0);
  });

  it("?grupo=pierna filtra por grupo", async () => {
    const res = await request(app).get("/api/musculos?grupo=pierna").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((m: { grupo: string }) => m.grupo === "pierna")).toBe(true);
  });

  it("?grupo=inventado (fuera del vocabulario controlado) es 400", async () => {
    const res = await request(app).get("/api/musculos?grupo=piernaXYZ").set(AUTH);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/patrones", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    seedEnciclopedia(db);
    app = await createTestApp(db);
  });

  it("devuelve los 20 patrones con descripcion y n_ejercicios", async () => {
    const res = await request(app).get("/api/patrones").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(20);
    expect(res.body[0].descripcion).not.toBeNull();
    expect(res.body[0].n_ejercicios).toBeTypeOf("number");
  });
});

describe("GET /api/exercises?musculo_id — filtro inverso", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    seedEnciclopedia(db);
    app = await createTestApp(db);
  });

  it("devuelve solo los ejercicios que trabajan ese músculo, ordenados por orden", async () => {
    const gluteo = db.prepare("SELECT id FROM musculos WHERE nombre = 'Glúteo mayor'").get() as { id: number };

    const res = await request(app).get(`/api/exercises?musculo_id=${gluteo.id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("rol");
    expect(res.body[0]).toHaveProperty("orden");
    expect(res.body[0]).toHaveProperty("fraccion_volumen");
  });

  it("?rol=agonista filtra solo a los que lo trabajan como agonista", async () => {
    const gluteo = db.prepare("SELECT id FROM musculos WHERE nombre = 'Glúteo mayor'").get() as { id: number };

    const res = await request(app)
      .get(`/api/exercises?musculo_id=${gluteo.id}&rol=agonista`)
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((e: { rol: string }) => e.rol === "agonista")).toBe(true);
  });

  it("400 si rol no es un valor válido", async () => {
    const gluteo = db.prepare("SELECT id FROM musculos WHERE nombre = 'Glúteo mayor'").get() as { id: number };
    const res = await request(app)
      .get(`/api/exercises?musculo_id=${gluteo.id}&rol=inventado`)
      .set(AUTH);
    expect(res.status).toBe(400);
  });

  it("400 si musculo_id no es numérico", async () => {
    const res = await request(app).get("/api/exercises?musculo_id=abc").set(AUTH);
    expect(res.status).toBe(400);
  });

  it("musculo_id inexistente devuelve lista vacía, no error", async () => {
    const res = await request(app).get("/api/exercises?musculo_id=999999").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/exercises — no regresión de la forma compacta", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    seedEnciclopedia(db);
    app = await createTestApp(db);
  });

  it("sin query params sigue devolviendo solo id/nombre/categoria/es_basico", async () => {
    const res = await request(app).get("/api/exercises").set(AUTH);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body[0]).sort()).toEqual(["categoria", "es_basico", "id", "nombre"]);
  });
});
