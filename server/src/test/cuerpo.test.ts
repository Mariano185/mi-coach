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

// Fecha de hace n días (UTC, mismo reloj que date('now') de SQLite).
function haceDias(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("Registro corporal — PUT /api/cuerpo", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM registro_corporal;");
    app = await createTestApp(db);
  });

  it("guarda peso, perímetros y notas, y leer la fecha devuelve lo guardado", async () => {
    const put = await request(app)
      .put("/api/cuerpo")
      .set(AUTH)
      .send({ fecha: "2026-11-10", peso_kg: 82.4, brazo_cm: 38.5, pierna_cm: 58, abdomen_cm: 86.2, notas: "post viaje" });
    expect(put.status).toBe(200);

    const res = await request(app).get("/api/cuerpo?fecha=2026-11-10").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fecha: "2026-11-10",
      peso_kg: 82.4,
      brazo_cm: 38.5,
      pierna_cm: 58,
      abdomen_cm: 86.2,
      notas: "post viaje",
    });
  });

  it("los perímetros son opcionales: solo peso alcanza", async () => {
    const put = await request(app).put("/api/cuerpo").set(AUTH).send({ fecha: "2026-11-10", peso_kg: 82 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ peso_kg: 82, brazo_cm: null, pierna_cm: null, abdomen_cm: null, notas: null });
  });

  it("guardar dos veces la misma fecha deja una sola fila con lo último", async () => {
    await request(app).put("/api/cuerpo").set(AUTH).send({ fecha: "2026-11-10", peso_kg: 82, brazo_cm: 38, notas: "x" });
    await request(app).put("/api/cuerpo").set(AUTH).send({ fecha: "2026-11-10", peso_kg: 81.6 });

    const res = await request(app).get("/api/cuerpo").set(AUTH);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ fecha: "2026-11-10", peso_kg: 81.6, brazo_cm: null, notas: null });
  });

  it.each([
    ["falta", undefined],
    ["es 0", 0],
    ["es negativo", -80],
    ["es texto", "82"],
    ["es null", null],
  ])("400 si el peso %s, y no guarda nada", async (_caso, peso_kg) => {
    const res = await request(app).put("/api/cuerpo").set(AUTH).send({ fecha: "2026-11-10", peso_kg });
    expect(res.status).toBe(400);
    expect((await request(app).get("/api/cuerpo?fecha=2026-11-10").set(AUTH)).body).toBeNull();
  });

  for (const campo of ["brazo_cm", "pierna_cm", "abdomen_cm"] as const) {
    it.each([
      ["0", 0],
      ["negativo", -1],
      ["texto", "38"],
    ])(`400 si ${campo} viene %s`, async (_caso, valor) => {
      const res = await request(app)
        .put("/api/cuerpo")
        .set(AUTH)
        .send({ fecha: "2026-11-10", peso_kg: 82, [campo]: valor });
      expect(res.status).toBe(400);
    });
  }

  it("400 si la fecha falta, está mal formada o no existe", async () => {
    for (const fecha of [undefined, "10-11-2026", "2026-02-30"]) {
      const res = await request(app).put("/api/cuerpo").set(AUTH).send({ fecha, peso_kg: 82 });
      expect(res.status).toBe(400);
    }
  });

  it("400 si las notas no son texto", async () => {
    const res = await request(app).put("/api/cuerpo").set(AUTH).send({ fecha: "2026-11-10", peso_kg: 82, notas: 5 });
    expect(res.status).toBe(400);
  });

  it("401 sin sesión ni clave del coach", async () => {
    const res = await request(app).put("/api/cuerpo").send({ fecha: "2026-11-10", peso_kg: 82 });
    expect(res.status).toBe(401);
  });
});

