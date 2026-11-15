import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestDb, createTestApp, type TestDb } from "./setup.js";
import type { E1rmConfianza } from "../types.js";

// e1RM proyectado con RPE (tabla RTS) y confianza del e1RM — issue #14, ADR 0002.
// Los números esperados salen de los criterios de aceptación de la issue, no de una
// fórmula recalculada acá: el test fija el contrato, la vista es la implementación.

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

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function benchId(): number {
  return (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
}

let semana = 0;
// Un día con una serie hecha de bench por cada [peso, reps, rpe]. Devuelve el dayId.
function seedDia(fecha: string, series: Array<[number, number, number | null]>): number {
  const weekId = db
    .prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (?, '2024-01-01', 1)")
    .run(++semana).lastInsertRowid as number;
  const dayId = db
    .prepare("INSERT INTO program_days (week_id, dia, tipo, fecha, orden) VALUES (?, 1, 'A', ?, 0)")
    .run(weekId, fecha).lastInsertRowid as number;
  const peId = db
    .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
    .run(dayId, benchId()).lastInsertRowid as number;
  series.forEach(([peso, reps, rpe], i) => {
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, ?, ?, ?, ?, 1)"
    ).run(peId, i + 1, peso, reps, rpe);
  });
  return dayId;
}

// Forma de cada serie en GET /program/exercises/:id (filas de v_program_sets_e1rm).
type SerieConE1rm = { n_serie: number; e1rm: number | null; e1rm_confianza: E1rmConfianza | null; rir: number | null };

describe("e1RM con RPE (tabla RTS)", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  async function seriesDe(series: Array<[number, number, number | null]>): Promise<SerieConE1rm[]> {
    const dayId = seedDia("2026-01-10", series);
    const peId = (db.prepare("SELECT id FROM program_exercises WHERE day_id = ?").get(dayId) as { id: number }).id;
    const res = await request(app).get(`/api/program/exercises/${peId}`).set(AUTH);
    expect(res.status).toBe(200);
    return res.body.sets as SerieConE1rm[];
  }

  it.each([
    [80, 3, 7, 95.6, "alta"],
    [85, 3, 9, 95.3, "alta"],
    [100, 2, 8.5, 110.3, "alta"], // 3,5 reps proyectadas → interpola 92,2/89,2 → 90,7 %
    [100, 1, 10, 100, "alta"], // 1 rep al fallo = 100 %
    [80, 4, 6, 101.8, "baja"], // 8 proyectadas → 78,6 %
    [80, 5, 5, 108.3, "baja"], // borde: RPE 5 todavía tiene e1RM
  ])("%s kg × %s @%s → e1RM %s, confianza %s", async (peso, reps, rpe, e1rm, confianza) => {
    const [s] = await seriesDe([[peso, reps, rpe]]);
    expect(s.e1rm).toBe(e1rm);
    expect(s.e1rm_confianza).toBe(confianza);
  });

  it.each([
    ["proyecta 11 reps (75×9 @8)", 75, 9, 8],
    ["RPE < 5 (@4,5)", 80, 3, 4.5],
    ["sin RPE (no asume 10)", 80, 3, null],
  ])("sin e1RM: %s", async (_caso, peso, reps, rpe) => {
    const [s] = await seriesDe([[peso, reps, rpe]]);
    expect(s.e1rm).toBeNull();
    expect(s.e1rm_confianza).toBeNull();
  });

  it("expone el RIR de la serie (10 − RPE, redondeado)", async () => {
    const [s] = await seriesDe([[100, 5, 7]]);
    expect(s.rir).toBe(3);
  });

  it("10 reps proyectadas exactas todavía tienen e1RM (el tope es > 10)", async () => {
    const [s] = await seriesDe([[73.9, 8, 8]]);
    expect(s.e1rm).toBe(100);
  });

  describe("una serie de confianza baja no entra en el mejor e1RM", () => {
    // Misma sesión: 80×4 @6 da 101,8 (baja) y supera a 80×3 @7 = 95,6 (alta).
    // El mejor tiene que ser 95,6.
    const SERIES: Array<[number, number, number]> = [[80, 4, 6], [80, 3, 7]];

    it("/stats: mejor_e1rm y actual_e1rm solo con confianza alta", async () => {
      seedDia("2026-01-10", SERIES);
      const res = await request(app).get("/api/stats").set(AUTH);
      const bench = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
      expect(bench.mejor_e1rm).toBe(95.6);
      expect(bench.actual_e1rm).toBe(95.6);
    });

    it("/stats: un básico con solo series de confianza baja queda en null", async () => {
      seedDia("2026-01-10", [[80, 4, 6]]);
      const res = await request(app).get("/api/stats").set(AUTH);
      const bench = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
      expect(bench.mejor_e1rm).toBeNull();
      expect(bench.actual_e1rm).toBeNull();
    });

    it("/coach/analisis: mejor_e1rm_basicos solo con confianza alta", async () => {
      seedDia(diasAtras(1), SERIES);
      const res = await request(app).get("/api/coach/analisis").set(AUTH);
      const bench = (res.body.mejor_e1rm_basicos as Array<{ nombre: string; mejor_e1rm: number }>).find(
        (b) => b.nombre === "Flat Bench Press (barra)"
      );
      expect(bench?.mejor_e1rm).toBe(95.6);
    });

    it("/coach/analisis: progresion_basicos trae también la fila de confianza baja, marcada", async () => {
      seedDia(diasAtras(1), SERIES);
      const res = await request(app).get("/api/coach/analisis").set(AUTH);
      const filas = (res.body.progresion_basicos as Array<{ nombre: string; e1rm: number; e1rm_confianza: string }>)
        .filter((f) => f.nombre === "Flat Bench Press (barra)")
        .sort((a, b) => a.e1rm - b.e1rm)
        .map((f) => [f.e1rm, f.e1rm_confianza]);
      expect(filas).toEqual([[95.6, "alta"], [101.8, "baja"]]);
    });

    it("/coach/progresion: mejor_e1rm de la sesión solo con alta; cada serie trae su confianza", async () => {
      seedDia(diasAtras(1), SERIES);
      const res = await request(app).get(`/api/coach/progresion/${benchId()}`).set(AUTH);
      expect(res.status).toBe(200);
      const [sesion] = res.body.sesiones;
      expect(sesion.mejor_e1rm).toBe(95.6);
      expect(sesion.series.map((s: SerieConE1rm) => s.e1rm_confianza)).toEqual(["baja", "alta"]);
    });

    it("/coach/progresion: una sesión sin ninguna serie de confianza alta tiene mejor_e1rm null", async () => {
      seedDia(diasAtras(1), [[80, 4, 6], [75, 9, 8]]);
      const res = await request(app).get(`/api/coach/progresion/${benchId()}`).set(AUTH);
      const [sesion] = res.body.sesiones;
      expect(sesion.mejor_e1rm).toBeNull();
      expect(sesion.n_series).toBe(2); // las series sin e1RM siguen contando para volumen
    });
  });
});
