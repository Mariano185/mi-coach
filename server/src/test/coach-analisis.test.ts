import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestDb, createTestApp, type TestDb } from "./setup.js";
import { seedEnciclopedia } from "../seed/index.js";
import type { AccesorioAnalisis } from "../types.js";

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

function crearSemana(fechaCreada = "2026-01-01"): number {
  return db
    .prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (?, ?, 1)")
    .run(Math.floor(Math.random() * 100000), fechaCreada).lastInsertRowid as number;
}

// weekId opcional: por defecto crea una semana nueva (aislamiento entre tests), pero
// dos llamadas pueden compartir semana pasando el mismo weekId — necesario para
// probar que la vista suma DENTRO de una semana sin colapsar dos semanas distintas.
function registrarSeries(exerciseId: number, nSeries: number, fecha = hoy, weekId = crearSemana()): void {
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
    const vol = res.body.volumen_por_musculo as Array<{ musculo: string; series_completadas: number }>;

    expect(vol.find((v) => v.musculo === "Dorsal ancho")?.series_completadas).toBe(4);
    expect(vol.find((v) => v.musculo.includes("Bíceps braquial"))?.series_completadas).toBe(2);
  });

  it("los estabilizadores no aparecen: no acumulan volumen computable", async () => {
    const remoId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Remo con barra'").get() as { id: number }).id;
    registrarSeries(remoId, 4);

    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    const vol = res.body.volumen_por_musculo as Array<{ musculo: string }>;
    // El erector espinal estabiliza el remo con barra pero no suma volumen.
    expect(vol.find((v) => v.musculo === "Erector espinal")).toBeUndefined();
  });

  it("suma el volumen de un mismo músculo a través de ejercicios distintos, dentro de la misma semana", async () => {
    // Dos empujes horizontales distintos que comparten el pectoral esternal, en la
    // MISMA semana de programa — si cada uno creara su propia semana, la vista (que
    // agrupa por semana de programa, no por ISO) los dejaría en filas separadas.
    const banca = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
    const mancuernas = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Dumbbell Bench Press'").get() as { id: number }).id;
    const weekId = crearSemana();
    registrarSeries(banca, 3, hoy, weekId);
    registrarSeries(mancuernas, 2, hoy, weekId);

    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    const vol = res.body.volumen_por_musculo as Array<{ musculo: string; series_completadas: number }>;
    const esternal = vol.find((v) => v.musculo.includes("esternocostal"));
    expect(esternal?.series_completadas).toBe(5); // 3 + 2, ambos agonista a 1.0
  });

  it("incluye una semana recién creada y no entrenada dentro de la ventana", async () => {
    const remoId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Remo con barra'").get() as { id: number }).id;
    const weekId = crearSemana(hoy);
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, NULL, 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, remoId).lastInsertRowid as number;
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, hecha) VALUES (?, 1, 0)"
    ).run(peId);

    const res = await request(app).get("/api/coach/analisis?dias=42").set(AUTH);
    const vol = res.body.volumen_por_musculo as Array<{ musculo: string; series_programadas: number; series_completadas: number }>;
    const dorsal = vol.find((v) => v.musculo === "Dorsal ancho");
    expect(dorsal).toMatchObject({ series_programadas: 1, series_completadas: 0 });
  });

  it("una ventana chica deja afuera una semana vieja y nunca entrenada", async () => {
    const remoId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Remo con barra'").get() as { id: number }).id;
    const fechaVieja = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const weekId = crearSemana(fechaVieja);
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, NULL, 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, remoId).lastInsertRowid as number;
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, hecha) VALUES (?, 1, 0)"
    ).run(peId);

    const res = await request(app).get("/api/coach/analisis?dias=14").set(AUTH);
    const vol = res.body.volumen_por_musculo as Array<{ musculo: string }>;
    expect(vol.find((v) => v.musculo === "Dorsal ancho")).toBeUndefined();
  });

  it("cada fila trae semana_programa y mesociclo_id", async () => {
    const remoId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Remo con barra'").get() as { id: number }).id;
    registrarSeries(remoId, 2);

    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    const vol = res.body.volumen_por_musculo as Array<{ musculo: string; semana_programa: number; mesociclo_id: number | null }>;
    const dorsal = vol.find((v) => v.musculo === "Dorsal ancho");
    expect(dorsal).toHaveProperty("semana_programa");
    expect(dorsal).toHaveProperty("mesociclo_id");
    expect(dorsal?.mesociclo_id).toBeNull();
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
    expect(bench?.mejor_e1rm).toBe(81.2); // 60×8 @8 → 10 reps proyectadas → 73,9 %
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

describe("GET /api/coach/analisis — mejor_e1rm_basicos con contexto", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    seedEnciclopedia(db);
    app = await createTestApp(db);
  });

  const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const banca = () =>
    (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;

  // Una serie suelta en su propio día: [peso, reps, rpe] en la fecha y el día de programa dados.
  function serie(peso: number, reps: number, rpe: number, fecha: string, dia = 1, weekId = crearSemana()): number {
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, ?, ?, 0)")
      .run(weekId, dia, fecha).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, banca()).lastInsertRowid as number;
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, 1, ?, ?, ?, 1)"
    ).run(peId, peso, reps, rpe);
    return weekId;
  }

  async function benchDe(query = "") {
    const res = await request(app).get(`/api/coach/analisis${query}`).set(AUTH);
    expect(res.status).toBe(200);
    return (res.body.mejor_e1rm_basicos as Array<Record<string, unknown>>).find(
      (m) => m.nombre === "Flat Bench Press (barra)"
    );
  }

  it("trae la fecha y la serie que dieron el mejor e1RM", async () => {
    const weekId = serie(80, 5, 7, haceDias(7), 3); // 8 proyectadas → 78,6 % → 101,8
    serie(60, 8, 8, haceDias(2)); // 81,2: menor

    expect(await benchDe()).toEqual({
      nombre: "Flat Bench Press (barra)",
      mejor_e1rm: 101.8,
      fecha: haceDias(7),
      week_id: weekId,
      dia: 3,
      peso_kg: 80,
      reps: 5,
      rpe: 7,
      dias_desde: 7,
      mejor_e1rm_ventana: 101.8,
    });
  });

  it("si el mejor histórico quedó fuera de la ventana, mejor_e1rm_ventana es el mejor reciente", async () => {
    serie(80, 5, 7, haceDias(30)); // 101,8, fuera de ?dias=14
    serie(60, 8, 8, haceDias(2)); // 81,2, dentro

    const bench = await benchDe("?dias=14");
    expect(bench).toMatchObject({ mejor_e1rm: 101.8, fecha: haceDias(30), dias_desde: 30, mejor_e1rm_ventana: 81.2 });
  });

  it("sin series de confianza alta en la ventana, mejor_e1rm_ventana es null", async () => {
    serie(80, 5, 7, haceDias(60));

    const bench = await benchDe("?dias=14");
    expect(bench).toMatchObject({ mejor_e1rm: 101.8, dias_desde: 60, mejor_e1rm_ventana: null });
  });

  it("ante un empate de e1RM gana la serie más reciente", async () => {
    serie(80, 5, 7, haceDias(20));
    serie(80, 5, 7, haceDias(4), 2);

    expect(await benchDe()).toMatchObject({ mejor_e1rm: 101.8, fecha: haceDias(4), dia: 2, dias_desde: 4 });
  });

  it("las series de confianza baja no cuentan ni para el histórico ni para la ventana", async () => {
    serie(80, 5, 7, haceDias(30)); // 101,8 alta, fuera de la ventana
    serie(150, 3, 5, haceDias(1)); // 190,8 baja, dentro

    const bench = await benchDe("?dias=14");
    expect(bench).toMatchObject({ mejor_e1rm: 101.8, fecha: haceDias(30), mejor_e1rm_ventana: null });
  });
});

