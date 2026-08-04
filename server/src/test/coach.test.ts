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

describe("GET /api/coach/analisis", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  it("expone notas_coach y notas_atleta por separado en sesiones_realizadas", async () => {
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, nombre, fecha_creada, activa) VALUES (1, 'Test', '2024-01-01', 1)")
      .run().lastInsertRowid as number;

    const hoy = new Date().toISOString().slice(0, 10);
    const dayId = db
      .prepare(
        "INSERT INTO program_days (week_id, dia, tipo, titulo, notas, notas_atleta, fecha, orden) VALUES (?, 1, 'A', 'Día 1', ?, ?, ?, 0)"
      )
      .run(weekId, "Subí 2.5kg si el RPE acompaña.", "Sentí flojo el hombro.", hoy).lastInsertRowid as number;

    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;
    const exId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, reps_text, orden) VALUES (?, ?, 'main', '3×5', 0)")
      .run(dayId, squat).lastInsertRowid as number;

    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, real_peso, real_reps, hecha) VALUES (?, 1, 5, 100, 5, 1)"
    ).run(exId);

    const res = await request(app).get("/api/coach/analisis?dias=42").set(AUTH);
    expect(res.status).toBe(200);

    const sesion = res.body.sesiones_realizadas.find((s: { dia: number }) => s.dia === 1);
    expect(sesion).toBeDefined();
    expect(sesion.notas_coach).toBe("Subí 2.5kg si el RPE acompaña.");
    expect(sesion.notas_atleta).toBe("Sentí flojo el hombro.");
    expect(sesion.notas).toBeUndefined();
  });
});