describe("Registro corporal — GET /api/cuerpo", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM registro_corporal;");
    app = await createTestApp(db);
  });

  it("una fecha sin registro devuelve null", async () => {
    const res = await request(app).get("/api/cuerpo?fecha=2026-11-10").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("sin parámetros devuelve todos los registros en orden ascendente", async () => {
    for (const fecha of ["2026-11-12", "2026-11-03", "2026-11-08"]) {
      await request(app).put("/api/cuerpo").set(AUTH).send({ fecha, peso_kg: 80 });
    }
    const res = await request(app).get("/api/cuerpo").set(AUTH);
    expect((res.body as Array<{ fecha: string }>).map((r) => r.fecha)).toEqual([
      "2026-11-03",
      "2026-11-08",
      "2026-11-12",
    ]);
  });

  it("400 con fecha mal formada", async () => {
    expect((await request(app).get("/api/cuerpo?fecha=ayer").set(AUTH)).status).toBe(400);
  });
});

describe("GET /api/stats — tendencia de peso desde el Registro corporal", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM registro_corporal;");
    app = await createTestApp(db);
  });

  it("devuelve peso por fecha con promedio móvil de 7 días", async () => {
    const pesos = [80, 81, 82, 83, 84, 85, 86, 87];
    for (const [i, peso_kg] of pesos.entries()) {
      await request(app).put("/api/cuerpo").set(AUTH).send({ fecha: `2026-11-0${i + 1}`, peso_kg, brazo_cm: 38 });
    }
    const res = await request(app).get("/api/stats").set(AUTH);
    expect(res.status).toBe(200);
    const t = res.body.tendencia_peso as Array<{ fecha: string; peso_kg: number; promedio_movil_7d: number }>;
    expect(t).toHaveLength(8);
    expect(t[0]).toEqual({ fecha: "2026-11-01", peso_kg: 80, promedio_movil_7d: 80 });
    expect(t[1].promedio_movil_7d).toBe(80.5);
    // Último punto: promedio de 81..87 (las 7 fechas previas incluida la actual).
    expect(t[7]).toEqual({ fecha: "2026-11-08", peso_kg: 87, promedio_movil_7d: 84 });
  });
});

describe("GET /api/coach/analisis — peso_corporal", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM registro_corporal;");
    app = await createTestApp(db);
    // Uno por día de hace 50 a hace 0, peso = 100 − n; perímetros solo en algunos.
    for (let n = 50; n >= 0; n--) {
      const perimetros = n === 3 ? { brazo_cm: 38.5, pierna_cm: 58, abdomen_cm: 86 } : {};
      await request(app)
        .put("/api/cuerpo")
        .set(AUTH)
        .send({ fecha: haceDias(n), peso_kg: 100 - n, ...perimetros, ...(n === 3 ? { notas: "en ayunas" } : {}) });
    }
  });

  it("respeta ?dias=N: solo registros de la ventana, ascendente", async () => {
    const res = await request(app).get("/api/coach/analisis?dias=7").set(AUTH);
    const filas = res.body.peso_corporal as Array<{ fecha: string }>;
    expect(filas.map((f) => f.fecha)).toEqual([7, 6, 5, 4, 3, 2, 1, 0].map(haceDias));
  });

  it("trae los perímetros y las notas de cada registro", async () => {
    const res = await request(app).get("/api/coach/analisis?dias=7").set(AUTH);
    const filas = res.body.peso_corporal as Array<Record<string, unknown>>;
    expect(filas.find((f) => f.fecha === haceDias(3))).toMatchObject({
      peso_kg: 97,
      brazo_cm: 38.5,
      pierna_cm: 58,
      abdomen_cm: 86,
      notas: "en ayunas",
    });
    expect(filas.find((f) => f.fecha === haceDias(2))).toMatchObject({ brazo_cm: null, pierna_cm: null, abdomen_cm: null });
  });

  it("el promedio móvil del primer día de la ventana usa los 6 registros previos a la ventana", async () => {
    const res = await request(app).get("/api/coach/analisis?dias=7").set(AUTH);
    const primera = (res.body.peso_corporal as Array<{ fecha: string; pm_7d: number }>)[0];
    // hace 7 días = 93; los 7 registros hasta ahí son 87..93 → promedio 90.
    expect(primera).toMatchObject({ fecha: haceDias(7), pm_7d: 90 });
  });

  it("sin ?dias usa la ventana default de 42 días", async () => {
    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    expect(res.body.peso_corporal).toHaveLength(43);
  });
});
