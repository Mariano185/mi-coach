import { describe, it, expect, vi } from "vitest";

vi.mock("../db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db.js")>();
  return {
    ...actual,
    db: {},
    getSetting: () => null,
    setSetting: () => {},
    initDb: () => {},
  };
});

const { parseSeriesReps, parseRpe } = await import("../db.js");

describe("parseSeriesReps", () => {
  it("parsea formato estándar 3×5", () => {
    expect(parseSeriesReps("3×5")).toEqual({ series: 3, reps: 5 });
  });

  it("parsea con x minúscula", () => {
    expect(parseSeriesReps("4x6")).toEqual({ series: 4, reps: 6 });
  });

  it("toma el primer número de un rango 4×6-8", () => {
    expect(parseSeriesReps("4×6-8")).toEqual({ series: 4, reps: 6 });
  });

  it("toma el primer número de un rango 3×12-15", () => {
    expect(parseSeriesReps("3×12-15")).toEqual({ series: 3, reps: 12 });
  });

  it("devuelve series=3, reps=null si el texto no tiene formato reconocible", () => {
    expect(parseSeriesReps("AMRAP")).toEqual({ series: 3, reps: null });
  });
});

describe("parseRpe", () => {
  it("parsea RPE entero", () => {
    expect(parseRpe("7")).toBe(7);
  });

  it("parsea RPE con rango, devuelve el primero", () => {
    expect(parseRpe("7-8")).toBe(7);
  });

  it("parsea RPE con coma decimal", () => {
    expect(parseRpe("7,5")).toBe(7.5);
  });

  it("devuelve null si no hay número", () => {
    expect(parseRpe("—")).toBeNull();
  });

  it("devuelve null para string vacío", () => {
    expect(parseRpe("")).toBeNull();
  });
});