describe("GET /api/coach/adherencia", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  function diasAtras(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  // Idempotente: exercises no se limpia en beforeEach, así que un INSERT literal
  // colisiona con UNIQUE(nombre) entre tests.
  function seedEjercicio(nombre: string): number {
    db.prepare(
      `INSERT INTO exercises (nombre, categoria, es_basico)
       SELECT ?, 'Accesorio', 0
       WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE nombre = ?)`
    ).run(nombre, nombre);
    return (db.prepare("SELECT id FROM exercises WHERE nombre = ?").get(nombre) as { id: number }).id;
  }

  // Crea una semana con un día (fecha dada, o NULL si no se pasa) y n ejercicios,
  // cada uno con 1 serie. `hechos` indica cuántos de esos ejercicios (desde el principio
  // del orden) tienen su serie marcada hecha=1. `ordenes` permite forzar valores de orden
  // repetidos (para simular datos viejos con orden=0,0,0).
  function seedDia(opts: {
    fecha: string | null;
    nombres: string[];
    hechos: number;
    ordenes?: number[];
    conSeries?: boolean[]; // por defecto todos tienen serie
  }): { dayId: number; weekId: number } {
    const semana = Number(
      (db.prepare("SELECT COALESCE(MAX(semana), 0) + 1 AS s FROM program_weeks").get() as { s: number }).s
    );
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, nombre, fecha_creada, activa) VALUES (?, 'Test', '2024-01-01', 1)")
      .run(semana).lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, tipo, fecha, orden) VALUES (?, 1, 'A', ?, 0)")
      .run(weekId, opts.fecha).lastInsertRowid as number;

    opts.nombres.forEach((nombre, i) => {
      const exId = seedEjercicio(nombre);
      const orden = opts.ordenes ? opts.ordenes[i] : i;
      const peId = db
        .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', ?)")
        .run(dayId, exId, orden).lastInsertRowid as number;

      const tieneSerie = opts.conSeries ? opts.conSeries[i] : true;
      if (tieneSerie) {
        const hecha = i < opts.hechos ? 1 : 0;
        db.prepare(
          "INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, real_peso, real_reps, hecha) VALUES (?, 1, 8, ?, ?, ?)"
        ).run(peId, hecha ? 50 : null, hecha ? 8 : null, hecha);
      }
    });

    return { dayId, weekId };
  }

  it("calcula la posición por rank, no por pe.orden crudo (datos viejos con orden=0,0,0)", async () => {
    seedDia({
      fecha: diasAtras(1),
      nombres: ["Ej A", "Ej B", "Ej C"],
      hechos: 3,
      ordenes: [0, 0, 0],
    });

    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    expect(res.status).toBe(200);
    const posiciones = res.body.por_posicion.map((p: { posicion: number }) => p.posicion);
    expect(posiciones).toEqual([1, 2, 3]);
  });

  it("excluye días sin fecha (programados y nunca entrenados)", async () => {
    seedDia({ fecha: diasAtras(1), nombres: ["Ej A"], hechos: 1 });
    seedDia({ fecha: null, nombres: ["Ej B", "Ej C"], hechos: 0 });

    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.dias_analizados).toBe(1);
    const pos1 = res.body.por_posicion.find((p: { posicion: number }) => p.posicion === 1);
    expect(pos1.series_programadas).toBe(1);
    expect(pos1.pct).toBe(100);
  });

  it("calcula posición y pct en un caso simple (3 ejercicios, el 3ro a medias)", async () => {
    seedDia({ fecha: diasAtras(1), nombres: ["Ej A", "Ej B", "Ej C"], hechos: 2 });

    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    const porPos: Array<{ posicion: number; pct: number; series_completadas: number }> = res.body.por_posicion;
    expect(porPos.find((p) => p.posicion === 1)!.pct).toBe(100);
    expect(porPos.find((p) => p.posicion === 2)!.pct).toBe(100);
    expect(porPos.find((p) => p.posicion === 3)!.pct).toBe(0);
  });

  it("respeta ?dias (un día de hace 100 días entra con 180, no con 42)", async () => {
    seedDia({ fecha: diasAtras(100), nombres: ["Ej A"], hechos: 1 });

    const res42 = await request(app).get("/api/coach/adherencia?dias=42").set(AUTH);
    expect(res42.body.dias_analizados).toBe(0);

    const res180 = await request(app).get("/api/coach/adherencia?dias=180").set(AUTH);
    expect(res180.body.dias_analizados).toBe(1);
  });

  it("por_largo_de_dia separa la misma posición según el largo del día", async () => {
    seedDia({ fecha: diasAtras(1), nombres: ["A1", "A2", "A3"], hechos: 3 });
    seedDia({ fecha: diasAtras(2), nombres: ["B1", "B2", "B3", "B4", "B5"], hechos: 5 });

    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    const filas = res.body.por_largo_de_dia as Array<{ n_ejercicios_dia: number; posicion: number }>;
    const pos3EnDia3 = filas.find((f) => f.n_ejercicios_dia === 3 && f.posicion === 3);
    const pos3EnDia5 = filas.find((f) => f.n_ejercicios_dia === 5 && f.posicion === 3);
    expect(pos3EnDia3).toBeDefined();
    expect(pos3EnDia5).toBeDefined();
  });

  it("por_ejercicio agrupa el mismo ejercicio en días distintos y calcula posicion_prom", async () => {
    seedDia({ fecha: diasAtras(1), nombres: ["Repetido", "X"], hechos: 2 });
    seedDia({ fecha: diasAtras(2), nombres: ["Y", "Repetido"], hechos: 2 });
    seedDia({ fecha: diasAtras(3), nombres: ["Z", "W", "Repetido"], hechos: 3 });

    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    const fila = (res.body.por_ejercicio as Array<{ nombre: string; posicion_prom: number; dias: number }>).find(
      (e) => e.nombre === "Repetido"
    );
    expect(fila).toBeDefined();
    expect(fila!.dias).toBe(3);
    expect(fila!.posicion_prom).toBeCloseTo((1 + 2 + 3) / 3, 1);
  });

  it("por_ejercicio descarta ejercicios con menos de 3 series programadas", async () => {
    seedDia({ fecha: diasAtras(1), nombres: ["Poco visto"], hechos: 1 });
    seedDia({ fecha: diasAtras(2), nombres: ["Muy visto"], hechos: 1 });
    seedDia({ fecha: diasAtras(3), nombres: ["Muy visto"], hechos: 1 });
    seedDia({ fecha: diasAtras(4), nombres: ["Muy visto"], hechos: 0 });

    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    const nombres = (res.body.por_ejercicio as Array<{ nombre: string }>).map((e) => e.nombre);
    expect(nombres).not.toContain("Poco visto");
    expect(nombres).toContain("Muy visto");
  });

  it("ignora ejercicios sin ninguna serie (no corren la numeración de posiciones)", async () => {
    seedDia({
      fecha: diasAtras(1),
      nombres: ["Con serie 1", "Fantasma", "Con serie 2"],
      hechos: 2,
      conSeries: [true, false, true],
    });

    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    const posiciones = (res.body.por_posicion as Array<{ posicion: number }>).map((p) => p.posicion);
    expect(posiciones).toEqual([1, 2]);
  });

  it("agrupa por nombre_libre cuando exercise_id es null", async () => {
    const semana = 1;
    const weekId = db
      .prepare("INSERT INTO program_weeks (semana, nombre, fecha_creada, activa) VALUES (?, 'Test', '2024-01-01', 1)")
      .run(semana).lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, tipo, fecha, orden) VALUES (?, 1, 'A', ?, 0)")
      .run(weekId, diasAtras(1)).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, nombre_libre, seccion, orden) VALUES (?, NULL, 'Ejercicio libre', 'main', 0)")
      .run(dayId).lastInsertRowid as number;
    // 3 series (no solo 1) para no chocar con el HAVING SUM(programadas) >= 3 de por_ejercicio.
    const insSet = db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, real_peso, real_reps, hecha) VALUES (?, ?, 8, 50, 8, 1)"
    );
    insSet.run(peId, 1);
    insSet.run(peId, 2);
    insSet.run(peId, 3);

    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    const nombres = (res.body.por_ejercicio as Array<{ nombre: string }>).map((e) => e.nombre);
    expect(nombres).toContain("Ejercicio libre");
  });

  it("sin datos devuelve 200 con arrays vacíos y dias_analizados 0", async () => {
    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.dias_analizados).toBe(0);
    expect(res.body.por_posicion).toEqual([]);
    expect(res.body.por_largo_de_dia).toEqual([]);
    expect(res.body.por_ejercicio).toEqual([]);
  });

  it("dias_analizados cuenta días distintos, no filas", async () => {
    seedDia({ fecha: diasAtras(1), nombres: ["A", "B", "C"], hechos: 3 });

    const res = await request(app).get("/api/coach/adherencia?dias=90").set(AUTH);
    expect(res.body.dias_analizados).toBe(1);
  });
});
