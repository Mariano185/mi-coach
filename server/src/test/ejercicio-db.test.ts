import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "./setup.js";
import { seedEnciclopedia } from "../seed/index.js";

const db: TestDb = createTestDb();
seedEnciclopedia(db);

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

const { esCurado, nombreDuplicado, patronExiste, musculosInexistentes, validarLinajeDb } = await import(
  "../validacion/ejercicio-db.js"
);

describe("esCurado", () => {
  it("reconoce un nombre del catálogo curado", () => {
    expect(esCurado("Flat Bench Press (barra)")).toBe(true);
  });

  it("no marca como curado un nombre inventado", () => {
    expect(esCurado("Ejercicio que no existe en el seed")).toBe(false);
  });
});

describe("nombreDuplicado", () => {
  beforeEach(() => {
    db.exec("DELETE FROM exercises WHERE nombre = 'Dup Test';");
  });

  it("detecta un nombre ya existente", () => {
    db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('Dup Test', 'Test')").run();
    expect(nombreDuplicado("Dup Test")).toBe(true);
  });

  it("no reporta duplicado si el nombre no existe", () => {
    expect(nombreDuplicado("Dup Test")).toBe(false);
  });

  it("exceptoId excluye la propia fila (caso PATCH que no cambia el nombre)", () => {
    const id = db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('Dup Test', 'Test')").run()
      .lastInsertRowid as number;
    expect(nombreDuplicado("Dup Test", id)).toBe(false);
  });

  it("exceptoId no oculta una colisión con OTRA fila", () => {
    const id = db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('Dup Test', 'Test')").run()
      .lastInsertRowid as number;
    db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('Dup Test 2', 'Test')").run();
    expect(nombreDuplicado("Dup Test 2", id)).toBe(true);
  });
});

describe("patronExiste", () => {
  it("true para un patron_id real", () => {
    const patron = db.prepare("SELECT id FROM patrones LIMIT 1").get() as { id: number };
    expect(patronExiste(patron.id)).toBe(true);
  });

  it("false para un id inexistente", () => {
    expect(patronExiste(999999)).toBe(false);
  });
});

describe("musculosInexistentes", () => {
  it("array vacío si todos existen", () => {
    const ids = (db.prepare("SELECT id FROM musculos LIMIT 2").all() as Array<{ id: number }>).map((r) => r.id);
    expect(musculosInexistentes(ids)).toEqual([]);
  });

  it("devuelve los ids que faltan", () => {
    expect(musculosInexistentes([999997, 999998])).toEqual([999997, 999998]);
  });

  it("array vacío de entrada devuelve array vacío (sin consultar la DB)", () => {
    expect(musculosInexistentes([])).toEqual([]);
  });
});

describe("validarLinajeDb", () => {
  beforeEach(() => {
    db.exec("DELETE FROM exercises WHERE categoria = 'LinajeTest';");
  });

  it("padre null es válido (ejercicio canónico)", () => {
    expect(validarLinajeDb(null, null)).toBeNull();
  });

  it("padre inexistente es error", () => {
    expect(validarLinajeDb(null, 999999)).toMatch(/inexistente/);
  });

  it("POST (hijoId null) con padre válido no chequea ciclo", () => {
    const padre = db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('Padre LT', 'LinajeTest')").run()
      .lastInsertRowid as number;
    expect(validarLinajeDb(null, padre)).toBeNull();
  });

  it("auto-padre es error", () => {
    const id = db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('Self LT', 'LinajeTest')").run()
      .lastInsertRowid as number;
    expect(validarLinajeDb(id, id)).toMatch(/propio padre/);
  });

  it("ciclo directo: A padre de B, PATCH B para que sea padre de A", () => {
    const a = db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('A LT', 'LinajeTest')").run()
      .lastInsertRowid as number;
    const b = db
      .prepare("INSERT INTO exercises (nombre, categoria, ejercicio_padre_id) VALUES ('B LT', 'LinajeTest', ?)")
      .run(a).lastInsertRowid as number;
    // intento: A pasa a tener padre B (pero B ya cuelga de A) → ciclo
    expect(validarLinajeDb(a, b)).toMatch(/ciclo/);
  });

  it("ciclo indirecto: A←B←C, intentar que A cuelgue de C", () => {
    const a = db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('A2 LT', 'LinajeTest')").run()
      .lastInsertRowid as number;
    const b = db
      .prepare("INSERT INTO exercises (nombre, categoria, ejercicio_padre_id) VALUES ('B2 LT', 'LinajeTest', ?)")
      .run(a).lastInsertRowid as number;
    const c = db
      .prepare("INSERT INTO exercises (nombre, categoria, ejercicio_padre_id) VALUES ('C2 LT', 'LinajeTest', ?)")
      .run(b).lastInsertRowid as number;
    expect(validarLinajeDb(a, c)).toMatch(/ciclo/);
  });

  it("reparenting válido: mover un hijo a otro padre sin ciclo", () => {
    const a = db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('A3 LT', 'LinajeTest')").run()
      .lastInsertRowid as number;
    const d = db.prepare("INSERT INTO exercises (nombre, categoria) VALUES ('D3 LT', 'LinajeTest')").run()
      .lastInsertRowid as number;
    const b = db
      .prepare("INSERT INTO exercises (nombre, categoria, ejercicio_padre_id) VALUES ('B3 LT', 'LinajeTest', ?)")
      .run(a).lastInsertRowid as number;
    expect(validarLinajeDb(b, d)).toBeNull();
  });
});