describe("GET /api/coach/analisis — accesorios (opt-in)", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    seedEnciclopedia(db);
    app = await createTestApp(db);
  });

  const idDe = (nombre: string) =>
    (db.prepare("SELECT id FROM exercises WHERE nombre = ?").get(nombre) as { id: number }).id;


  it("sin ?incluir=accesorios la clave no existe", async () => {
    registrarSeries(idDe("Remo con barra"), 2);
    const res = await request(app).get("/api/coach/analisis").set(AUTH);
    expect(res.body).not.toHaveProperty("accesorios");
  });

  it("trae los ejercicios sin e1RM y no los que tienen e1RM", async () => {
    registrarSeries(idDe("Remo con barra"), 2);
    registrarSeries(idDe("Flat Bench Press (barra)"), 2);

    const res = await request(app).get("/api/coach/analisis?incluir=accesorios").set(AUTH);
    const nombres = (res.body.accesorios as AccesorioAnalisis[]).map((a) => a.nombre);
    expect(nombres).toEqual(["Remo con barra"]);
  });

  it("incluye hip thrust y RDL: no son movimientos de competencia", async () => {
    registrarSeries(idDe("Hip Thrust con barra"), 1);
    registrarSeries(idDe("Romanian Deadlift"), 1);

    const res = await request(app).get("/api/coach/analisis?incluir=accesorios").set(AUTH);
    const nombres = (res.body.accesorios as AccesorioAnalisis[]).map((a) => a.nombre).sort();
    expect(nombres).toEqual(["Hip Thrust con barra", "Romanian Deadlift"]);
  });

  it("solo series hechas, en orden de serie, como [reps, peso, rpe], con los datos de la sesión", async () => {
    const remoId = idDe("Remo con barra");
    const weekId = crearSemana();
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 2, ?, 0)")
      .run(weekId, hoy).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, reps_text, orden) VALUES (?, ?, 'accesorio', '12-15', 0)")
      .run(dayId, remoId).lastInsertRowid as number;
    const serie = db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, real_peso, real_reps, real_rpe, hecha) VALUES (?, ?, 15, ?, ?, ?, ?)"
    );
    // Insertadas desordenadas a propósito: el orden tiene que salir de n_serie.
    serie.run(peId, 3, null, null, null, 0); // salteada
    serie.run(peId, 2, 10, 13, 9, 1);
    serie.run(peId, 1, 10, 15, 9, 1);
    serie.run(peId, 4, 10, 12, null, 1); // sin RPE

    const res = await request(app).get("/api/coach/analisis?incluir=accesorios").set(AUTH);
    expect(res.body.accesorios).toEqual([
      {
        exercise_id: remoId,
        nombre: "Remo con barra",
        sesiones: [
          { fecha: hoy, week_id: weekId, dia: 2, rango_objetivo: "12-15", series: [[15, 10, 9], [13, 10, 9], [12, 10, null]] },
        ],
      },
    ]);
  });

  it("respeta la ventana ?dias=N", async () => {
    const remoId = idDe("Remo con barra");
    const hace20 = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    registrarSeries(remoId, 1, hace20);
    registrarSeries(remoId, 1, hoy);

    const corta = await request(app).get("/api/coach/analisis?dias=14&incluir=accesorios").set(AUTH);
    expect((corta.body.accesorios as AccesorioAnalisis[])[0].sesiones.map((s) => s.fecha)).toEqual([hoy]);

    const larga = await request(app).get("/api/coach/analisis?dias=42&incluir=accesorios").set(AUTH);
    expect((larga.body.accesorios as AccesorioAnalisis[])[0].sesiones.map((s) => s.fecha)).toEqual([hace20, hoy]);
  });

  it("convive con ?incluir=ejercicios en la misma lista", async () => {
    const res = await request(app).get("/api/coach/analisis?incluir=ejercicios,accesorios").set(AUTH);
    expect(res.body).toHaveProperty("ejercicios");
    expect(res.body).toHaveProperty("accesorios");
  });
});
