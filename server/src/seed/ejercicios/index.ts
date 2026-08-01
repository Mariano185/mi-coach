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

export const EJERCICIOS: SeedEjercicio[] = [
  ...PECHO_HOMBRO,
  ...ESPALDA_BRAZO,
  ...PIERNA_CORE,
];

/** Lanza si el catálogo tiene inconsistencias internas. */
export function validarCatalogo(ejercicios: SeedEjercicio[] = EJERCICIOS): void {
  const errores: string[] = [];

  const slugsMusculo = new Set(MUSCULOS.map((m) => m.slug));
  const slugsPatron = new Set(PATRONES.map((p) => p.slug));
  const nombres = new Set<string>();

  for (const ej of ejercicios) {
    if (nombres.has(ej.nombre)) {
      errores.push(`nombre duplicado: "${ej.nombre}"`);
    }
    nombres.add(ej.nombre);

    if (!slugsPatron.has(ej.patron)) {
      errores.push(`"${ej.nombre}": patrón desconocido "${ej.patron}"`);
    }

    if (ej.musculos.length === 0) {
      errores.push(`"${ej.nombre}": sin músculos asignados`);
    }
    const vistos = new Set<string>();
    let tieneAgonista = false;
    for (const [slug, rol, fraccion] of ej.musculos) {
      if (!slugsMusculo.has(slug)) {
        errores.push(`"${ej.nombre}": músculo desconocido "${slug}"`);
      }
      if (vistos.has(slug)) {
        errores.push(`"${ej.nombre}": músculo repetido "${slug}"`);
      }
      vistos.add(slug);
      if (rol === "A") tieneAgonista = true;
      if (fraccion < 0 || fraccion > 1) {
        errores.push(`"${ej.nombre}": fraccion_volumen fuera de rango en "${slug}" (${fraccion})`);
      }
      // Un estabilizador que sumara volumen inflaría el conteo de series por
      // músculo, que es justo la métrica que esta tabla existe para calcular.
      if (rol === "E" && fraccion !== 0) {
        errores.push(`"${ej.nombre}": estabilizador "${slug}" con fraccion_volumen ${fraccion} (debe ser 0)`);
      }
    }
    if (!tieneAgonista) {
      errores.push(`"${ej.nombre}": no tiene ningún músculo agonista`);
    }

    if (ej.transferencia !== undefined && (ej.transferencia <= 0 || ej.transferencia > 1)) {
      errores.push(`"${ej.nombre}": transferencia fuera de rango (${ej.transferencia})`);
    }
    // El linaje y el tipo de variante van juntos: una variante sin padre no se
    // puede resolver, y un padre con tipo_variante es una contradicción.
    if (ej.padre && !ej.tipo_variante) {
      errores.push(`"${ej.nombre}": tiene padre pero no tipo_variante`);
    }
    if (!ej.padre && ej.tipo_variante) {
      errores.push(`"${ej.nombre}": tiene tipo_variante pero no padre`);
    }
  }

  // Padres existentes y sin ciclos.
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
