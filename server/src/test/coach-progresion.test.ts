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

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Idempotente: exercises no se limpia entre tests, así que un INSERT literal
// colisiona con UNIQUE(nombre).
function seedEjercicio(nombre: string, opts: { rastreaE1rm?: number } = {}): number {
  db.prepare(
    `INSERT INTO exercises (nombre, categoria, rastrea_e1rm)
     SELECT ?, 'Accesorio', ?
     WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE nombre = ?)`
  ).run(nombre, opts.rastreaE1rm ?? 0, nombre);
  return (db.prepare("SELECT id FROM exercises WHERE nombre = ?").get(nombre) as { id: number }).id;
}

interface SerieInput {
  peso?: number | null;
  reps?: number | null;
  rpe?: number | null;
  hecha?: 0 | 1; // override explícito (simula PATCH {"hecha": true} sin valores)
}

// Crea semana + día + program_exercise + sets para un ejercicio en una fecha dada.
// Devuelve dayId por si el test necesita agregar un segundo program_exercise al mismo día.
function seedSesion(opts: { exerciseId: number; fecha: string | null; series: SerieInput[] }): { dayId: number; weekId: number } {
  const semana = Number(
    (db.prepare("SELECT COALESCE(MAX(semana), 0) + 1 AS s FROM program_weeks").get() as { s: number }).s
  );
  const weekId = db
    .prepare("INSERT INTO program_weeks (semana, nombre, fecha_creada, activa) VALUES (?, 'Test', '2024-01-01', 1)")
    .run(semana).lastInsertRowid as number;
  const dayId = db
    .prepare("INSERT INTO program_days (week_id, dia, tipo, fecha, orden) VALUES (?, 1, 'A', ?, 0)")
    .run(weekId, opts.fecha).lastInsertRowid as number;
  agregarEjercicioAlDia({ dayId, exerciseId: opts.exerciseId, series: opts.series });
  return { dayId, weekId };
}

// Agrega un program_exercise adicional (mismo u otro ejercicio) a un día ya existente —
// para simular el caso de fusión: el mismo ejercicio prescrito dos veces en un día.
function agregarEjercicioAlDia(opts: { dayId: number; exerciseId: number; series: SerieInput[] }): number {
  const orden = (db.prepare("SELECT COUNT(*) n FROM program_exercises WHERE day_id = ?").get(opts.dayId) as { n: number }).n;
  const peId = db
    .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', ?)")
    .run(opts.dayId, opts.exerciseId, orden).lastInsertRowid as number;

  opts.series.forEach((s, i) => {
    const peso = s.peso ?? null;
    const reps = s.reps ?? null;
    const hecha = s.hecha !== undefined ? s.hecha : peso != null && reps != null ? 1 : 0;
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, real_rpe, hecha) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(peId, i + 1, peso, reps, s.rpe ?? null, hecha);
  });
  return peId;
}

