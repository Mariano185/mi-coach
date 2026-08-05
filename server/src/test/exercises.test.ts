import { describe, it, expect, beforeAll, vi } from "vitest";
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

describe("GET /api/exercises", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    app = await createTestApp(db);
  });

  it("forma compacta por default: solo id/nombre/categoria/rastrea_e1rm", async () => {
    const res = await request(app).get("/api/exercises").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(Object.keys(res.body[0]).sort()).toEqual(["categoria", "id", "nombre", "rastrea_e1rm"]);
  });

  it("?detalle=full trae las columnas de la enciclopedia, en NULL antes del seed", async () => {
    const res = await request(app).get("/api/exercises?detalle=full").set(AUTH);
    expect(res.status).toBe(200);
    const squat = res.body.find((e: { nombre: string }) => e.nombre === "Mid/High Bar Back Squat");
    expect(squat).toBeDefined();
    expect(squat.patron_id).toBeNull();
    expect(squat.sesgo_longitud).toBeNull();
    // rastrea_e1rm SÍ está seteado por el fixture mínimo de setup.ts (es lo que lo
    // marca como básico para los tests de e1RM) — no es una columna "en NULL antes
    // del seed" como el resto de la enciclopedia.
    expect(squat.rastrea_e1rm).toBe(1);
    expect(squat.variantes).toEqual([]);
    expect(squat.musculos).toEqual([]);
  });
});

