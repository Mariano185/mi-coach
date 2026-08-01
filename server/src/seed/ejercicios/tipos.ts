// Tipos y defaults del seed de ejercicios (ver docs/adr/0001).
//
// Objetivo del formato: que cada ejercicio declare SOLO lo que lo distingue.
// Todo lo que es habitual (bilateral, cadena abierta, sin carga axial) sale de
// DEFAULTS_EJERCICIO y no se repite en 130 filas.
//
// El campo `musculos` usa tuplas [slug, rol, fraccion] y el ORDEN DEL ARRAY es
// el `orden` de la tabla (1 = mayor contribución). Es ordinal a propósito: la
// evidencia no respalda asignar porcentajes de contribución por músculo
// (ver la nota sobre EMG en el ADR).

export type RolCorto = "A" | "S" | "E"; // agonista | sinergista | estabilizador

export const ROL_LARGO: Record<RolCorto, string> = {
  A: "agonista",
  S: "sinergista",
  E: "estabilizador",
};

/**
 * fraccion_volumen: cuánto cuenta una serie de este ejercicio para ESTE músculo
 * al sumar volumen semanal.
 *   1.0  — el músculo es un motor directo y el ejercicio lo lleva cerca del fallo
 *   0.5  — participa de forma significativa pero no limita la serie
 *   0.25 — participación menor
 *   0    — estabiliza sin acumular volumen de hipertrofia computable
 * Los estabilizadores van casi siempre en 0: cuentan para entender el ejercicio,
 * no para el conteo de series efectivas.
 */
export type MusculoRef = [slug: string, rol: RolCorto, fraccion: number];

export type SeedEjercicio = {
  nombre: string; // debe coincidir EXACTO con exercises.nombre si la fila ya existe
  categoria: string; // se mantiene durante la transición; se retira en el cutover
  patron: string; // slug de PATRONES

  // --- Linaje (variante → padre) ---
  padre?: string; // nombre exacto del ejercicio padre
  tipo_variante?:
    | "angulo"
    | "agarre"
    | "postura"
    | "tempo"
    | "pausa"
    | "rom"
    | "resistencia_acomodada"
    | "implemento"
    | "unilateral";
  transferencia?: number; // 0-1: cuánto transfiere al padre (Appleby et al., ver ADR)
  proposito?: string; // para qué se elige esta variante y no el padre

  // --- Identidad ---
  implemento:
    | "barra"
    | "mancuerna"
    | "polea"
    | "maquina"
    | "smith"
    | "peso_corporal"
    | "banda"
    | "kettlebell";
  angulo_grados?: number;
  agarre?: string;
  postura?: string;
  unilateral?: boolean;

  // --- Biomecánica ---
  mecanica: "compuesto" | "aislamiento";
  fuerza: "empuje" | "traccion" | "estatico";
  /**
   * Longitud del/los agonista(s) en el punto de mayor tensión.
   * OJO: criterio de desempate, no ley — la evidencia es mixta (ver ADR).
   */
  sesgo_longitud: "alargado" | "medio" | "acortado";
  /** Dónde del ROM es más difícil. */
  perfil_resistencia?: "ascendente" | "descendente" | "campana" | "constante";
  cadena?: "abierta" | "cerrada";
  /** Comprime la columna bajo carga (barra sobre la espalda, de pie con peso). */
  carga_axial?: boolean;

  // --- Costo: HEURÍSTICAS declaradas, no mediciones (ver ADR) ---
  costo_fatiga: 1 | 2 | 3 | 4 | 5;
  demanda_estabilidad: 1 | 2 | 3 | 4 | 5;
  demanda_tecnica: 1 | 2 | 3 | 4 | 5;

  // --- Tracking ---
  rastrea_e1rm?: boolean; // ¿se le sigue el e1RM? (los 3 de competencia)
  es_competitivo?: boolean; // ¿es un movimiento de competencia de powerlifting?

  // --- Texto ---
  notas_tecnicas?: string;
  contraindicaciones?: string;
  cues?: string;

  musculos: MusculoRef[];
};

export const DEFAULTS_EJERCICIO = {
  unilateral: false,
  cadena: "abierta" as const,
  carga_axial: false,
  perfil_resistencia: "campana" as const,
  rastrea_e1rm: false,
  es_competitivo: false,
};
