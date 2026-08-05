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

let app: Awaited<ReturnType<typeof createTestApp>>;
let musculoPecho: number;
let musculoTriceps: number;
let musculoHombro: number;
let patronId: number;
let benchId: number;

beforeEach(async () => {
  // Limpieza dura de lo no-curado: los tests de escritura ensucian de verdad.
  // ejercicio_padre_id no tiene ON DELETE CASCADE, así que hay que apagar el
  // pragma para poder borrar padres e hijos sin importar el orden.
  db.pragma("foreign_keys = OFF");
  db.exec("DELETE FROM ejercicio_musculos; DELETE FROM exercises;");
  db.pragma("foreign_keys = ON");
  seedEnciclopedia(db);
  app = await createTestApp(db);

  musculoPecho = (db.prepare("SELECT id FROM musculos WHERE nombre LIKE 'Pectoral mayor (fascículo esternocostal)'").get() as { id: number }).id;
  musculoTriceps = (db.prepare("SELECT id FROM musculos WHERE nombre LIKE 'Tríceps braquial (cabeza lateral)'").get() as { id: number }).id;
  musculoHombro = (db.prepare("SELECT id FROM musculos WHERE nombre = 'Deltoides anterior'").get() as { id: number }).id;
  patronId = (db.prepare("SELECT id FROM patrones WHERE nombre = 'Empuje horizontal'").get() as { id: number }).id;
  benchId = (db.prepare("SELECT id FROM exercises WHERE nombre = 'Flat Bench Press (barra)'").get() as { id: number }).id;
});

function ejercicioBase(overrides: Record<string, unknown> = {}) {
  return {
    nombre: "Ejercicio de test",
    categoria: "Test",
    patron_id: patronId,
    implemento: "mancuerna",
    mecanica: "compuesto",
    fuerza: "empuje",
    sesgo_longitud: "medio",
    costo_fatiga: 3,
    demanda_estabilidad: 3,
    demanda_tecnica: 3,
    musculos: [
      { musculo_id: musculoPecho, rol: "agonista", fraccion_volumen: 1.0 },
      { musculo_id: musculoTriceps, rol: "sinergista", fraccion_volumen: 0.5 },
    ],
    ...overrides,
  };
}

