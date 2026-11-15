import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestDb, createTestApp, type TestDb } from "./setup.js";
import { hoyLocal } from "../calendario.js";

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

const OBJETIVO = {
  objetivo_kcal: 2500,
  objetivo_proteina_g: 185,
  objetivo_carbohidratos_g: 280,
  objetivo_grasas_g: 70,
};

const DIAS = [{ dia: 1, titulo: "D1", exercises: [{ nombre_libre: "Squat", sets: [{ n_serie: 1, target_reps: 5 }] }] }];

type App = Awaited<ReturnType<typeof createTestApp>>;

async function crearSemana(app: App, semana: number, extra: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/program/weeks").set(AUTH).send({ semana, days: DIAS, ...extra });
  return res;
}

async function leerSemana(app: App, id: number) {
  return (await request(app).get(`/api/program/weeks/${id}`).set(AUTH)).body;
}

describe("Objetivo nutricional — POST /api/program/weeks", () => {
  let app: App;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("guarda los cuatro valores con la nota y fija objetivos_pautados_en en hoy", async () => {
    const res = await crearSemana(app, 1, { ...OBJETIVO, nota_nutricional: "**Recomp**: déficit leve" });
    expect(res.status).toBe(201);

    expect(await leerSemana(app, res.body.id)).toMatchObject({
      ...OBJETIVO,
      nota_nutricional: "**Recomp**: déficit leve",
      objetivos_pautados_en: hoyLocal(),
    });
  });

  it("acepta objetivos_pautados_en explícito", async () => {
    const res = await crearSemana(app, 1, { ...OBJETIVO, objetivos_pautados_en: "2026-11-02" });
    expect(res.status).toBe(201);
    expect((await leerSemana(app, res.body.id)).objetivos_pautados_en).toBe("2026-11-02");
  });

  it("sin objetivo la semana se crea igual, sin objetivo ni fecha", async () => {
    const res = await crearSemana(app, 1);
    expect(res.status).toBe(201);
    expect(await leerSemana(app, res.body.id)).toMatchObject({
      objetivo_kcal: null,
      nota_nutricional: null,
      objetivos_pautados_en: null,
    });
  });

  it("400 si manda solo algunos de los cuatro valores, y no crea la semana", async () => {
    const { objetivo_grasas_g: _sin, ...tres } = OBJETIVO;
    const res = await crearSemana(app, 1, tres);
    expect(res.status).toBe(400);
    const semanas = (await request(app).get("/api/program/weeks").set(AUTH)).body;
    expect(semanas).toHaveLength(0);
  });

  it.each([
    ["negativo", -1],
    ["no entero", 2500.5],
    ["texto", "2500"],
  ])("400 si un valor es %s", async (_caso, valor) => {
    expect((await crearSemana(app, 1, { ...OBJETIVO, objetivo_kcal: valor })).status).toBe(400);
  });

  it("400 si manda nota o fecha sin objetivo", async () => {
    expect((await crearSemana(app, 1, { nota_nutricional: "hola" })).status).toBe(400);
    expect((await crearSemana(app, 1, { objetivos_pautados_en: "2026-11-02" })).status).toBe(400);
  });

  it("400 si objetivos_pautados_en no es una fecha real", async () => {
    expect((await crearSemana(app, 1, { ...OBJETIVO, objetivos_pautados_en: "2026-02-30" })).status).toBe(400);
  });
});

// Escenario de calendario armado por la API: semana 1 entrenada el 01 y el 08 con objetivo
// pautado el 30/10; semana 2 entrenada el 11, con objetivo pautado tarde (el 12).
async function escenarioDosSemanas(app: App) {
  const s1 = (await crearSemana(app, 1, { ...OBJETIVO, nota_nutricional: "A", objetivos_pautados_en: "2026-10-30" }))
    .body.id as number;
  const s2 = (
    await crearSemana(app, 2, {
      ...OBJETIVO,
      objetivo_kcal: 2300,
      nota_nutricional: "**B**",
      objetivos_pautados_en: "2026-11-12",
    })
  ).body.id as number;
  const diaDe = (weekId: number) =>
    (db.prepare("SELECT id FROM program_days WHERE week_id = ?").get(weekId) as { id: number }).id;
  await request(app).patch(`/api/program/days/${diaDe(s1)}`).set(AUTH).send({ fecha: "2026-11-08" });
  await request(app).patch(`/api/program/days/${diaDe(s2)}`).set(AUTH).send({ fecha: "2026-11-11" });
  return { s1, s2 };
}

