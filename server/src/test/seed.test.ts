import { describe, it, expect } from "vitest";
import { MUSCULOS } from "../seed/musculos.js";
import { PATRONES } from "../seed/patrones.js";
import { EJERCICIOS, validarCatalogo } from "../seed/ejercicios/index.js";
import type { SeedEjercicio } from "../seed/ejercicios/tipos.js";

describe("catálogo de la enciclopedia", () => {
  it("es internamente consistente (slugs, linaje, roles)", () => {
    expect(() => validarCatalogo()).not.toThrow();
  });

  it("no tiene slugs duplicados en músculos ni patrones", () => {
    expect(new Set(MUSCULOS.map((m) => m.slug)).size).toBe(MUSCULOS.length);
    expect(new Set(PATRONES.map((p) => p.slug)).size).toBe(PATRONES.length);
    expect(new Set(MUSCULOS.map((m) => m.nombre)).size).toBe(MUSCULOS.length);
    expect(new Set(PATRONES.map((p) => p.nombre)).size).toBe(PATRONES.length);
  });

  it("cubre los 3 movimientos de competencia y solo esos rastrean e1RM", () => {
    const conE1rm = EJERCICIOS.filter((e) => e.rastrea_e1rm).map((e) => e.nombre).sort();
    expect(conE1rm).toEqual([
      "Conventional Deadlift",
      "Flat Bench Press (barra)",
      "Mid/High Bar Back Squat",
    ]);
  });

  it("ninguna variante rastrea e1RM: su 1RM no es comparable con el del padre", () => {
    for (const ej of EJERCICIOS) {
      if (ej.padre) expect(ej.rastrea_e1rm ?? false).toBe(false);
    }
  });

  it("toda variante declara transferencia y propósito, que es lo que la hace elegible", () => {
    for (const ej of EJERCICIOS) {
      if (!ej.padre) continue;
      expect(ej.transferencia, `${ej.nombre} sin transferencia`).toBeTypeOf("number");
      expect(ej.proposito, `${ej.nombre} sin propósito`).toBeTruthy();
    }
  });

  it("cada ejercicio tiene su propia grilla muscular (las variantes no heredan)", () => {
    for (const ej of EJERCICIOS) {
      expect(ej.musculos.length, `${ej.nombre} sin músculos`).toBeGreaterThan(0);
    }
  });

  it("los estabilizadores nunca suman volumen", () => {
    for (const ej of EJERCICIOS) {
      for (const [slug, rol, fraccion] of ej.musculos) {
        if (rol === "E") expect(fraccion, `${ej.nombre} / ${slug}`).toBe(0);
      }
    }
  });

  it("el press inclinado invierte el agonista entre 30° y 60°", () => {
    const primerAgonista = (nombre: string) => {
      const ej = EJERCICIOS.find((e) => e.nombre === nombre)!;
      return ej.musculos[0][0];
    };
    expect(primerAgonista("Incline Dumbbell Press 30° (pecho superior)")).toBe("pec-clavicular");
    expect(primerAgonista("Incline Dumbbell Press 60°")).toBe("deltoides-anterior");
  });
});

describe("validarCatalogo detecta catálogos rotos", () => {
  const base: SeedEjercicio = {
    nombre: "Test",
    categoria: "Test",
    patron: "empuje-horizontal",
    implemento: "barra",
    mecanica: "compuesto",
    fuerza: "empuje",
    sesgo_longitud: "medio",
    costo_fatiga: 3,
    demanda_estabilidad: 3,
    demanda_tecnica: 3,
    musculos: [["pec-esternal", "A", 1.0]],
  };

  it("rechaza un slug de músculo inexistente", () => {
    expect(() =>
      validarCatalogo([{ ...base, musculos: [["musculo-que-no-existe", "A", 1.0]] }])
    ).toThrow(/músculo desconocido/);
  });

  it("rechaza un patrón inexistente", () => {
    expect(() => validarCatalogo([{ ...base, patron: "patron-inventado" }])).toThrow(
      /patrón desconocido/
    );
  });

  it("rechaza una variante cuyo padre no existe", () => {
    expect(() =>
      validarCatalogo([{ ...base, padre: "No existe", tipo_variante: "tempo", transferencia: 0.9 }])
    ).toThrow(/padre inexistente/);
  });

  it("rechaza un ciclo en el linaje", () => {
    const a: SeedEjercicio = { ...base, nombre: "A", padre: "B", tipo_variante: "tempo", transferencia: 0.9 };
    const b: SeedEjercicio = { ...base, nombre: "B", padre: "A", tipo_variante: "tempo", transferencia: 0.9 };
    expect(() => validarCatalogo([a, b])).toThrow(/ciclo/);
  });

  it("rechaza un ejercicio sin agonista", () => {
    expect(() => validarCatalogo([{ ...base, musculos: [["pec-esternal", "S", 0.5]] }])).toThrow(
      /sin.*agonista|no tiene ningún músculo agonista/
    );
  });

  it("rechaza un estabilizador que sume volumen", () => {
    expect(() =>
      validarCatalogo([{ ...base, musculos: [["pec-esternal", "A", 1.0], ["serrato", "E", 0.5]] }])
    ).toThrow(/estabilizador/);
  });

  it("rechaza un músculo repetido en el mismo ejercicio", () => {
    expect(() =>
      validarCatalogo([{ ...base, musculos: [["pec-esternal", "A", 1.0], ["pec-esternal", "S", 0.5]] }])
    ).toThrow(/repetido/);
  });

  it("rechaza padre sin tipo_variante", () => {
    expect(() => validarCatalogo([{ ...base, nombre: "X" }, { ...base, nombre: "Y", padre: "X" }])).toThrow(
      /tipo_variante/
    );
  });

  it("rechaza padre sin transferencia (endurecimiento: coincide con seed.test 'toda variante declara transferencia')", () => {
    expect(() =>
      validarCatalogo([
        { ...base, nombre: "X" },
        { ...base, nombre: "Y", padre: "X", tipo_variante: "tempo", proposito: "Algo" },
      ])
    ).toThrow(/transferencia/);
  });

  it("rechaza padre sin proposito", () => {
    expect(() =>
      validarCatalogo([
        { ...base, nombre: "X" },
        { ...base, nombre: "Y", padre: "X", tipo_variante: "tempo", transferencia: 0.9 },
      ])
    ).toThrow(/proposito/);
  });

  it("el refactor conserva el prefijo del nombre en los mensajes delegados", () => {
    expect(() =>
      validarCatalogo([{ ...base, nombre: "Sentadilla Test", musculos: [["pec-esternal", "S", 0.5]] }])
    ).toThrow(/"Sentadilla Test": no tiene ningún músculo agonista/);
  });
});