describe("GET /api/coach/progresion/:exercise_id", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    db.exec("DELETE FROM program_weeks;");
    app = await createTestApp(db);
  });

  // --- Validación y existencia ---

  it("exercise_id no numérico -> 400", async () => {
    const res = await request(app).get("/api/coach/progresion/abc").set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido/);
  });

  it("exercise_id no entero (1.5) -> 400", async () => {
    const res = await request(app).get("/api/coach/progresion/1.5").set(AUTH);
    expect(res.status).toBe(400);
  });

  it("exercise_id inexistente -> 404", async () => {
    const res = await request(app).get("/api/coach/progresion/999999").set(AUTH);
    expect(res.status).toBe(404);
  });

  it("sin auth -> 401", async () => {
    const id = seedEjercicio("Ejercicio sin auth");
    const res = await request(app).get(`/api/coach/progresion/${id}`);
    expect(res.status).toBe(401);
  });

  it("ejercicio existe pero nunca se entrenó -> 200 con sesiones vacías y nombre presente", async () => {
    const id = seedEjercicio("Nunca entrenado");
    const res = await request(app).get(`/api/coach/progresion/${id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.sesiones).toEqual([]);
    expect(res.body.n_sesiones).toBe(0);
    expect(res.body.ejercicio.nombre).toBe("Nunca entrenado");
  });

  // --- Funciona con cualquier ejercicio (el corazón de la issue) ---

  it("un accesorio (rastrea_e1rm=0) devuelve sus sesiones y NO aparece en progresion_basicos de /analisis", async () => {
    const id = seedEjercicio("Prensa inclinada 45°", { rastreaE1rm: 0 });
    seedSesion({ exerciseId: id, fecha: diasAtras(1), series: [{ peso: 130, reps: 9, rpe: 8 }] });

    const res = await request(app).get(`/api/coach/progresion/${id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.ejercicio.rastrea_e1rm).toBe(0);
    expect(res.body.sesiones).toHaveLength(1);

    // Contraprueba: este mismo ejercicio no debe estar en progresion_basicos de /analisis
    // — si algún día aparece ahí, es que /progresion dejó de ser necesario o que
    // progresion_basicos se rompió y empezó a incluir no-básicos.
    const analisis = await request(app).get("/api/coach/analisis?dias=42").set(AUTH);
    const enBasicos = (analisis.body.progresion_basicos as Array<{ nombre: string }>).some(
      (p) => p.nombre === "Prensa inclinada 45°"
    );
    expect(enBasicos).toBe(false);
  });

  it("un básico (rastrea_e1rm=1) también funciona: el endpoint no está limitado a accesorios", async () => {
    const squat = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Mid/High Bar Back Squat'").get() as { id: number }).id;
    seedSesion({ exerciseId: squat, fecha: diasAtras(1), series: [{ peso: 100, reps: 5, rpe: 8 }] });

    const res = await request(app).get(`/api/coach/progresion/${squat}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.ejercicio.rastrea_e1rm).toBe(1);
    expect(res.body.sesiones).toHaveLength(1);
  });

  // --- Orden y agregados ---

  it("las sesiones salen en orden ASCENDENTE por fecha, sin importar el orden de inserción", async () => {
    const id = seedEjercicio("Remo en polea");
    // Insertado desordenado a propósito: si el test pasara con el orden de inserción,
    // no estaría verificando el ORDER BY.
    seedSesion({ exerciseId: id, fecha: diasAtras(3), series: [{ peso: 50, reps: 10 }] });
    seedSesion({ exerciseId: id, fecha: diasAtras(30), series: [{ peso: 45, reps: 10 }] });
    seedSesion({ exerciseId: id, fecha: diasAtras(10), series: [{ peso: 48, reps: 10 }] });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=60`).set(AUTH);
    const fechas = (res.body.sesiones as Array<{ fecha: string }>).map((s) => s.fecha);
    expect(fechas).toEqual([...fechas].sort());
  });

  it("caso real: mejor_e1rm y mejor_tonelaje son máximos independientes de series distintas", async () => {
    // Prensa inclinada 45°, sesión real verificada contra producción:
    // 130x9 RPE8 (e1rm 169.7, ton 1170), 120x10 RPE8 (e1rm 160, ton 1200), 120x8 RPE7 (e1rm 152, ton 960)
    const id = seedEjercicio("Prensa inclinada real");
    seedSesion({
      exerciseId: id,
      fecha: diasAtras(1),
      series: [
        { peso: 130, reps: 9, rpe: 8 },
        { peso: 120, reps: 10, rpe: 8 },
        { peso: 120, reps: 8, rpe: 7 },
      ],
    });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    const sesion = res.body.sesiones[0];
    expect(sesion.n_series).toBe(3);
    // e1RM Epley: peso*(1+reps/30), redondeado a 1 decimal
    const e1rm1 = Math.round(130 * (1 + 9 / 30) * 10) / 10; // serie 1
    const e1rm2 = Math.round(120 * (1 + 10 / 30) * 10) / 10; // serie 2
    expect(sesion.mejor_e1rm).toBe(Math.max(e1rm1, e1rm2));
    expect(sesion.mejor_e1rm).toBe(e1rm1); // el máximo e1RM sale de la serie 1
    expect(sesion.mejor_tonelaje).toBe(1200); // pero el máximo tonelaje sale de la serie 2
    expect(sesion.tonelaje_total).toBe(1170 + 1200 + 960);
    expect(sesion.rpe_min).toBe(7);
    expect(sesion.rpe_max).toBe(8);
    expect(sesion.series).toHaveLength(3);
  });

  it("sesión sin ningún RPE registrado -> rpe_min/rpe_max null, no 0 ni crash", async () => {
    const id = seedEjercicio("Sin RPE");
    seedSesion({ exerciseId: id, fecha: diasAtras(1), series: [{ peso: 40, reps: 12, rpe: null }] });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones[0].rpe_min).toBeNull();
    expect(res.body.sesiones[0].rpe_max).toBeNull();
  });

  // --- Filtro de series ---

  it("series con hecha=0 quedan excluidas", async () => {
    const id = seedEjercicio("Con serie sin hacer");
    seedSesion({
      exerciseId: id,
      fecha: diasAtras(1),
      series: [{ peso: 40, reps: 10 }, { peso: 40, reps: 10 }, { peso: null, reps: null, hecha: 0 }],
    });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones[0].n_series).toBe(2);
    expect(res.body.sesiones[0].series).toHaveLength(2);
  });

  it("serie hecha=1 pero con real_peso NULL queda excluida (cortocircuito de PATCH hecha explícito)", async () => {
    const id = seedEjercicio("Hecha sin peso");
    seedSesion({
      exerciseId: id,
      fecha: diasAtras(1),
      series: [{ peso: 40, reps: 10 }, { peso: null, reps: null, hecha: 1 }],
    });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones[0].n_series).toBe(1);
  });

  it("serie hecha=1 pero con real_reps NULL queda excluida", async () => {
    const id = seedEjercicio("Hecha sin reps");
    seedSesion({
      exerciseId: id,
      fecha: diasAtras(1),
      series: [{ peso: 40, reps: 10 }, { peso: 40, reps: null, hecha: 1 }],
    });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones[0].n_series).toBe(1);
  });

  it("un día con todas las series inválidas no genera una sesión vacía", async () => {
    const id = seedEjercicio("Todo invalido");
    seedSesion({ exerciseId: id, fecha: diasAtras(1), series: [{ peso: null, reps: null, hecha: 0 }] });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones).toEqual([]);
  });

  it("serie hecha=1 en un día con fecha NULL no produce una sesión con fecha null", async () => {
    const id = seedEjercicio("Hecha sin fecha de dia");
    // Inserción directa simulando una fixture/migración: hecha=1 pero el día quedó sin fecha.
    seedSesion({ exerciseId: id, fecha: null, series: [{ peso: 40, reps: 10, hecha: 1 }] });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones).toEqual([]);
    expect((res.body.sesiones as Array<{ fecha: string | null }>).some((s) => s.fecha === null)).toBe(false);
  });

  // --- Fusión del mismo día ---

  it("el mismo ejercicio dos veces en el MISMO program_day se fusiona en una sola sesión", async () => {
    const id = seedEjercicio("Duplicado en el dia");
    const { dayId } = seedSesion({ exerciseId: id, fecha: diasAtras(1), series: [{ peso: 40, reps: 10 }, { peso: 40, reps: 10 }] });
    agregarEjercicioAlDia({ dayId, exerciseId: id, series: [{ peso: 42, reps: 8 }] });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones).toHaveLength(1);
    expect(res.body.sesiones[0].n_series).toBe(3);
    expect(res.body.sesiones[0].series).toHaveLength(3);
    expect(res.body.sesiones[0].day_ids).toEqual([dayId]);
  });

  it("dos program_days DISTINTOS con la misma fecha se fusionan en una sesión, con day_ids con 2 elementos", async () => {
    const id = seedEjercicio("Dos days misma fecha");
    const fecha = diasAtras(1);
    const { weekId, dayId: dayId1 } = seedSesion({ exerciseId: id, fecha, series: [{ peso: 40, reps: 10 }] });
    const dayId2 = db
      .prepare("INSERT INTO program_days (week_id, dia, tipo, fecha, orden) VALUES (?, 2, 'B', ?, 1)")
      .run(weekId, fecha).lastInsertRowid as number;
    agregarEjercicioAlDia({ dayId: dayId2, exerciseId: id, series: [{ peso: 41, reps: 8 }] });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones).toHaveLength(1);
    expect(res.body.sesiones[0].n_series).toBe(2);
    expect(res.body.sesiones[0].day_ids).toEqual([dayId1, dayId2].sort((a, b) => a - b));
  });

  it("el mismo ejercicio en días DISTINTOS produce sesiones separadas (la fusión no es agresiva)", async () => {
    const id = seedEjercicio("Dias distintos");
    seedSesion({ exerciseId: id, fecha: diasAtras(1), series: [{ peso: 40, reps: 10 }] });
    seedSesion({ exerciseId: id, fecha: diasAtras(8), series: [{ peso: 38, reps: 10 }] });

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones).toHaveLength(2);
  });

  it("en una sesión fusionada, mejor_e1rm es el máximo entre los dos program_exercises", async () => {
    const id = seedEjercicio("Fusionada mejor e1rm");
    const { dayId } = seedSesion({ exerciseId: id, fecha: diasAtras(1), series: [{ peso: 40, reps: 5 }] });
    agregarEjercicioAlDia({ dayId, exerciseId: id, series: [{ peso: 60, reps: 5 }] }); // e1rm mayor

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    const e1rmMenor = Math.round(40 * (1 + 5 / 30) * 10) / 10;
    const e1rmMayor = Math.round(60 * (1 + 5 / 30) * 10) / 10;
    expect(res.body.sesiones[0].mejor_e1rm).toBe(e1rmMayor);
    expect(res.body.sesiones[0].mejor_e1rm).not.toBe(e1rmMenor);
  });

  // --- Ventana ---

  it("respeta ?dias (una sesión de hace 150 días entra con el default 180, no con 90)", async () => {
    const id = seedEjercicio("Vieja 150 dias");
    seedSesion({ exerciseId: id, fecha: diasAtras(150), series: [{ peso: 40, reps: 10 }] });

    const resDefault = await request(app).get(`/api/coach/progresion/${id}`).set(AUTH);
    expect(resDefault.body.sesiones).toHaveLength(1);
    expect(resDefault.body.ventana_dias).toBe(180);

    const res90 = await request(app).get(`/api/coach/progresion/${id}?dias=90`).set(AUTH);
    expect(res90.body.sesiones).toHaveLength(0);
  });

  it("?dias=abc cae al default 180", async () => {
    const id = seedEjercicio("Ventana invalida");
    const res = await request(app).get(`/api/coach/progresion/${id}?dias=abc`).set(AUTH);
    expect(res.body.ventana_dias).toBe(180);
  });

  // --- Aislamiento entre ejercicios ---

  it("dos ejercicios distintos entrenados el mismo día: /progresion/:idA trae solo A", async () => {
    const idA = seedEjercicio("Ejercicio A aislamiento");
    const idB = seedEjercicio("Ejercicio B aislamiento");
    const { dayId } = seedSesion({ exerciseId: idA, fecha: diasAtras(1), series: [{ peso: 40, reps: 10 }] });
    agregarEjercicioAlDia({ dayId, exerciseId: idB, series: [{ peso: 20, reps: 12 }] });

    const res = await request(app).get(`/api/coach/progresion/${idA}?dias=30`).set(AUTH);
    expect(res.body.sesiones).toHaveLength(1);
    expect(res.body.sesiones[0].n_series).toBe(1);
    expect(res.body.sesiones[0].series[0].peso_kg).toBe(40);
  });

  it("un program_exercise con nombre_libre (sin exercise_id) no contamina el resultado de ningún ejercicio", async () => {
    const id = seedEjercicio("Con vecino nombre libre");
    const { dayId } = seedSesion({ exerciseId: id, fecha: diasAtras(1), series: [{ peso: 40, reps: 10 }] });
    const peLibre = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, nombre_libre, seccion, orden) VALUES (?, NULL, 'A elección', 'accesorio', 1)")
      .run(dayId).lastInsertRowid as number;
    db.prepare(
      "INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, hecha) VALUES (?, 1, 99, 99, 1)"
    ).run(peLibre);

    const res = await request(app).get(`/api/coach/progresion/${id}?dias=30`).set(AUTH);
    expect(res.body.sesiones[0].n_series).toBe(1);
    expect(res.body.sesiones[0].series[0].peso_kg).toBe(40);
  });
});
