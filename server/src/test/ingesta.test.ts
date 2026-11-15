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

const CARGA = { kcal: 2450, proteina_g: 180, carbohidratos_g: 260, grasas_g: 75 };

describe("Ingesta diaria — PUT /api/ingesta", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM ingesta_diaria;");
    app = await createTestApp(db);
  });

  it("carga una fecha y leerla devuelve lo cargado", async () => {
    const put = await request(app)
      .put("/api/ingesta")
      .set(AUTH)
      .send({ fecha: "2026-11-10", ...CARGA, comentario: "la cena fue a ojo" });
    expect(put.status).toBe(200);

    const res = await request(app).get("/api/ingesta?fecha=2026-11-10").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fecha: "2026-11-10",
      kcal: 2450,
      proteina_g: 180,
      carbohidratos_g: 260,
      grasas_g: 75,
      comentario: "la cena fue a ojo",
    });
  });

  it("volver a cargar la misma fecha la corrige en vez de duplicarla", async () => {
    await request(app).put("/api/ingesta").set(AUTH).send({ fecha: "2026-11-10", ...CARGA, comentario: "a ojo" });
    const put = await request(app)
      .put("/api/ingesta")
      .set(AUTH)
      .send({ fecha: "2026-11-10", kcal: 2600, proteina_g: 190, carbohidratos_g: 280, grasas_g: 80 });
    expect(put.status).toBe(200);

    const res = await request(app).get("/api/ingesta?desde=2026-11-01&hasta=2026-11-30").set(AUTH);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ kcal: 2600, proteina_g: 190, carbohidratos_g: 280, grasas_g: 80, comentario: null });
  });

  it("acepta 0 como valor (un día de ayuno no es un día sin carga)", async () => {
    const res = await request(app)
      .put("/api/ingesta")
      .set(AUTH)
      .send({ fecha: "2026-11-10", kcal: 0, proteina_g: 0, carbohidratos_g: 0, grasas_g: 0 });
    expect(res.status).toBe(200);
    expect(res.body.kcal).toBe(0);
  });

  for (const campo of ["kcal", "proteina_g", "carbohidratos_g", "grasas_g"] as const) {
    it(`400 si falta ${campo}, y no guarda nada`, async () => {
      const { [campo]: _omitido, ...resto } = CARGA;
      const res = await request(app).put("/api/ingesta").set(AUTH).send({ fecha: "2026-11-10", ...resto });
      expect(res.status).toBe(400);

      const get = await request(app).get("/api/ingesta?fecha=2026-11-10").set(AUTH);
      expect(get.body).toBeNull();
    });
  }

  it.each([
    ["negativo", -1],
    ["no entero", 180.5],
    ["texto", "180"],
    ["null", null],
  ])("400 si un valor es %s", async (_caso, valor) => {
    const res = await request(app)
      .put("/api/ingesta")
      .set(AUTH)
      .send({ fecha: "2026-11-10", ...CARGA, proteina_g: valor });
    expect(res.status).toBe(400);
  });

  it("400 si falta la fecha o tiene formato inválido", async () => {
    expect((await request(app).put("/api/ingesta").set(AUTH).send(CARGA)).status).toBe(400);
    expect(
      (await request(app).put("/api/ingesta").set(AUTH).send({ fecha: "10-11-2026", ...CARGA })).status
    ).toBe(400);
  });

  it("400 si la fecha no existe en el calendario", async () => {
    for (const fecha of ["2026-13-45", "2026-02-30"]) {
      const res = await request(app).put("/api/ingesta").set(AUTH).send({ fecha, ...CARGA });
      expect(res.status).toBe(400);
    }
  });

  it("400 si el comentario no es texto", async () => {
    const res = await request(app).put("/api/ingesta").set(AUTH).send({ fecha: "2026-11-10", ...CARGA, comentario: 5 });
    expect(res.status).toBe(400);
  });

  it("401 sin sesión ni clave del coach", async () => {
    const res = await request(app).put("/api/ingesta").send({ fecha: "2026-11-10", ...CARGA });
    expect(res.status).toBe(401);
  });
});

