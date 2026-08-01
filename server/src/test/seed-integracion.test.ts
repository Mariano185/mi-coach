import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "./setup.js";
import { seedEnciclopedia } from "../seed/index.js";

// Integración real del seed contra el schema, no solo validación del catálogo.
// createTestDb() ya trae 3 ejercicios preexistentes (los 3 básicos), así que
// este archivo prueba justo el caso que importa: sembrar sobre una DB que YA
// tiene filas, como la de producción.

function contar(db: TestDb, tabla: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;
}

describe("seedEnciclopedia", () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it("puebla las tres tablas desde una DB con filas preexistentes", () => {
    expect(contar(db, "musculos")).toBe(0);
    seedEnciclopedia(db);

    expect(contar(db, "musculos")).toBeGreaterThan(40);
    expect(contar(db, "patrones")).toBeGreaterThan(15);
    expect(contar(db, "exercises")).toBeGreaterThan(80);
    expect(contar(db, "ejercicio_musculos")).toBeGreaterThan(400);
  });

  it("es idempotente: correrlo 3 veces deja exactamente los mismos totales", () => {
    seedEnciclopedia(db);
    const snapshot = {
      musculos: contar(db, "musculos"),
      patrones: contar(db, "patrones"),
      exercises: contar(db, "exercises"),
      vinculos: contar(db, "ejercicio_musculos"),
    };

    seedEnciclopedia(db);
    seedEnciclopedia(db);

    expect({
      musculos: contar(db, "musculos"),
      patrones: contar(db, "patrones"),
      exercises: contar(db, "exercises"),
      vinculos: contar(db, "ejercicio_musculos"),
    }).toEqual(snapshot);
  });

  it("no duplica los ejercicios preexistentes: los completa conservando su id", () => {
    const antes = db
      .prepare("SELECT id, nombre FROM exercises WHERE nombre = 'Flat Bench Press (barra)'")
      .get() as { id: number; nombre: string };

    seedEnciclopedia(db);

    const despues = db
      .prepare("SELECT id, patron_id, rastrea_e1rm FROM exercises WHERE nombre = 'Flat Bench Press (barra)'")
      .all() as Array<{ id: number; patron_id: number; rastrea_e1rm: number }>;

    expect(despues).toHaveLength(1); // no se duplicó
    expect(despues[0].id).toBe(antes.id); // conservó el id (las FK siguen resolviendo)
    expect(despues[0].patron_id).not.toBeNull(); // y ahora tiene biomecánica
    expect(despues[0].rastrea_e1rm).toBe(1);
  });

  it("preserva el historial de entrenamiento colgado de un ejercicio preexistente", () => {
    const benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
    const weekId = db.prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (1, '2026-01-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db.prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, '2026-07-20', 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db.prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, benchId).lastInsertRowid as number;
    db.prepare("INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, hecha) VALUES (?, 1, 80, 5, 1)")
      .run(peId);

    seedEnciclopedia(db);

    const resuelto = db
      .prepare("SELECT e.nombre FROM program_exercises pe JOIN exercises e ON e.id = pe.exercise_id WHERE pe.id = ?")
      .get(peId) as { nombre: string } | undefined;
    expect(resuelto?.nombre).toBe("Flat Bench Press (barra)");
  });

  it("arma el linaje: las variantes de banca apuntan a su padre", () => {
    seedEnciclopedia(db);

    const variantes = db
      .prepare(
        `SELECT v.nombre, v.tipo_variante, v.transferencia
         FROM exercises v JOIN exercises p ON p.id = v.ejercicio_padre_id
         WHERE p.nombre = 'Flat Bench Press (barra)'`
      )
      .all() as Array<{ nombre: string; tipo_variante: string; transferencia: number }>;

    expect(variantes.length).toBeGreaterThanOrEqual(5);
    const pausa = variantes.find((v) => v.nombre === "Press banca con pausa 3s en el pecho");
    expect(pausa?.tipo_variante).toBe("pausa");
    expect(pausa?.transferencia).toBeCloseTo(0.95);
  });

  it("cada variante de ángulo tiene su propia grilla: 30° y 60° difieren en el agonista", () => {
    seedEnciclopedia(db);

    const agonistaPrincipal = (nombre: string) =>
      (db
        .prepare(
          `SELECT m.nombre FROM ejercicio_musculos em
           JOIN musculos m ON m.id = em.musculo_id
           JOIN exercises e ON e.id = em.exercise_id
           WHERE e.nombre = ? AND em.orden = 1`
        )
        .get(nombre) as { nombre: string }).nombre;

    expect(agonistaPrincipal("Incline Dumbbell Press 30° (pecho superior)")).toContain("clavicular");
    expect(agonistaPrincipal("Incline Dumbbell Press 60°")).toBe("Deltoides anterior");
  });

  it("reconstruye la grilla en vez de acumularla: no crecen los vínculos al re-sembrar", () => {
    seedEnciclopedia(db);
    const benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
    const antes = (db.prepare("SELECT COUNT(*) n FROM ejercicio_musculos WHERE exercise_id = ?").get(benchId) as { n: number }).n;

    seedEnciclopedia(db);
    const despues = (db.prepare("SELECT COUNT(*) n FROM ejercicio_musculos WHERE exercise_id = ?").get(benchId) as { n: number }).n;

    expect(despues).toBe(antes);
  });

  it("v_volumen_por_musculo devuelve series fraccionadas reales tras el seed", () => {
    seedEnciclopedia(db);

    const remoId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Remo con barra'").get() as { id: number }).id;
    const weekId = db.prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (1, '2026-01-01', 1)")
      .run().lastInsertRowid as number;
    const dayId = db.prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, '2026-07-20', 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db.prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, remoId).lastInsertRowid as number;
    for (let i = 1; i <= 4; i++) {
      db.prepare("INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, hecha) VALUES (?, ?, 60, 8, 1)")
        .run(peId, i);
    }

    const filas = db.prepare("SELECT musculo, series FROM v_volumen_por_musculo").all() as Array<{
      musculo: string;
      series: number;
    }>;

    // 4 series de remo: completo para el dorsal, la mitad para el bíceps,
    // y el erector estabiliza sin acumular volumen.
    const dorsal = filas.find((f) => f.musculo === "Dorsal ancho");
    const biceps = filas.find((f) => f.musculo.includes("Bíceps braquial"));
    expect(dorsal?.series).toBe(4);
    expect(biceps?.series).toBe(2);
    expect(filas.find((f) => f.musculo === "Erector espinal")).toBeUndefined();
  });
});