describe("GET /api/exercises/:id", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let benchId: number;

  beforeAll(async () => {
    app = await createTestApp(db);
    benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
  });

  it("404 si el id no existe", async () => {
    const res = await request(app).get("/api/exercises/999999").set(AUTH);
    expect(res.status).toBe(404);
  });

  it("400 si el id no es numérico", async () => {
    const res = await request(app).get("/api/exercises/abc").set(AUTH);
    expect(res.status).toBe(400);
  });

  it("devuelve el detalle con variantes y músculos (poblados vía tablas nuevas)", async () => {
    const musculoId = db
      .prepare("INSERT INTO musculos (nombre, grupo, biarticular) VALUES (?, ?, 0)")
      .run("Pectoral mayor", "pecho").lastInsertRowid as number;
    const patronId = db
      .prepare("INSERT INTO patrones (nombre, plano) VALUES (?, ?)")
      .run("empuje horizontal", "sagital").lastInsertRowid as number;
    const varianteId = db
      .prepare(
        "INSERT INTO exercises (nombre, categoria, ejercicio_padre_id, tipo_variante) VALUES (?, ?, ?, ?)"
      )
      .run("Press banca pausa 3s", "Básico", benchId, "pausa").lastInsertRowid as number;

    db.prepare("UPDATE exercises SET patron_id = ?, rastrea_e1rm = 1 WHERE id = ?").run(patronId, benchId);
    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'agonista', 1, 1.0)"
    ).run(benchId, musculoId);

    const res = await request(app).get(`/api/exercises/${benchId}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.patron_nombre).toBe("empuje horizontal");
    expect(res.body.rastrea_e1rm).toBe(1);
    expect(res.body.musculos).toEqual([
      { musculo_id: musculoId, nombre: "Pectoral mayor", grupo: "pecho", rol: "agonista", orden: 1, fraccion_volumen: 1 },
    ]);
    expect(res.body.variantes).toEqual([
      { id: varianteId, nombre: "Press banca pausa 3s", tipo_variante: "pausa" },
    ]);
  });
});

describe("integridad del schema de la enciclopedia", () => {
  it("ejercicio_padre_id es self-referencial: apunta a otra fila de exercises", () => {
    const padre = db
      .prepare("INSERT INTO exercises (nombre, categoria) VALUES (?, ?)")
      .run("Sentadilla libre", "Básico").lastInsertRowid as number;
    const hijo = db
      .prepare("INSERT INTO exercises (nombre, categoria, ejercicio_padre_id, transferencia) VALUES (?, ?, ?, ?)")
      .run("Sentadilla con pausa", "Básico", padre, 0.9).lastInsertRowid as number;

    const row = db.prepare("SELECT ejercicio_padre_id, transferencia FROM exercises WHERE id = ?").get(hijo) as {
      ejercicio_padre_id: number;
      transferencia: number;
    };
    expect(row.ejercicio_padre_id).toBe(padre);
    expect(row.transferencia).toBe(0.9);
  });

  it("ejercicio_musculos rechaza un músculo duplicado en el mismo ejercicio (UNIQUE)", () => {
    const exId = db.prepare("INSERT INTO exercises (nombre, categoria) VALUES (?, ?)").run("Remo test", "Espalda")
      .lastInsertRowid as number;
    const musId = db.prepare("INSERT INTO musculos (nombre, grupo) VALUES (?, ?)").run("Dorsal ancho test", "espalda")
      .lastInsertRowid as number;

    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'agonista', 1, 1.0)"
    ).run(exId, musId);

    expect(() =>
      db
        .prepare(
          "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'sinergista', 2, 0.5)"
        )
        .run(exId, musId)
    ).toThrow();
  });

  it("v_volumen_por_musculo suma fraccion_volumen por músculo y semana de programa", () => {
    db.exec("DELETE FROM program_weeks; DELETE FROM ejercicio_musculos; DELETE FROM musculos;");
    const benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;

    const dorsalId = db.prepare("INSERT INTO musculos (nombre, grupo) VALUES (?, ?)").run("Dorsal ancho", "espalda")
      .lastInsertRowid as number;
    const bicepsId = db.prepare("INSERT INTO musculos (nombre, grupo) VALUES (?, ?)").run("Bíceps braquial", "brazo")
      .lastInsertRowid as number;
    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'agonista', 1, 1.0)"
    ).run(benchId, dorsalId);
    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'sinergista', 2, 0.5)"
    ).run(benchId, bicepsId);

    const weekId = db.prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (1, '2026-01-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, '2026-07-20', 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, benchId).lastInsertRowid as number;
    // 4 series hechas -> dorsal aporta 4*1.0=4.0, bíceps 4*0.5=2.0. Todas hechas,
    // así que programado == completado (blinda contra un CASE invertido).
    for (let i = 1; i <= 4; i++) {
      db.prepare(
        "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, hecha) VALUES (?, ?, 80, 5, 1)"
      ).run(peId, i);
    }

    const rows = db
      .prepare("SELECT musculo, series_programadas, series_completadas FROM v_volumen_por_musculo ORDER BY musculo")
      .all() as Array<{ musculo: string; series_programadas: number; series_completadas: number }>;
    expect(rows).toEqual([
      { musculo: "Bíceps braquial", series_programadas: 2, series_completadas: 2 },
      { musculo: "Dorsal ancho", series_programadas: 4, series_completadas: 4 },
    ]);
  });

  it("v_volumen_por_musculo distingue series programadas de completadas", () => {
    db.exec("DELETE FROM program_weeks; DELETE FROM ejercicio_musculos; DELETE FROM musculos;");
    const benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;

    const dorsalId = db.prepare("INSERT INTO musculos (nombre, grupo) VALUES (?, ?)").run("Dorsal ancho", "espalda")
      .lastInsertRowid as number;
    const bicepsId = db.prepare("INSERT INTO musculos (nombre, grupo) VALUES (?, ?)").run("Bíceps braquial", "brazo")
      .lastInsertRowid as number;
    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'agonista', 1, 1.0)"
    ).run(benchId, dorsalId);
    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'sinergista', 2, 0.5)"
    ).run(benchId, bicepsId);

    const weekId = db.prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (1, '2026-01-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, '2026-07-20', 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, benchId).lastInsertRowid as number;
    // 4 series programadas, solo 2 hechas -> dorsal: prog 4.0/comp 2.0, bíceps: prog 2.0/comp 1.0
    for (let i = 1; i <= 4; i++) {
      db.prepare(
        "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, hecha) VALUES (?, ?, ?, ?, ?)"
      ).run(peId, i, i <= 2 ? 80 : null, i <= 2 ? 5 : null, i <= 2 ? 1 : 0);
    }

    const rows = db
      .prepare("SELECT musculo, series_programadas, series_completadas FROM v_volumen_por_musculo ORDER BY musculo")
      .all() as Array<{ musculo: string; series_programadas: number; series_completadas: number }>;
    expect(rows).toEqual([
      { musculo: "Bíceps braquial", series_programadas: 2, series_completadas: 1 },
      { musculo: "Dorsal ancho", series_programadas: 4, series_completadas: 2 },
    ]);
  });

  it("una semana programada y nunca entrenada aparece con series_completadas en 0 y semana ISO null", () => {
    db.exec("DELETE FROM program_weeks; DELETE FROM ejercicio_musculos; DELETE FROM musculos;");
    const benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
    const dorsalId = db.prepare("INSERT INTO musculos (nombre, grupo) VALUES (?, ?)").run("Dorsal ancho", "espalda")
      .lastInsertRowid as number;
    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'agonista', 1, 1.0)"
    ).run(benchId, dorsalId);

    const weekId = db.prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (5, '2026-08-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, NULL, 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, benchId).lastInsertRowid as number;
    for (let i = 1; i <= 3; i++) {
      db.prepare(
        "INSERT INTO program_sets (program_exercise_id, n_serie, hecha) VALUES (?, ?, 0)"
      ).run(peId, i);
    }

    const row = db
      .prepare("SELECT semana, semana_programa, series_programadas, series_completadas FROM v_volumen_por_musculo WHERE musculo = 'Dorsal ancho'")
      .get() as { semana: string | null; semana_programa: number; series_programadas: number; series_completadas: number };
    expect(row).toEqual({ semana: null, semana_programa: 5, series_programadas: 3, series_completadas: 0 });
  });

  it("no colapsa dos semanas con el mismo número en mesociclos distintos", () => {
    db.exec("DELETE FROM program_weeks; DELETE FROM ejercicio_musculos; DELETE FROM musculos; DELETE FROM mesociclos;");
    const benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
    const dorsalId = db.prepare("INSERT INTO musculos (nombre, grupo) VALUES (?, ?)").run("Dorsal ancho", "espalda")
      .lastInsertRowid as number;
    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'agonista', 1, 1.0)"
    ).run(benchId, dorsalId);
    const mesoId = db
      .prepare("INSERT INTO mesociclos (nombre, fecha_creada) VALUES ('Bloque fuerza', '2026-07-01')")
      .run().lastInsertRowid as number;

    function crearSemanaConSet(mesocicloId: number | null, fecha: string): void {
      const weekId = db
        .prepare("INSERT INTO program_weeks (semana, mesociclo_id, fecha_creada, activa) VALUES (1, ?, ?, 1)")
        .run(mesocicloId, fecha).lastInsertRowid as number;
      const dayId = db
        .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, ?, 0)")
        .run(weekId, fecha).lastInsertRowid as number;
      const peId = db
        .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
        .run(dayId, benchId).lastInsertRowid as number;
      db.prepare(
        "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, hecha) VALUES (?, 1, 80, 5, 1)"
      ).run(peId);
    }
    crearSemanaConSet(null, "2026-07-20");
    crearSemanaConSet(mesoId, "2026-07-20");

    const rows = db
      .prepare("SELECT mesociclo_id, semana_programa, series_completadas FROM v_volumen_por_musculo WHERE musculo = 'Dorsal ancho' ORDER BY week_id")
      .all() as Array<{ mesociclo_id: number | null; semana_programa: number; series_completadas: number }>;
    expect(rows).toEqual([
      { mesociclo_id: null, semana_programa: 1, series_completadas: 1 },
      { mesociclo_id: mesoId, semana_programa: 1, series_completadas: 1 },
    ]);
  });

  it("la semana ISO es la misma para todas las filas de una semana con días fechados y sin fechar", () => {
    db.exec("DELETE FROM program_weeks; DELETE FROM ejercicio_musculos; DELETE FROM musculos;");
    const benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
    const squatId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;
    const dorsalId = db.prepare("INSERT INTO musculos (nombre, grupo) VALUES (?, ?)").run("Dorsal ancho", "espalda")
      .lastInsertRowid as number;
    const cuadricepsId = db.prepare("INSERT INTO musculos (nombre, grupo) VALUES (?, ?)").run("Cuádriceps", "pierna")
      .lastInsertRowid as number;
    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'agonista', 1, 1.0)"
    ).run(benchId, dorsalId);
    db.prepare(
      "INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen) VALUES (?, ?, 'agonista', 1, 1.0)"
    ).run(squatId, cuadricepsId);

    const weekId = db.prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (1, '2026-07-15', 1)")
      .run().lastInsertRowid as number;
    // Día 1: fechado (bench -> dorsal). Día 2: sin fecha todavía (squat -> cuádriceps).
    const day1 = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, '2026-07-20', 0)")
      .run(weekId).lastInsertRowid as number;
    const day2 = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 2, NULL, 1)")
      .run(weekId).lastInsertRowid as number;
    const pe1 = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(day1, benchId).lastInsertRowid as number;
    const pe2 = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(day2, squatId).lastInsertRowid as number;
    db.prepare("INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, hecha) VALUES (?, 1, 80, 5, 1)").run(pe1);
    db.prepare("INSERT INTO program_sets (program_exercise_id, n_serie, hecha) VALUES (?, 1, 0)").run(pe2);

    const rows = db
      .prepare("SELECT musculo, semana FROM v_volumen_por_musculo ORDER BY musculo")
      .all() as Array<{ musculo: string; semana: string | null }>;
    expect(rows).toEqual([
      { musculo: "Cuádriceps", semana: "2026-29" },
      { musculo: "Dorsal ancho", semana: "2026-29" },
    ]);
  });
});
