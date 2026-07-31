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

function insertDay(semana: number, fecha: string): number {
  const weekId = db
    .prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (?, '2024-01-01', 1)")
    .run(semana).lastInsertRowid as number;
  return db
    .prepare("INSERT INTO program_days (week_id, dia, tipo, fecha, orden) VALUES (?, 1, 'A', ?, 0)")
    .run(weekId, fecha).lastInsertRowid as number;
}

function insertExercise(dayId: number, exerciseId: number): number {
  return db
    .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
    .run(dayId, exerciseId).lastInsertRowid as number;
}

function insertSet(exId: number, nSerie: number, peso: number, reps: number, rpe: number | null = null): void {
  db.prepare(
    "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, ?, ?, ?, ?, 1)"
  ).run(exId, nSerie, peso, reps, rpe);
}

describe("GET /api/stats", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let benchId: number;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
    benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
  });

  it("calcula mejor_e1rm por básico desde program_sets (no sessions/sets)", async () => {
    const dayId = insertDay(1, "2026-01-10");
    const exId = insertExercise(dayId, benchId);

    // Dos series: la de 7 reps a 75kg debe ganar sobre la de 4 reps a 80kg (Epley pondera reps).
    insertSet(exId, 1, 75, 7, 8);
    insertSet(exId, 2, 80, 4, 7.5);

    const res = await request(app).get("/api/stats").set(AUTH);
    expect(res.status).toBe(200);
    const bench_stat = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
    expect(bench_stat.mejor_e1rm).toBeCloseTo(75 * (1 + 7 / 30), 1);
    expect(bench_stat.mejor_fecha).toBe("2026-01-10");
    expect(bench_stat.ultima_fecha).toBe("2026-01-10");
  });

  it("básico sin series devuelve null en los 4 campos (no 0, no rm_inicial) pero la fila existe", async () => {
    const res = await request(app).get("/api/stats").set(AUTH);
    expect(res.status).toBe(200);
    const squat_stat = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Mid/High Bar Back Squat");
    expect(squat_stat).toBeDefined();
    expect(squat_stat.mejor_e1rm).toBeNull();
    expect(squat_stat.mejor_fecha).toBeNull();
    expect(squat_stat.actual_e1rm).toBeNull();
    expect(squat_stat.ultima_fecha).toBeNull();
  });

  it("actual_e1rm ignora un pico viejo: el bench se estanca en un PR de hace semanas mientras las sesiones recientes rinden menos", async () => {
    const d1 = insertExercise(insertDay(1, "2026-06-29"), benchId);
    insertSet(d1, 1, 80, 4); // e1rm 90.7 -> PR

    const d2 = insertExercise(insertDay(2, "2026-07-06"), benchId);
    insertSet(d2, 1, 70, 6); // e1rm 84

    const d3 = insertExercise(insertDay(3, "2026-07-13"), benchId);
    insertSet(d3, 1, 70, 6); // e1rm 84

    const d4 = insertExercise(insertDay(4, "2026-07-20"), benchId);
    insertSet(d4, 1, 68, 7); // e1rm ~83.9

    const res = await request(app).get("/api/stats").set(AUTH);
    const bench = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
    expect(bench.mejor_e1rm).toBeCloseTo(80 * (1 + 4 / 30), 1); // sigue siendo el PR viejo
    expect(bench.actual_e1rm).toBeLessThan(bench.mejor_e1rm); // y actual lo refleja, no lo esconde
  });

  it("el día de volumen no arrastra actual_e1rm hacia abajo: el día pesado gana dentro de la ventana", async () => {
    const pesado = insertExercise(insertDay(1, "2026-07-23"), benchId);
    insertSet(pesado, 1, 80, 4, 7.5); // e1rm 90.7

    const tecnico = insertExercise(insertDay(2, "2026-07-27"), benchId);
    insertSet(tecnico, 1, 75, 5, 7); // e1rm 87.5

    const volumen = insertExercise(insertDay(3, "2026-07-30"), benchId);
    insertSet(volumen, 1, 70, 6, 7); // e1rm 84 - el último entrenado, el más bajo

    const res = await request(app).get("/api/stats").set(AUTH);
    const bench = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
    expect(bench.actual_e1rm).toBeCloseTo(80 * (1 + 4 / 30), 1); // el día pesado, no el último
    expect(bench.ultima_fecha).toBe("2026-07-30"); // pero la fecha sí es la más reciente
  });

  it("la ventana es por sesiones, no por calendario: sesiones de hace meses igual cuentan", async () => {
    const d1 = insertExercise(insertDay(1, "2025-01-05"), benchId);
    insertSet(d1, 1, 70, 5);
    const d2 = insertExercise(insertDay(2, "2025-01-12"), benchId);
    insertSet(d2, 1, 72, 5);
    const d3 = insertExercise(insertDay(3, "2025-01-19"), benchId);
    insertSet(d3, 1, 75, 5);

    const res = await request(app).get("/api/stats").set(AUTH);
    const bench = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
    expect(bench.actual_e1rm).not.toBeNull();
    expect(bench.actual_e1rm).toBeCloseTo(75 * (1 + 5 / 30), 1);
  });

  it("actual_e1rm === mejor_e1rm cuando el PR es la sesión más reciente", async () => {
    const d1 = insertExercise(insertDay(1, "2026-06-01"), benchId);
    insertSet(d1, 1, 70, 5);
    const d2 = insertExercise(insertDay(2, "2026-07-11"), benchId);
    insertSet(d2, 1, 85, 3); // nuevo PR, el más reciente

    const res = await request(app).get("/api/stats").set(AUTH);
    const bench = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
    expect(bench.actual_e1rm).toBe(bench.mejor_e1rm);
    expect(bench.mejor_fecha).toBe("2026-07-11");
  });

  it("con una sola sesión entrenada, actual_e1rm === mejor_e1rm sin crashear", async () => {
    const d1 = insertExercise(insertDay(1, "2026-07-11"), benchId);
    insertSet(d1, 1, 80, 5);

    const res = await request(app).get("/api/stats").set(AUTH);
    expect(res.status).toBe(200);
    const bench = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
    expect(bench.actual_e1rm).toBe(bench.mejor_e1rm);
  });

  it("series incompletas (peso sin reps) no generan e1RM", async () => {
    const dayId = insertDay(1, "2026-07-11");
    const exId = insertExercise(dayId, benchId);
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, hecha) VALUES (?, 1, 80, NULL, 0)"
    ).run(exId);

    const res = await request(app).get("/api/stats").set(AUTH);
    const bench = res.body.basicos.find((b: { nombre: string }) => b.nombre === "Flat Bench Press (barra)");
    expect(bench.mejor_e1rm).toBeNull();
    expect(bench.actual_e1rm).toBeNull();
  });
});