describe("Vista del día de Nutrición — GET /api/nutricion/dia", () => {
  let app: App;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks; DELETE FROM ingesta_diaria;");
    app = await createTestApp(db);
  });

  it("devuelve la ingesta de la fecha y el objetivo vigente con su nota", async () => {
    const { s1 } = await escenarioDosSemanas(app);
    await request(app)
      .put("/api/ingesta")
      .set(AUTH)
      .send({ fecha: "2026-11-05", kcal: 2450, proteina_g: 180, carbohidratos_g: 260, grasas_g: 75 });

    const res = await request(app).get("/api/nutricion/dia?fecha=2026-11-05").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fecha: "2026-11-05",
      ingesta: { kcal: 2450 },
      objetivo: {
        week_id: s1,
        kcal: 2500,
        proteina_g: 185,
        carbohidratos_g: 280,
        grasas_g: 70,
        nota: "A",
        pautado_en: "2026-10-30",
      },
    });
  });

  it("un descanso tras la última sesión es de la semana siguiente, pero rige el anterior si se pautó tarde", async () => {
    const { s1, s2 } = await escenarioDosSemanas(app);
    expect((await request(app).get("/api/nutricion/dia?fecha=2026-11-10").set(AUTH)).body.objetivo.week_id).toBe(s1);
    const res = await request(app).get("/api/nutricion/dia?fecha=2026-11-12").set(AUTH);
    expect(res.body.objetivo).toMatchObject({ week_id: s2, kcal: 2300, nota: "**B**" });
  });

  it("sin ingesta ni objetivo devuelve null en ambos", async () => {
    const res = await request(app).get("/api/nutricion/dia?fecha=2026-11-05").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ fecha: "2026-11-05", ingesta: null, objetivo: null });
  });

  it("400 sin fecha o con fecha inválida", async () => {
    expect((await request(app).get("/api/nutricion/dia").set(AUTH)).status).toBe(400);
    expect((await request(app).get("/api/nutricion/dia?fecha=2026-02-30").set(AUTH)).status).toBe(400);
  });
});

describe("GET /api/coach/analisis — objetivo vigente en cada fecha de ingesta", () => {
  let app: App;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks; DELETE FROM ingesta_diaria;");
    app = await createTestApp(db);
  });

  it("cada fecha de ingesta trae el objetivo que regía ese día", async () => {
    const { s1, s2 } = await escenarioDosSemanas(app);
    const carga = { kcal: 2400, proteina_g: 180, carbohidratos_g: 260, grasas_g: 75 };
    for (const fecha of ["2026-10-29", "2026-11-11", "2026-11-13"]) {
      await request(app).put("/api/ingesta").set(AUTH).send({ fecha, ...carga });
    }

    const res = await request(app).get("/api/coach/analisis?dias=3650").set(AUTH);
    const filas = res.body.ingesta_diaria as Array<{ fecha: string; objetivo: { week_id: number } | null }>;
    expect(filas.map((f) => [f.fecha, f.objetivo?.week_id ?? null])).toEqual([
      ["2026-10-29", null],
      ["2026-11-11", s1],
      ["2026-11-13", s2],
    ]);
  });
});

describe("Objetivo nutricional — PATCH /api/program/weeks/:id", () => {
  let app: App;
  let weekId: number;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
    weekId = (await crearSemana(app, 1)).body.id;
  });

  it("pautarlo después de crear la semana lo guarda con la nota y fija objetivos_pautados_en en hoy", async () => {
    const res = await request(app)
      .patch(`/api/program/weeks/${weekId}`)
      .set(AUTH)
      .send({ ...OBJETIVO, nota_nutricional: "subí carbos" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...OBJETIVO, nota_nutricional: "subí carbos", objetivos_pautados_en: hoyLocal() });
  });

  it("400 si manda solo algunos de los cuatro valores, y no toca nada", async () => {
    const res = await request(app)
      .patch(`/api/program/weeks/${weekId}`)
      .set(AUTH)
      .send({ objetivo_kcal: 2500, nombre: "no debería quedar" });
    expect(res.status).toBe(400);
    expect(await leerSemana(app, weekId)).toMatchObject({ objetivo_kcal: null, nombre: null });
  });

  it("una corrección no mueve objetivos_pautados_en", async () => {
    await request(app)
      .patch(`/api/program/weeks/${weekId}`)
      .set(AUTH)
      .send({ ...OBJETIVO, objetivos_pautados_en: "2026-11-02" });
    const res = await request(app)
      .patch(`/api/program/weeks/${weekId}`)
      .set(AUTH)
      .send({ ...OBJETIVO, objetivo_kcal: 2400 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ objetivo_kcal: 2400, objetivos_pautados_en: "2026-11-02" });
  });

  it("corregir solo la nota no mueve objetivos_pautados_en ni pisa los valores", async () => {
    await request(app)
      .patch(`/api/program/weeks/${weekId}`)
      .set(AUTH)
      .send({ ...OBJETIVO, objetivos_pautados_en: "2026-11-02" });
    const res = await request(app).patch(`/api/program/weeks/${weekId}`).set(AUTH).send({ nota_nutricional: "nueva" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...OBJETIVO, nota_nutricional: "nueva", objetivos_pautados_en: "2026-11-02" });
  });

  it("mandar objetivos_pautados_en explícito lo cambia", async () => {
    await request(app).patch(`/api/program/weeks/${weekId}`).set(AUTH).send(OBJETIVO);
    const res = await request(app)
      .patch(`/api/program/weeks/${weekId}`)
      .set(AUTH)
      .send({ objetivos_pautados_en: "2026-11-05" });
    expect(res.status).toBe(200);
    expect(res.body.objetivos_pautados_en).toBe("2026-11-05");
  });

  it("400 si manda nota o fecha a una semana que no tiene objetivo", async () => {
    expect(
      (await request(app).patch(`/api/program/weeks/${weekId}`).set(AUTH).send({ nota_nutricional: "x" })).status
    ).toBe(400);
    expect(
      (await request(app).patch(`/api/program/weeks/${weekId}`).set(AUTH).send({ objetivos_pautados_en: "2026-11-05" }))
        .status
    ).toBe(400);
  });
});
