import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createTestApp, createTestDb } from "./setup.js";

const db = createTestDb();
vi.mock("../db.js", () => ({ get db() { return db; } }));

const AUTH = { "x-coach-key": "test-coach-key" };

describe("GET /api/coach/semana/:week_id", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 15, 12));
    db.exec(`
      DELETE FROM program_weeks;
      DELETE FROM ingesta_diaria;
      DELETE FROM pasos_diarios;
      DELETE FROM registro_corporal;
      DELETE FROM trac;
      INSERT INTO program_weeks
        (id, semana, fecha_creada, objetivo_kcal, objetivo_proteina_g, objetivo_carbohidratos_g,
         objetivo_grasas_g, nota_nutricional, objetivos_pautados_en)
      VALUES (1, 1, '2026-11-03', 2500, 180, 280, 73, 'Anterior', '2026-11-03'),
             (2, 2, '2026-11-09', 2300, 180, 250, 64, 'Nuevo objetivo', '2026-11-13');
      INSERT INTO program_days (id, week_id, dia, fecha, orden, notas, notas_atleta)
      VALUES (1, 1, 1, '2026-11-08', 0, NULL, NULL),
             (2, 2, 1, '2026-11-10', 0, 'Pausa abajo', 'Me sentí bien'),
             (3, 2, 2, '2026-11-12', 1, NULL, NULL),
             (4, 2, 3, NULL, 2, NULL, NULL);
    `);
    app = await createTestApp(db);
  });

  afterEach(() => vi.useRealTimers());

  it("incluye descansos hasta hoy y aplica el objetivo vigente aunque falte la ingesta", async () => {
    db.exec(`
      INSERT INTO ingesta_diaria (fecha, kcal, proteina_g, carbohidratos_g, grasas_g, comentario)
      VALUES ('2026-11-11', 2470, 180, 280, 70, 'Estimado');
      INSERT INTO pasos_diarios (fecha, pasos) VALUES ('2026-11-11', 0);
      INSERT INTO registro_corporal (fecha, peso_kg, abdomen_cm) VALUES ('2026-11-11', 80, 83);
      INSERT INTO trac (fecha, sueno) VALUES ('2026-11-11', 4);
    `);

    const res = await request(app).get("/api/coach/semana/2").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.rango).toEqual({ desde: "2026-11-09", hasta: "2026-11-15" });
    expect(res.body.objetivo_nutricional).toEqual({
      week_id: 2, kcal: 2300, proteina_g: 180, carbohidratos_g: 250,
      grasas_g: 64, nota: "Nuevo objetivo", pautado_en: "2026-11-13",
    });
    const contexto = res.body.contexto;
    expect(contexto.map((dia: { fecha: string }) => dia.fecha)).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12",
      "2026-11-13", "2026-11-14", "2026-11-15",
    ]);
    expect(contexto[2]).toMatchObject({
      ingesta: { kcal: 2470, comentario: "Estimado" },
      objetivo: { week_id: 1, kcal: 2500, nota: "Anterior" },
      pasos: { pasos: 0 },
      registro_corporal: { peso_kg: 80, abdomen_cm: 83, brazo_cm: null },
      trac: { sueno: 4, tecnica: null },
    });
    expect(contexto[4]).toMatchObject({
      objetivo: { week_id: 2, kcal: 2300 },
      ingesta: null, pasos: null, registro_corporal: null, trac: null,
    });
  });

  it("conserva días sin empezar, ejercicios sin series y series hechas y pendientes", async () => {
    db.exec(`
      INSERT INTO program_exercises (id, day_id, nombre_libre, orden)
      VALUES (1, 2, 'Sentadilla', 0), (2, 2, 'Plancha', 1), (3, 1, 'Otra semana', 0);
      INSERT INTO program_sets
        (program_exercise_id, n_serie, target_reps, target_peso, target_rpe,
         real_reps, real_peso, real_rpe, hecha)
      VALUES (1, 2, 5, 95, 8, NULL, NULL, NULL, 0), (1, 1, 5, 100, 8, 4, 100, 8, 1),
             (3, 1, 9, 90, 8, NULL, NULL, NULL, 0);
    `);

    const res = await request(app).get("/api/coach/semana/2").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.dias).toMatchObject([
      {
        dia: 1, notas_coach: "Pausa abajo", notas_atleta: "Me sentí bien",
        exercises: [
          { nombre: "Sentadilla", sets: [
            { n_serie: 1, target_reps: 5, target_peso: 100, target_rpe: 8,
              real_reps: 4, real_peso: 100, real_rpe: 8, hecha: 1 },
            { n_serie: 2, target_reps: 5, target_peso: 95, target_rpe: 8,
              real_reps: null, real_peso: null, real_rpe: null, hecha: 0 },
          ] },
          { nombre: "Plancha", sets: [] },
        ],
      },
      { dia: 2, exercises: [] },
      { dia: 3, fecha: null, exercises: [] },
    ]);
  });

  it("acota el contexto de la primera Semana de programa al primer dato y a su última sesión", async () => {
    db.exec("INSERT INTO pasos_diarios (fecha, pasos) VALUES ('2026-11-02', 1000)");
    const res = await request(app).get("/api/coach/semana/1").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.rango).toEqual({ desde: null, hasta: "2026-11-08" });
    expect(res.body.contexto[0]).toMatchObject({ fecha: "2026-11-02", objetivo: null });
    expect(res.body.contexto.at(-1)).toMatchObject({ fecha: "2026-11-08" });
  });

  it("devuelve JSON 404 si la Semana de programa no existe", async () => {
    const res = await request(app).get("/api/coach/semana/999").set(AUTH);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});
