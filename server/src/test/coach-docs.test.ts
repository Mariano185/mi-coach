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

describe("GET /api/coach/docs", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("requiere auth: sin X-Coach-Key devuelve 401", async () => {
    const res = await request(app).get("/api/coach/docs");
    expect(res.status).toBe(401);
  });

  it("200 con secciones no vacío, cada una con id, titulo y markdown", async () => {
    const res = await request(app).get("/api/coach/docs").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.secciones.length).toBeGreaterThan(0);
    for (const seccion of res.body.secciones) {
      expect(seccion).toHaveProperty("id");
      expect(seccion).toHaveProperty("titulo");
      expect(typeof seccion.markdown).toBe("string");
      expect(seccion.markdown.length).toBeGreaterThan(0);
    }
  });

  it("incluye las tres secciones migradas (flujo-semana, enciclopedia, analisis)", async () => {
    const res = await request(app).get("/api/coach/docs").set(AUTH);
    const ids = (res.body.secciones as Array<{ id: string }>).map((s) => s.id).sort();
    expect(ids).toEqual(["analisis", "enciclopedia", "flujo-semana"]);
  });

  it("?seccion=<id> devuelve solo esa sección", async () => {
    const res = await request(app).get("/api/coach/docs?seccion=enciclopedia").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.secciones).toHaveLength(1);
    expect(res.body.secciones[0].id).toBe("enciclopedia");
  });

  it("?seccion=<inexistente> devuelve 404", async () => {
    const res = await request(app).get("/api/coach/docs?seccion=no-existe").set(AUTH);
    expect(res.status).toBe(404);
  });

  it("generado.endpoints incluye rutas reales conocidas del coach", async () => {
    const res = await request(app).get("/api/coach/docs").set(AUTH);
    const rutas = (res.body.generado.endpoints as Array<{ metodo: string; ruta: string }>).map(
      (e) => `${e.metodo} ${e.ruta}`
    );
    expect(rutas).toContain("GET /api/coach/analisis");
    expect(rutas).toContain("GET /api/coach/adherencia");
    expect(rutas).toContain("GET /api/coach/progresion/:exercise_id");
    expect(rutas).toContain("GET /api/coach/docs");
    expect(rutas).toContain("POST /api/program/weeks");
  });

  it("generado.analisis_bloques (los no opt-in) coincide con las claves reales del default de /analisis", async () => {
    const [docs, analisis] = await Promise.all([
      request(app).get("/api/coach/docs").set(AUTH),
      request(app).get("/api/coach/analisis").set(AUTH),
    ]);
    const bloquesDefault = (
      docs.body.generado.analisis_bloques as Array<{ bloque: string; opt_in: boolean }>
    )
      .filter((b) => !b.opt_in)
      .map((b) => b.bloque)
      .sort();
    const clavesReales = Object.keys(analisis.body).sort();
    expect(bloquesDefault).toEqual(clavesReales);
  });

  it("generado.analisis_bloques marca ejercicios como opt_in, aunque no venga en el default", async () => {
    const [docs, analisis] = await Promise.all([
      request(app).get("/api/coach/docs").set(AUTH),
      request(app).get("/api/coach/analisis").set(AUTH),
    ]);
    expect(analisis.body).not.toHaveProperty("ejercicios");

    const bloques = docs.body.generado.analisis_bloques as Array<{ bloque: string; opt_in: boolean }>;
    const ejercicios = bloques.find((b) => b.bloque === "ejercicios");
    expect(ejercicios).toEqual({ bloque: "ejercicios", opt_in: true });
  });

  it("generado.version_deploy es un string no vacío", async () => {
    const res = await request(app).get("/api/coach/docs").set(AUTH);
    expect(typeof res.body.generado.version_deploy).toBe("string");
    expect(res.body.generado.version_deploy.length).toBeGreaterThan(0);
  });

  it("una llamada con ?seccion también trae la capa generada completa", async () => {
    const res = await request(app).get("/api/coach/docs?seccion=analisis").set(AUTH);
    expect(res.body.generado.endpoints.length).toBeGreaterThan(0);
    expect(res.body.generado.analisis_bloques.length).toBeGreaterThan(0);
  });
});
