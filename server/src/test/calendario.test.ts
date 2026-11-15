import { describe, it, expect } from "vitest";
import { crearCalendario, type SemanaCalendario } from "../calendario.js";

// Reglas del ADR 0003 ("dos relojes"): la semana N va desde el día siguiente a la última
// sesión de la N−1 hasta su propia última sesión (o hasta hoy si es la última).

function semana(id: number, sesiones: string[], extra: Partial<SemanaCalendario> = {}): SemanaCalendario {
  return { id, sesiones, objetivo: null, ...extra };
}

describe("calendario — rango de una Semana de programa", () => {
  const HOY = "2026-11-20";

  it("los descansos después de la última sesión pertenecen a la semana siguiente", () => {
    const cal = crearCalendario(
      [semana(1, ["2026-11-01", "2026-11-03", "2026-11-08"]), semana(2, ["2026-11-11", "2026-11-14"])],
      HOY
    );
    expect(cal.rangoDe(1)).toEqual({ desde: null, hasta: "2026-11-08" });
    expect(cal.rangoDe(2)).toEqual({ desde: "2026-11-09", hasta: HOY });
    expect(cal.semanaDe("2026-11-10")).toBe(2);
    expect(cal.semanaDe("2026-11-08")).toBe(1);
  });

  it("la semana en curso llega hasta hoy, aunque su última sesión sea anterior", () => {
    const cal = crearCalendario([semana(1, ["2026-11-01"]), semana(2, ["2026-11-12"])], HOY);
    expect(cal.rangoDe(2)).toEqual({ desde: "2026-11-02", hasta: HOY });
    expect(cal.semanaDe(HOY)).toBe(2);
  });

  it("una semana sin sesiones arranca el día siguiente a la última sesión de la anterior", () => {
    const cal = crearCalendario([semana(1, ["2026-11-01", "2026-11-08"]), semana(2, [])], HOY);
    expect(cal.rangoDe(2)).toEqual({ desde: "2026-11-09", hasta: HOY });
  });

  it("una semana intermedia sin sesiones no tiene fechas: la siguiente arranca donde terminó la última con sesiones", () => {
    const cal = crearCalendario(
      [semana(1, ["2026-11-01", "2026-11-08"]), semana(2, []), semana(3, ["2026-11-12"])],
      HOY
    );
    expect(cal.rangoDe(2)).toBeNull();
    expect(cal.rangoDe(3)).toEqual({ desde: "2026-11-09", hasta: HOY });
    expect(cal.semanaDe("2026-11-10")).toBe(3);
  });

  it("ordena las semanas por id, no por el orden en que llegan", () => {
    const cal = crearCalendario([semana(2, ["2026-11-11"]), semana(1, ["2026-11-01", "2026-11-08"])], HOY);
    expect(cal.rangoDe(2)).toEqual({ desde: "2026-11-09", hasta: HOY });
  });

  it("cruza fin de mes", () => {
    const cal = crearCalendario([semana(1, ["2026-10-31"]), semana(2, [])], HOY);
    expect(cal.rangoDe(2)?.desde).toBe("2026-11-01");
  });

  it("sin semanas no hay semana para ninguna fecha", () => {
    const cal = crearCalendario([], HOY);
    expect(cal.semanaDe(HOY)).toBeNull();
    expect(cal.objetivoEn(HOY)).toBeNull();
  });
});

describe("calendario — Objetivo nutricional vigente en una fecha", () => {
  const HOY = "2026-11-20";
  const OBJ_A = { kcal: 2600, proteina_g: 180, carbohidratos_g: 300, grasas_g: 75, nota: "A", pautado_en: "2026-10-30" };
  const OBJ_B = { kcal: 2400, proteina_g: 190, carbohidratos_g: 250, grasas_g: 70, nota: "B", pautado_en: "2026-11-09" };

  it("una fecha de la semana con objetivo usa ese objetivo", () => {
    const cal = crearCalendario(
      [semana(1, ["2026-11-01", "2026-11-08"], { objetivo: OBJ_A }), semana(2, ["2026-11-11"], { objetivo: OBJ_B })],
      HOY
    );
    expect(cal.objetivoEn("2026-11-03")).toMatchObject({ week_id: 1, kcal: 2600, nota: "A" });
    expect(cal.objetivoEn("2026-11-10")).toMatchObject({ week_id: 2, kcal: 2400, nota: "B" });
  });

  it("una semana sin objetivo hereda el anterior", () => {
    const cal = crearCalendario(
      [semana(1, ["2026-11-01", "2026-11-08"], { objetivo: OBJ_A }), semana(2, ["2026-11-11"])],
      HOY
    );
    expect(cal.objetivoEn("2026-11-15")).toMatchObject({ week_id: 1, kcal: 2600 });
  });

  it("pautado tarde: las fechas previas a objetivos_pautados_en usan el anterior", () => {
    const tarde = { ...OBJ_B, pautado_en: "2026-11-12" };
    const cal = crearCalendario(
      [semana(1, ["2026-11-01", "2026-11-08"], { objetivo: OBJ_A }), semana(2, ["2026-11-11"], { objetivo: tarde })],
      HOY
    );
    expect(cal.objetivoEn("2026-11-09")).toMatchObject({ week_id: 1 });
    expect(cal.objetivoEn("2026-11-11")).toMatchObject({ week_id: 1 });
    expect(cal.objetivoEn("2026-11-12")).toMatchObject({ week_id: 2 });
  });

  it("un objetivo pautado por adelantado no se aplica a fechas de la semana previa", () => {
    // La semana 2 se creó el 05, con la 1 todavía en curso hasta el 08.
    const adelantado = { ...OBJ_B, pautado_en: "2026-11-05" };
    const cal = crearCalendario(
      [semana(1, ["2026-11-01", "2026-11-08"], { objetivo: OBJ_A }), semana(2, ["2026-11-11"], { objetivo: adelantado })],
      HOY
    );
    expect(cal.objetivoEn("2026-11-06")).toMatchObject({ week_id: 1 });
    expect(cal.objetivoEn("2026-11-09")).toMatchObject({ week_id: 2 });
  });

  it("antes del primer objetivo pautado no hay objetivo", () => {
    const cal = crearCalendario([semana(1, ["2026-11-01"], { objetivo: { ...OBJ_A, pautado_en: "2026-11-02" } })], HOY);
    expect(cal.objetivoEn("2026-11-01")).toBeNull();
  });
});