describe("Ingesta diaria — GET /api/ingesta", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM ingesta_diaria;");
    app = await createTestApp(db);
  });

  it("una fecha sin carga devuelve null, no ceros", async () => {
    const res = await request(app).get("/api/ingesta?fecha=2026-11-10").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("un rango devuelve solo las fechas cargadas, en orden ascendente", async () => {
    for (const fecha of ["2026-11-12", "2026-11-03", "2026-11-08", "2026-10-31", "2026-11-13"]) {
      await request(app).put("/api/ingesta").set(AUTH).send({ fecha, ...CARGA });
    }
    const res = await request(app).get("/api/ingesta?desde=2026-11-01&hasta=2026-11-12").set(AUTH);
    expect(res.status).toBe(200);
    expect((res.body as Array<{ fecha: string }>).map((r) => r.fecha)).toEqual([
      "2026-11-03",
      "2026-11-08",
      "2026-11-12",
    ]);
  });

  it("un rango sin cargas devuelve []", async () => {
    const res = await request(app).get("/api/ingesta?desde=2026-11-01&hasta=2026-11-12").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("400 sin fecha ni rango, o con fechas mal formadas", async () => {
    expect((await request(app).get("/api/ingesta").set(AUTH)).status).toBe(400);
    expect((await request(app).get("/api/ingesta?fecha=ayer").set(AUTH)).status).toBe(400);
    expect((await request(app).get("/api/ingesta?desde=2026-11-01").set(AUTH)).status).toBe(400);
    expect((await request(app).get("/api/ingesta?desde=2026-11-01&hasta=x").set(AUTH)).status).toBe(400);
  });
});

// El guard real de producción (auth.ts), no el simplificado de setup.ts: la Ingesta
// diaria la carga el atleta desde el browser (cookie de sesión) y la lee/escribe el
// coach con su clave.
describe("Ingesta diaria — auth real (sesión del atleta y clave del coach)", () => {
  async function appConAuthReal() {
    const express = (await import("express")).default;
    const cookieParser = (await import("cookie-parser")).default;
    const bcrypt = (await import("bcrypt")).default;
    const { authRouter, requireAuth } = await import("../auth.js");
    const { ingestaRouter } = await import("../routes/ingesta.js");

    db.prepare("INSERT OR REPLACE INTO settings (clave, valor) VALUES ('auth_password_hash', ?)").run(
      bcrypt.hashSync("clave-del-atleta", 4)
    );

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/auth", authRouter);
    app.use("/api", requireAuth);
    app.use("/api/ingesta", ingestaRouter);
    return app;
  }

  beforeEach(() => {
    db.exec("DELETE FROM ingesta_diaria;");
  });

  it("el atleta logueado carga y lee con su cookie de sesión", async () => {
    const app = await appConAuthReal();
    const agente = request.agent(app);
    const login = await agente.post("/api/auth/login").send({ password: "clave-del-atleta" });
    expect(login.status).toBe(200);

    expect((await agente.put("/api/ingesta").send({ fecha: "2026-11-10", ...CARGA })).status).toBe(200);
    const res = await agente.get("/api/ingesta?fecha=2026-11-10");
    expect(res.status).toBe(200);
    expect(res.body.kcal).toBe(2450);
  });

  it("el coach lee con X-Coach-Key", async () => {
    const app = await appConAuthReal();
    await request(app).put("/api/ingesta").set(AUTH).send({ fecha: "2026-11-10", ...CARGA });
    const res = await request(app).get("/api/ingesta?fecha=2026-11-10").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.proteina_g).toBe(180);
  });

  it("sin cookie ni clave, o con clave incorrecta: 401", async () => {
    const app = await appConAuthReal();
    expect((await request(app).get("/api/ingesta?fecha=2026-11-10")).status).toBe(401);
    expect(
      (await request(app).get("/api/ingesta?fecha=2026-11-10").set({ "x-coach-key": "otra" })).status
    ).toBe(401);
  });
});

describe("GET /api/coach/analisis — ingesta_diaria", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  // Fecha local de hace n días (mismo reloj que date('now') de SQLite en UTC: el
  // test usa días enteros lejos de los bordes de la ventana).
  function haceDias(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  beforeEach(async () => {
    db.exec("DELETE FROM ingesta_diaria;");
    app = await createTestApp(db);
    for (const n of [0, 3, 10, 50]) {
      await request(app).put("/api/ingesta").set(AUTH).send({ fecha: haceDias(n), ...CARGA, kcal: 2000 + n });
    }
  });

  it("trae solo las fechas cargadas de la ventana default (42 días), ascendente", async () => {
    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    expect(res.status).toBe(200);
    const filas = res.body.ingesta_diaria as Array<Record<string, unknown>>;
    expect(filas.map((f) => f.fecha)).toEqual([haceDias(10), haceDias(3), haceDias(0)]);
    expect(filas[0]).toMatchObject({
      kcal: 2010,
      proteina_g: 180,
      carbohidratos_g: 260,
      grasas_g: 75,
      comentario: null,
    });
  });

  it("respeta ?dias=N", async () => {
    const corta = await request(app).get("/api/coach/analisis?dias=7").set(AUTH);
    expect((corta.body.ingesta_diaria as Array<{ fecha: string }>).map((f) => f.fecha)).toEqual([
      haceDias(3),
      haceDias(0),
    ]);

    const larga = await request(app).get("/api/coach/analisis?dias=60").set(AUTH);
    expect(larga.body.ingesta_diaria).toHaveLength(4);
  });

  it("una fecha sin carga no aparece (ni como 0)", async () => {
    const res = await request(app).get("/api/coach/analisis?dias=7").set(AUTH);
    const filas = res.body.ingesta_diaria as Array<{ fecha: string; kcal: number }>;
    expect(filas.some((f) => f.fecha === haceDias(1))).toBe(false);
    expect(filas.every((f) => f.kcal > 0)).toBe(true);
  });
});