describe("POST /api/exercises — camino feliz", () => {
  it("crea un ejercicio completo y devuelve 201 con el detalle completo", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe("Ejercicio de test");
    expect(res.body.musculos).toHaveLength(2);
    expect(res.body.patron_nombre).toBe("Empuje horizontal");
    expect(res.body.variantes).toEqual([]);
  });

  it("el orden de la grilla sale del índice del array (1-based), no del cliente", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    expect(res.body.musculos[0].musculo_id).toBe(musculoPecho);
    expect(res.body.musculos[0].orden).toBe(1);
    expect(res.body.musculos[1].musculo_id).toBe(musculoTriceps);
    expect(res.body.musculos[1].orden).toBe(2);
  });

  it("aplica los defaults cuando no vienen en el body", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    expect(res.body.cadena).toBe("abierta");
    expect(res.body.perfil_resistencia).toBe("campana");
    expect(res.body.unilateral).toBe(0);
    expect(res.body.carga_axial).toBe(0);
  });

  it("rastrea_e1rm y es_competitivo quedan en 0 aunque no se manden", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    expect(res.body.rastrea_e1rm).toBe(0);
    expect(res.body.es_competitivo).toBe(0);
  });

  it("el ejercicio creado aparece en GET /api/exercises/:id", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).get(`/api/exercises/${created.body.id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe("Ejercicio de test");
  });

  it("crear una variante la hace aparecer en variantes[] del padre", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(
        ejercicioBase({
          nombre: "Variante de test del bench",
          ejercicio_padre_id: benchId,
          tipo_variante: "agarre",
          transferencia: 0.85,
          proposito: "Probar el endpoint",
        })
      );
    expect(res.status).toBe(201);

    const padre = await request(app).get(`/api/exercises/${benchId}`).set(AUTH);
    expect(padre.body.variantes.map((v: { nombre: string }) => v.nombre)).toContain("Variante de test del bench");
  });
});

describe("POST /api/exercises — vocabularios y escalas", () => {
  it.each([
    ["implemento", "mancuernita"],
    ["mecanica", "compuestisimo"],
    ["fuerza", "lateral"],
    ["sesgo_longitud", "kilometrico"],
    ["cadena", "circular"],
    ["perfil_resistencia", "triangular"],
  ])("%s inválido -> 400", async (campo, valor) => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ [campo]: valor }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(new RegExp(campo));
  });

  it("falta implemento -> 400", async () => {
    const body = ejercicioBase();
    delete (body as Record<string, unknown>).implemento;
    const res = await request(app).post("/api/exercises").set(AUTH).send(body);
    expect(res.status).toBe(400);
  });

  it.each([
    ["costo_fatiga", 7],
    ["costo_fatiga", 2.5],
    ["demanda_estabilidad", 0],
    ["demanda_tecnica", 6],
  ])("%s=%s fuera de 1-5 -> 400", async (campo, valor) => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ [campo]: valor }));
    expect(res.status).toBe(400);
  });

  it("costo_fatiga como string -> 400", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ costo_fatiga: "3" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/exercises — reglas de la grilla muscular", () => {
  it("musculos vacío -> 400", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ musculos: [] }));
    expect(res.status).toBe(400);
  });

  it("musculos ausente -> 400", async () => {
    const body = ejercicioBase();
    delete (body as Record<string, unknown>).musculos;
    const res = await request(app).post("/api/exercises").set(AUTH).send(body);
    expect(res.status).toBe(400);
  });

  it("musculos no-array -> 400", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ musculos: "no-array" }));
    expect(res.status).toBe(400);
  });

  it("musculo_id inexistente -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ musculos: [{ musculo_id: 999999, rol: "agonista", fraccion_volumen: 1.0 }] }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/musculo_id inexistente/);
  });

  it("músculo repetido -> 400 (no llega al UNIQUE de la tabla)", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(
        ejercicioBase({
          musculos: [
            { musculo_id: musculoPecho, rol: "agonista", fraccion_volumen: 1.0 },
            { musculo_id: musculoPecho, rol: "sinergista", fraccion_volumen: 0.5 },
          ],
        })
      );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/repetido/);
  });

  it("fraccion_volumen fuera de rango -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ musculos: [{ musculo_id: musculoPecho, rol: "agonista", fraccion_volumen: 1.5 }] }));
    expect(res.status).toBe(400);
  });

  it("estabilizador con fraccion != 0 -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(
        ejercicioBase({
          musculos: [
            { musculo_id: musculoPecho, rol: "agonista", fraccion_volumen: 1.0 },
            { musculo_id: musculoTriceps, rol: "estabilizador", fraccion_volumen: 0.5 },
          ],
        })
      );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/estabilizador/);
  });

  it("sin agonista -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ musculos: [{ musculo_id: musculoPecho, rol: "sinergista", fraccion_volumen: 0.5 }] }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/agonista/);
  });

  it("rol inválido -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ musculos: [{ musculo_id: musculoPecho, rol: "motor", fraccion_volumen: 1.0 }] }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/exercises — linaje", () => {
  it("padre sin tipo_variante -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ ejercicio_padre_id: benchId, transferencia: 0.9, proposito: "x" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tipo_variante/);
  });

  it("tipo_variante sin padre -> 400", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ tipo_variante: "tempo" }));
    expect(res.status).toBe(400);
  });

  it("padre sin transferencia -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ ejercicio_padre_id: benchId, tipo_variante: "tempo", proposito: "x" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/transferencia/);
  });

  it("padre sin proposito -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ ejercicio_padre_id: benchId, tipo_variante: "tempo", transferencia: 0.9 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/proposito/);
  });

  it("transferencia=0 -> 400 (límite excluido)", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ ejercicio_padre_id: benchId, tipo_variante: "tempo", transferencia: 0, proposito: "x" }));
    expect(res.status).toBe(400);
  });

  it("transferencia=1 -> 201 (límite incluido, asimétrico vs fraccion)", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ ejercicio_padre_id: benchId, tipo_variante: "tempo", transferencia: 1, proposito: "x" }));
    expect(res.status).toBe(201);
  });

  it("transferencia=1.5 -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ ejercicio_padre_id: benchId, tipo_variante: "tempo", transferencia: 1.5, proposito: "x" }));
    expect(res.status).toBe(400);
  });

  it("ejercicio_padre_id inexistente -> 400", async () => {
    const res = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ ejercicio_padre_id: 999999, tipo_variante: "tempo", transferencia: 0.9, proposito: "x" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inexistente/);
  });
});

describe("POST /api/exercises — campos server-controlled", () => {
  it("rastrea_e1rm en el body -> 400", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ rastrea_e1rm: true }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rastrea_e1rm/);
  });

  it("es_competitivo en el body -> 400", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ es_competitivo: true }));
    expect(res.status).toBe(400);
  });

  it("el ejercicio creado no aparece en GET /api/stats basicos", async () => {
    await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).get("/api/stats").set(AUTH);
    expect(res.body.basicos.map((b: { nombre: string }) => b.nombre)).not.toContain("Ejercicio de test");
  });
});

describe("POST /api/exercises — clobber del catálogo curado", () => {
  it("nombre curado -> 409", async () => {
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ nombre: "Flat Bench Press (barra)" }));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/catálogo curado/);
  });

  it("nombre no-curado ya existente (creado por POST previo) -> 409 distinto", async () => {
    await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ya existe/);
    expect(res.body.error).not.toMatch(/catálogo curado/);
  });
});

describe("PATCH /api/exercises/:id — merge parcial", () => {
  it("cambia solo el campo enviado", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).patch(`/api/exercises/${created.body.id}`).set(AUTH).send({ costo_fatiga: 5 });
    expect(res.status).toBe(200);
    expect(res.body.costo_fatiga).toBe(5);
    expect(res.body.nombre).toBe("Ejercicio de test");
    expect(res.body.musculos).toHaveLength(2);
    expect(res.body.patron_id).toBe(patronId);
  });

  it("null explícito limpia el campo", async () => {
    const created = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ contraindicaciones: "Cuidado con la rodilla" }));
    const res = await request(app)
      .patch(`/api/exercises/${created.body.id}`)
      .set(AUTH)
      .send({ contraindicaciones: null });
    expect(res.status).toBe(200);
    expect(res.body.contraindicaciones).toBeNull();
  });

  it("body vacío es no-op y devuelve 200 sin cambios", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).patch(`/api/exercises/${created.body.id}`).set(AUTH).send({});
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe("Ejercicio de test");
  });

  it("id inexistente -> 404", async () => {
    const res = await request(app).patch("/api/exercises/999999").set(AUTH).send({ costo_fatiga: 5 });
    expect(res.status).toBe(404);
  });

  it("id no numérico -> 400", async () => {
    const res = await request(app).patch("/api/exercises/abc").set(AUTH).send({ costo_fatiga: 5 });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/exercises/:id — grilla muscular", () => {
  it("musculos ausente no toca la grilla", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).patch(`/api/exercises/${created.body.id}`).set(AUTH).send({ costo_fatiga: 4 });
    expect(res.body.musculos).toHaveLength(2);
  });

  it("musculos con un solo elemento reemplaza la grilla entera", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app)
      .patch(`/api/exercises/${created.body.id}`)
      .set(AUTH)
      .send({ musculos: [{ musculo_id: musculoPecho, rol: "agonista", fraccion_volumen: 1.0 }] });
    expect(res.status).toBe(200);
    expect(res.body.musculos).toHaveLength(1);
    expect(res.body.musculos[0].orden).toBe(1);
  });

  it("reordenar el mismo set actualiza orden (posicional)", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app)
      .patch(`/api/exercises/${created.body.id}`)
      .set(AUTH)
      .send({
        musculos: [
          { musculo_id: musculoTriceps, rol: "agonista", fraccion_volumen: 1.0 },
          { musculo_id: musculoPecho, rol: "sinergista", fraccion_volumen: 0.5 },
        ],
      });
    expect(res.body.musculos[0].musculo_id).toBe(musculoTriceps);
    expect(res.body.musculos[0].orden).toBe(1);
    expect(res.body.musculos[1].musculo_id).toBe(musculoPecho);
    expect(res.body.musculos[1].orden).toBe(2);
  });

  it("musculos: [] -> 400", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).patch(`/api/exercises/${created.body.id}`).set(AUTH).send({ musculos: [] });
    expect(res.status).toBe(400);
  });

  it("la grilla reemplazada se refleja en v_volumen_por_musculo", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    await request(app)
      .patch(`/api/exercises/${created.body.id}`)
      .set(AUTH)
      .send({ musculos: [{ musculo_id: musculoHombro, rol: "agonista", fraccion_volumen: 1.0 }] });

    const weekId = db.prepare("INSERT INTO program_weeks (semana, fecha_creada, activa) VALUES (1, '2026-01-01', 1)").run()
      .lastInsertRowid as number;
    const dayId = db
      .prepare("INSERT INTO program_days (week_id, dia, fecha, orden) VALUES (?, 1, '2026-07-20', 0)")
      .run(weekId).lastInsertRowid as number;
    const peId = db
      .prepare("INSERT INTO program_exercises (day_id, exercise_id, seccion, orden) VALUES (?, ?, 'main', 0)")
      .run(dayId, created.body.id).lastInsertRowid as number;
    db.prepare("INSERT INTO program_sets (program_exercise_id, n_serie, real_peso, real_reps, hecha) VALUES (?, 1, 20, 10, 1)").run(peId);

    const volumen = db
      .prepare("SELECT musculo, series_completadas FROM v_volumen_por_musculo WHERE musculo = 'Deltoides anterior'")
      .get() as { musculo: string; series_completadas: number } | undefined;
    expect(volumen?.series_completadas).toBe(1);

    const pectoral = db
      .prepare("SELECT 1 FROM v_volumen_por_musculo WHERE musculo LIKE 'Pectoral%esternocostal%'")
      .get();
    expect(pectoral).toBeUndefined(); // se sacó de la grilla, no debe sumar volumen
  });
});

describe("PATCH /api/exercises/:id — validación post-merge", () => {
  it("{tipo_variante: null} sobre una variante -> 400 aunque el body solo sea inocuo", async () => {
    const variante = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ ejercicio_padre_id: benchId, tipo_variante: "tempo", transferencia: 0.9, proposito: "x" }));
    const res = await request(app).patch(`/api/exercises/${variante.body.id}`).set(AUTH).send({ tipo_variante: null });
    expect(res.status).toBe(400);
  });

  it("{ejercicio_padre_id: null} sin limpiar tipo_variante -> 400", async () => {
    const variante = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ ejercicio_padre_id: benchId, tipo_variante: "tempo", transferencia: 0.9, proposito: "x" }));
    const res = await request(app)
      .patch(`/api/exercises/${variante.body.id}`)
      .set(AUTH)
      .send({ ejercicio_padre_id: null });
    expect(res.status).toBe(400);
  });

  it("dejar la grilla con un solo sinergista (sin agonista) -> 400", async () => {
    const created = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(ejercicioBase({ musculos: [{ musculo_id: musculoPecho, rol: "agonista", fraccion_volumen: 1.0 }] }));
    const res = await request(app)
      .patch(`/api/exercises/${created.body.id}`)
      .set(AUTH)
      .send({ musculos: [{ musculo_id: musculoPecho, rol: "sinergista", fraccion_volumen: 0.5 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/agonista/);
  });
});

describe("PATCH /api/exercises/:id — ciclos contra la DB", () => {
  it("ciclo directo: A padre de B, mover A para que sea hijo de B -> 400", async () => {
    const a = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ nombre: "A ciclo" }));
    const b = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(
        ejercicioBase({
          nombre: "B ciclo",
          ejercicio_padre_id: a.body.id,
          tipo_variante: "tempo",
          transferencia: 0.9,
          proposito: "x",
        })
      );
    const res = await request(app)
      .patch(`/api/exercises/${a.body.id}`)
      .set(AUTH)
      .send({ ejercicio_padre_id: b.body.id, tipo_variante: "tempo", transferencia: 0.9, proposito: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ciclo/);
  });

  it("ciclo indirecto A<-B<-C: mover A para que cuelgue de C -> 400", async () => {
    const a = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ nombre: "A2 ciclo" }));
    const b = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(
        ejercicioBase({
          nombre: "B2 ciclo",
          ejercicio_padre_id: a.body.id,
          tipo_variante: "tempo",
          transferencia: 0.9,
          proposito: "x",
        })
      );
    const c = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(
        ejercicioBase({
          nombre: "C2 ciclo",
          ejercicio_padre_id: b.body.id,
          tipo_variante: "tempo",
          transferencia: 0.9,
          proposito: "x",
        })
      );
    const res = await request(app)
      .patch(`/api/exercises/${a.body.id}`)
      .set(AUTH)
      .send({ ejercicio_padre_id: c.body.id, tipo_variante: "tempo", transferencia: 0.9, proposito: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ciclo/);
  });

  it("auto-padre -> 400", async () => {
    const a = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ nombre: "Self ciclo" }));
    const res = await request(app)
      .patch(`/api/exercises/${a.body.id}`)
      .set(AUTH)
      .send({ ejercicio_padre_id: a.body.id, tipo_variante: "tempo", transferencia: 0.9, proposito: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/propio padre/);
  });

  it("reparenting válido: mover un hijo a otro padre distinto sin ciclo -> 200", async () => {
    const a = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ nombre: "A3 reparent" }));
    const d = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ nombre: "D3 reparent" }));
    const b = await request(app)
      .post("/api/exercises")
      .set(AUTH)
      .send(
        ejercicioBase({
          nombre: "B3 reparent",
          ejercicio_padre_id: a.body.id,
          tipo_variante: "tempo",
          transferencia: 0.9,
          proposito: "x",
        })
      );
    const res = await request(app)
      .patch(`/api/exercises/${b.body.id}`)
      .set(AUTH)
      .send({ ejercicio_padre_id: d.body.id, tipo_variante: "tempo", transferencia: 0.9, proposito: "x" });
    expect(res.status).toBe(200);
    expect(res.body.ejercicio_padre_id).toBe(d.body.id);
  });
});

describe("PATCH /api/exercises/:id — clobber y nombres", () => {
  it("PATCH sobre un ejercicio curado -> 409 aunque el cambio sea trivial", async () => {
    const res = await request(app).patch(`/api/exercises/${benchId}`).set(AUTH).send({ costo_fatiga: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/catálogo curado/);
  });

  it("renombrar hacia un nombre curado -> 409", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app)
      .patch(`/api/exercises/${created.body.id}`)
      .set(AUTH)
      .send({ nombre: "Flat Bench Press (barra)" });
    expect(res.status).toBe(409);
  });

  it("renombrar a un nombre ya existente (no curado) -> 409", async () => {
    await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ nombre: "Ya existe" }));
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase({ nombre: "Otro nombre" }));
    const res = await request(app).patch(`/api/exercises/${created.body.id}`).set(AUTH).send({ nombre: "Ya existe" });
    expect(res.status).toBe(409);
  });

  it("PATCH con el mismo nombre actual no colisiona consigo mismo", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app)
      .patch(`/api/exercises/${created.body.id}`)
      .set(AUTH)
      .send({ nombre: "Ejercicio de test" });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/exercises/:id — server-controlled", () => {
  it("rastrea_e1rm -> 400", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).patch(`/api/exercises/${created.body.id}`).set(AUTH).send({ rastrea_e1rm: 1 });
    expect(res.status).toBe(400);
  });

  it("es_competitivo -> 400", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).patch(`/api/exercises/${created.body.id}`).set(AUTH).send({ es_competitivo: true });
    expect(res.status).toBe(400);
  });
});

describe("no hay DELETE", () => {
  it("DELETE /api/exercises/:id -> 404 (ruta no existe)", async () => {
    const created = await request(app).post("/api/exercises").set(AUTH).send(ejercicioBase());
    const res = await request(app).delete(`/api/exercises/${created.body.id}`).set(AUTH);
    expect(res.status).toBe(404);
  });
});
