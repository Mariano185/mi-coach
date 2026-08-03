// Concatena el catálogo de ejercicios y lo valida antes de que llegue a la DB.
//
// La validación corre en el arranque (la llama seedEnciclopedia) porque estos
// datos se escriben a mano: un slug mal tipeado o un padre inexistente serían
// filas silenciosamente incompletas, y el coach tomaría decisiones sobre un
// catálogo roto sin que nadie se entere.

import { MUSCULOS } from "../musculos.js";
import { PATRONES } from "../patrones.js";
import type { SeedEjercicio } from "./tipos.js";
import { PECHO_HOMBRO } from "./pecho-hombro.js";
import { ESPALDA_BRAZO } from "./espalda-brazo.js";
import { PIERNA_CORE } from "./pierna-core.js";
import { validarEjercicio, type EjercicioNormalizado } from "../../validacion/ejercicio.js";
import { ROL_LARGO } from "./tipos.js";

export const EJERCICIOS: SeedEjercicio[] = [
  ...PECHO_HOMBRO,
  ...ESPALDA_BRAZO,
  ...PIERNA_CORE,
];

/** SeedEjercicio (slugs, roles cortos "A"/"S"/"E") → EjercicioNormalizado
 *  (la forma que valida el módulo compartido con la API: roles largos). */
function normalizarSeed(ej: SeedEjercicio): EjercicioNormalizado {
  return {
    nombre: ej.nombre,
    patron: ej.patron,
    padre: ej.padre ?? null,
    tipo_variante: ej.tipo_variante ?? null,
    transferencia: ej.transferencia ?? null,
    proposito: ej.proposito ?? null,
    implemento: ej.implemento,
    mecanica: ej.mecanica,
    fuerza: ej.fuerza,
    sesgo_longitud: ej.sesgo_longitud,
    perfil_resistencia: ej.perfil_resistencia ?? null,
    cadena: ej.cadena ?? null,
    costo_fatiga: ej.costo_fatiga,
    demanda_estabilidad: ej.demanda_estabilidad,
    demanda_tecnica: ej.demanda_tecnica,
    musculos: ej.musculos.map(([slug, rol, fraccion]) => ({
      clave: slug,
      rol: ROL_LARGO[rol],
      fraccion,
    })),
  };
}

/** Lanza si el catálogo tiene inconsistencias internas. */
export function validarCatalogo(ejercicios: SeedEjercicio[] = EJERCICIOS): void {
  const errores: string[] = [];

  const slugsMusculo = new Set(MUSCULOS.map((m) => m.slug));
  const slugsPatron = new Set(PATRONES.map((p) => p.slug));
  const nombres = new Set<string>();

  for (const ej of ejercicios) {
    // (1) nombre único — invariante de catálogo entero, no delegable.
    if (nombres.has(ej.nombre)) {
      errores.push(`nombre duplicado: "${ej.nombre}"`);
    }
    nombres.add(ej.nombre);

    // (2) patrón conocido y (4) músculos conocidos: resueltos contra los
    // catálogos estáticos (la API resuelve las mismas dos contra la DB).
    if (!slugsPatron.has(ej.patron)) {
      errores.push(`"${ej.nombre}": patrón desconocido "${ej.patron}"`);
    }
    for (const [slug] of ej.musculos) {
      if (!slugsMusculo.has(slug)) {
        errores.push(`"${ej.nombre}": músculo desconocido "${slug}"`);
      }
    }

    // (3, 5-11) reglas por-ejercicio, compartidas con la API.
    for (const err of validarEjercicio(normalizarSeed(ej))) {
      errores.push(`"${ej.nombre}": ${err}`);
    }
  }

  // (12) linaje: padre existente, no auto-padre, sin ciclos. Contra el array
  // estático (la API hace lo mismo contra ejercicio_padre_id en la DB, con un
  // CTE recursivo — ver validacion/ejercicio-db.ts).
  const porNombre = new Map(ejercicios.map((e) => [e.nombre, e]));
  for (const ej of ejercicios) {
    if (!ej.padre) continue;
    if (!porNombre.has(ej.padre)) {
      errores.push(`"${ej.nombre}": padre inexistente "${ej.padre}"`);
      continue;
    }
    if (ej.padre === ej.nombre) {
      errores.push(`"${ej.nombre}": es su propio padre`);
      continue;
    }
    const cadena = new Set<string>([ej.nombre]);
    let actual = porNombre.get(ej.padre);
    while (actual?.padre) {
      if (cadena.has(actual.nombre)) {
        errores.push(`ciclo en el linaje que incluye a "${ej.nombre}"`);
        break;
      }
      cadena.add(actual.nombre);
      actual = porNombre.get(actual.padre);
    }
  }

  if (errores.length > 0) {
    throw new Error(`Catálogo de ejercicios inválido:\n  - ${errores.join("\n  - ")}`);
  }
}
