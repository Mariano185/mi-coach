import { esFecha } from "./fecha.js";
import type { ObjetivoNutricionalSemana } from "../types.js";

// Validación del Objetivo nutricional que el coach manda en POST/PATCH de una Semana de
// programa (ADR 0003, GLOSSARY.md):
// - Los cuatro valores van siempre juntos: mandar solo algunos es un error.
// - La primera vez que la semana recibe objetivo se fija objetivos_pautados_en (hoy por
//   defecto). Corregirlo después no lo mueve; el coach puede mandarlo explícito.
// - Nota y fecha solo tienen sentido si la semana tiene (o recibe) objetivo.

const VALORES = [
  "objetivo_kcal",
  "objetivo_proteina_g",
  "objetivo_carbohidratos_g",
  "objetivo_grasas_g",
] as const;

export type CambiosObjetivo = Partial<ObjetivoNutricionalSemana>;

export function validarObjetivo(
  body: Record<string, unknown>,
  actual: Pick<ObjetivoNutricionalSemana, "objetivo_kcal" | "objetivos_pautados_en"> | null,
  hoy: string
): { error: string } | { cambios: CambiosObjetivo } {
  const presentes = VALORES.filter((k) => body[k] !== undefined);
  if (presentes.length > 0 && presentes.length < VALORES.length) {
    return { error: `el objetivo nutricional va completo: ${VALORES.join(", ")}` };
  }
  const cambios: CambiosObjetivo = {};
  for (const k of presentes) {
    const v = body[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      return { error: `${k} debe ser un entero ≥ 0` };
    }
    cambios[k] = v;
  }

  const nota = body.nota_nutricional;
  if (nota !== undefined && nota !== null && typeof nota !== "string") {
    return { error: "nota_nutricional debe ser texto" };
  }
  const pautado = body.objetivos_pautados_en;
  if (pautado !== undefined && !esFecha(pautado)) {
    return { error: "objetivos_pautados_en debe tener formato YYYY-MM-DD" };
  }

  const tieneObjetivo = presentes.length > 0 || (actual?.objetivo_kcal ?? null) !== null;
  if (!tieneObjetivo && (pautado !== undefined || (typeof nota === "string" && nota.trim() !== ""))) {
    return { error: "nota_nutricional y objetivos_pautados_en requieren el objetivo (los cuatro valores)" };
  }

  if (nota !== undefined) cambios.nota_nutricional = typeof nota === "string" ? nota.trim() || null : null;
  if (pautado !== undefined) {
    cambios.objetivos_pautados_en = pautado;
  } else if (presentes.length > 0 && !actual?.objetivos_pautados_en) {
    cambios.objetivos_pautados_en = hoy;
  }
  return { cambios };
}
