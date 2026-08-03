// Validación por-ejercicio de la enciclopedia: reglas que se deciden mirando
// UN ejercicio aislado (grilla muscular + linaje + vocabularios), compartidas
// entre el seed (validarCatalogo, sobre el array estático) y la API (sobre un
// POST/PATCH). Módulo PURO — sin `db`, sin `express` — para que el seed lo
// pueda importar sin arrastrar db.ts (initDb() corre el seed; sería circular).
//
// Fuera de acá quedan las reglas que necesitan un universo (nombre único,
// patrón conocido, músculos conocidos, linaje sin ciclos): el seed las
// resuelve contra el array estático, la API contra la DB (ver ejercicio-db.ts).

export const IMPLEMENTOS = [
  "barra",
  "mancuerna",
  "polea",
  "maquina",
  "smith",
  "peso_corporal",
  "banda",
  "kettlebell",
] as const;

export const TIPOS_VARIANTE = [
  "angulo",
  "agarre",
  "postura",
  "tempo",
  "pausa",
  "rom",
  "resistencia_acomodada",
  "implemento",
  "unilateral",
] as const;

export const MECANICAS = ["compuesto", "aislamiento"] as const;
export const FUERZAS = ["empuje", "traccion", "estatico"] as const;
export const SESGOS_LONGITUD = ["alargado", "medio", "acortado"] as const;
export const PERFILES_RESISTENCIA = ["ascendente", "descendente", "campana", "constante"] as const;
export const CADENAS = ["abierta", "cerrada"] as const;
export const ROLES = ["agonista", "sinergista", "estabilizador"] as const;

export type Rol = (typeof ROLES)[number];

/** Grilla muscular normalizada. `clave` es opaca: slug en el seed, musculo_id en la API. */
export type MusculoNormalizado = { clave: string | number; rol: string; fraccion: number };

/** Ejercicio normalizado para validarEjercicio(). `patron`/`padre` son opacos:
 *  slug/nombre en el seed, id en la API — las reglas de acá no los resuelven,
 *  solo miran si están presentes o no. */
export type EjercicioNormalizado = {
  nombre: string;
  patron: string | number | null;
  padre: string | number | null;
  tipo_variante: string | null;
  transferencia: number | null;
  proposito: string | null;
  implemento: string | null;
  mecanica: string | null;
  fuerza: string | null;
  sesgo_longitud: string | null;
  perfil_resistencia: string | null;
  cadena: string | null;
  costo_fatiga: number | null;
  demanda_estabilidad: number | null;
  demanda_tecnica: number | null;
  musculos: MusculoNormalizado[];
};

function esEscala1a5(v: number | null): boolean {
  return v !== null && Number.isInteger(v) && v >= 1 && v <= 5;
}

function validarVocabulario(
  campo: string,
  valor: string | null,
  permitidos: readonly string[]
): string | null {
  if (valor === null) return null;
  return permitidos.includes(valor) ? null : `${campo} debe ser uno de: ${permitidos.join(", ")}`;
}

/**
 * Reglas 3, 5-11 del catálogo (ver docs/adr/0001): todo lo que se decide
 * mirando un ejercicio aislado. Devuelve la lista de errores SIN el prefijo
 * del nombre (cada llamador decide cómo presentarlos) — vacía = válido.
 */
export function validarEjercicio(ej: EjercicioNormalizado): string[] {
  const errores: string[] = [];

  // --- Vocabularios controlados y escalas ---
  const vocab: Array<[string, string | null, readonly string[]]> = [
    ["implemento", ej.implemento, IMPLEMENTOS],
    ["tipo_variante", ej.tipo_variante, TIPOS_VARIANTE],
    ["mecanica", ej.mecanica, MECANICAS],
    ["fuerza", ej.fuerza, FUERZAS],
    ["sesgo_longitud", ej.sesgo_longitud, SESGOS_LONGITUD],
    ["perfil_resistencia", ej.perfil_resistencia, PERFILES_RESISTENCIA],
    ["cadena", ej.cadena, CADENAS],
  ];
  for (const [campo, valor, permitidos] of vocab) {
    const err = validarVocabulario(campo, valor, permitidos);
    if (err) errores.push(err);
  }

  for (const [campo, valor] of [
    ["costo_fatiga", ej.costo_fatiga],
    ["demanda_estabilidad", ej.demanda_estabilidad],
    ["demanda_tecnica", ej.demanda_tecnica],
  ] as const) {
    if (!esEscala1a5(valor)) {
      errores.push(`${campo} debe ser un entero entre 1 y 5`);
    }
  }

  // --- Grilla muscular (reglas 3, 5-8) ---
  if (ej.musculos.length === 0) {
    errores.push("sin músculos asignados");
  }
  const vistos = new Set<string | number>();
  let tieneAgonista = false;
  for (const m of ej.musculos) {
    if (!ROLES.includes(m.rol as Rol)) {
      errores.push(`rol inválido "${m.rol}"`);
    }
    if (vistos.has(m.clave)) {
      errores.push(`músculo repetido "${m.clave}"`);
    }
    vistos.add(m.clave);
    if (m.rol === "agonista") tieneAgonista = true;
    if (m.fraccion < 0 || m.fraccion > 1) {
      errores.push(`fraccion_volumen fuera de rango en "${m.clave}" (${m.fraccion})`);
    }
    // Un estabilizador que sumara volumen inflaría el conteo de series por
    // músculo, que es justo la métrica que esta tabla existe para calcular.
    if (m.rol === "estabilizador" && m.fraccion !== 0) {
      errores.push(`estabilizador "${m.clave}" con fraccion_volumen ${m.fraccion} (debe ser 0)`);
    }
  }
  if (!tieneAgonista) {
    errores.push("no tiene ningún músculo agonista");
  }

  // --- Linaje (reglas 9-11) ---
  if (ej.transferencia !== null && (ej.transferencia <= 0 || ej.transferencia > 1)) {
    errores.push(`transferencia fuera de rango (${ej.transferencia})`);
  }
  // El linaje, el tipo de variante, la transferencia y el propósito van
  // juntos: es lo que hace a una variante elegible por el coach (ver
  // seed.test.ts "toda variante declara transferencia y propósito").
  if (ej.padre !== null) {
    if (!ej.tipo_variante) errores.push("tiene padre pero no tipo_variante");
    if (ej.transferencia === null) errores.push("tiene padre pero no transferencia");
    if (!ej.proposito) errores.push("tiene padre pero no proposito");
  }
  if (ej.padre === null && ej.tipo_variante) {
    errores.push("tiene tipo_variante pero no padre");
  }

  return errores;
}
