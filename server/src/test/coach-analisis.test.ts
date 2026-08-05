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
const hoy = new Date().toISOString().slice(0, 10);

function registrarSeries(exerciseId: number, nSeries: number, fecha = hoy): void {
  const weekId = db
    .prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (?, '2026-01-01', 1)")
    .run(Math.floor(Math.random() * 100000)).lastInsertRowid as number;
  const dayId = db
    .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, ?, 0)")
    .run(weekId, fecha).lastInsertRowid as number;
  const peId = db
    .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
    .run(dayId, exerciseId).lastInsertRowid as number;
  for (let i = 1; i <= nSeries; i++) {
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, ?, 60, 8, 8, 1)"
    ).run(peId, i);
  }
}

describe("GET /api/coach/analisis — volumen por músculo", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    seedEnciclopedia(db);
    app = await createTestApp(db);
  });

  it("ya no expone volumen_por_categoria; expone volumen_por_musculo", async () => {
    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("volumen_por_categoria");
    expect(res.body).toHaveProperty("volumen_por_musculo");
  });

  it("fracciona una serie de remo entre dorsal (1.0) y bíceps (0.5)", async () => {
    const remoId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Remo con barra'").get() as { id: number }).id;
    registrarSeries(remoId, 4);

    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    const vol = res.body.volumen_por_musculo as Array<{ musculo: string; series: number }>;

    expect(vol.find((v) => v.musculo === "Dorsal ancho")?.series).toBe(4);
    expect(vol.find((v) => v.musculo.includes("Bíceps braquial"))?.series).toBe(2);
  });

  it("los estabilizadores no aparecen: no acumulan volumen computable", async () => {
    const remoId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Remo con barra'").get() as { id: number }).id;
    registrarSeries(remoId, 4);

    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    const vol = res.body.volumen_por_musculo as Array<{ musculo: string }>;
    // El erector espinal estabiliza el remo con barra pero no suma volumen.
    expect(vol.find((v) => v.musculo === "Erector espinal")).toBeUndefined();
  });

  it("suma el volumen de un mismo músculo a través de ejercicios distintos", async () => {
    // Dos empujes horizontales distintos que comparten el pectoral esternal.
    const banca = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
    const mancuernas = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Dumbbell Bench Press'").get() as { id: number }).id;
    registrarSeries(banca, 3);
    registrarSeries(mancuernas, 2);

    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    const vol = res.body.volumen_por_musculo as Array<{ musculo: string; series: number }>;
    const esternal = vol.find((v) => v.musculo.includes("esternocostal"));
    expect(esternal?.series).toBe(5); // 3 + 2, ambos agonista a 1.0
  });
});

describe("GET /api/coach/analisis — library de ejercicios", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    seedEnciclopedia(db);
    app = await createTestApp(db);
  });

  it("es compacta pero trae lo necesario para elegir variante", async () => {
    const res = await request(app).get("/api/coach/analisis?incluir=ejercicios").set(AUTH);
    const pausa = (res.body.ejercicios as Array<Record<string, unknown>>).find(
      (e) => e.nombre === "Press banca con pausa 3s en el pecho"
    )!;

    expect(pausa.patron).toBe("Empuje horizontal");
    expect(pausa.tipo_variante).toBe("pausa");
    expect(pausa.ejercicio_padre_id).toBeTypeOf("number");
    expect(pausa.proposito).toContain("posición inferior");
    expect(pausa.costo_fatiga).toBeTypeOf("number");
    // No incluye la grilla muscular completa: eso va por GET /exercises/:id.
    expect(pausa).not.toHaveProperty("musculos");
  });

  it("marca rastrea_e1rm solo en los 3 movimientos de competencia", async () => {
    const res = await request(app).get("/api/coach/analisis?incluir=ejercicios").set(AUTH);
    const conE1rm = (res.body.ejercicios as Array<{ nombre: string; rastrea_e1rm: number }>)
      .filter((e) => e.rastrea_e1rm === 1)
      .map((e) => e.nombre)
      .sort();

    expect(conE1rm).toEqual([
      "Conventional Deadlift",
      "Flat Bench Press (barra)",
      "Mid/High Bar Back Squat",
    ]);
  });

  it("una variante de banca no rastrea e1RM aunque su padre sí", async () => {
    const res = await request(app).get("/api/coach/analisis?incluir=ejercicios").set(AUTH);
    const pausa = (res.body.ejercicios as Array<{ nombre: string; rastrea_e1rm: number }>).find(
      (e) => e.nombre === "Press banca con pausa 3s en el pecho"
    )!;
    expect(pausa.rastrea_e1rm).toBe(0);
  });
});

describe("GET /api/coach/analisis — e1RM sigue funcionando tras el cutover", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    seedEnciclopedia(db);
    app = await createTestApp(db);
  });

  it("computa e1RM de un movimiento de competencia usando rastrea_e1rm", async () => {
    const banca = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
    registrarSeries(banca, 2);

    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    const mejores = res.body.mejor_e1rm_basicos as Array<{ nombre: string; mejor_e1rm: number }>;
    const bench = mejores.find((m) => m.nombre === "Flat Bench Press (barra)");
    expect(bench?.mejor_e1rm).toBeCloseTo(60 * (1 + 8 / 30), 1);
  });

  it("una variante no contamina el e1RM del movimiento de competencia", async () => {
    const pausaId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Press banca con pausa 3s en el pecho'").get() as { id: number }).id;
    registrarSeries(pausaId, 3);

    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    const mejores = res.body.mejor_e1rm_basicos as Array<{ nombre: string }>;
    // La banca con pausa no aparece: su 1RM no es comparable con el de competencia.
    expect(mejores.find((m) => m.nombre === "Press banca con pausa 3s en el pecho")).toBeUndefined();
  });
});
