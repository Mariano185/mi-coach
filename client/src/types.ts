// Tipos del dominio en el cliente (espejo del server).

export interface Exercise {
  id: number;
  nombre: string;
  categoria: string;
  rastrea_e1rm: 0 | 1 | null; // NULL en ejercicios que no corrieron el seed de la enciclopedia
}

// === Enciclopedia de ejercicios (ver docs/adr/0001) ===
// Vocabularios controlados — documentados acá, no como union types estrictos:
// la columna SQL es TEXT libre para no romper si el seed usa un valor nuevo
// que todavía no se reflejó en el tipo.
//   implemento:         barra | mancuerna | polea | maquina | smith | peso_corporal | banda | kettlebell
//   tipo_variante:       angulo | agarre | postura | tempo | pausa | rom | resistencia_acomodada | implemento | unilateral
//   mecanica:            compuesto | aislamiento
//   fuerza:              empuje | traccion | estatico
//   sesgo_longitud:      alargado | medio | acortado   (criterio de desempate, no ley — ver ADR)
//   perfil_resistencia:  ascendente | descendente | campana | constante
//   cadena:              abierta | cerrada
//   rol (en EjercicioMusculo): agonista | sinergista | estabilizador

export interface Musculo {
  id: number;
  nombre: string;
  nombre_en: string | null;
  grupo: string;
  region: string | null;
  biarticular: 0 | 1;
  n_ejercicios: number;
}

export interface Patron {
  id: number;
  nombre: string;
  plano: string | null;
  descripcion: string | null;
  n_ejercicios: number;
}

// Fila de GET /api/exercises?musculo_id=X — forma compacta + el rol de ese
// ejercicio para el músculo filtrado.
export interface ExerciseConRol extends Exercise {
  rol: string;
  orden: number;
  fraccion_volumen: number;
}

export interface EjercicioMusculo {
  id: number;
  exercise_id: number;
  musculo_id: number;
  rol: string;
  orden: number;
  fraccion_volumen: number;
}

// Detalle completo de un ejercicio: identidad, biomecánica y su grilla muscular
// propia (cada variante lleva la suya, no la hereda del padre — ver ADR).
export interface ExerciseDetalle extends Exercise {
  patron_id: number | null;
  patron_nombre: string | null;
  ejercicio_padre_id: number | null;
  ejercicio_padre_nombre: string | null;
  tipo_variante: string | null;
  transferencia: number | null;
  proposito: string | null;
  implemento: string | null;
  angulo_grados: number | null;
  agarre: string | null;
  postura: string | null;
  unilateral: 0 | 1 | null;
  mecanica: string | null;
  fuerza: string | null;
  sesgo_longitud: string | null;
  perfil_resistencia: string | null;
  cadena: string | null;
  carga_axial: 0 | 1 | null;
  costo_fatiga: number | null;
  demanda_estabilidad: number | null;
  demanda_tecnica: number | null;
  rastrea_e1rm: 0 | 1 | null;
  es_competitivo: 0 | 1 | null;
  notas_tecnicas: string | null;
  contraindicaciones: string | null;
  cues: string | null;
  variantes: Array<{ id: number; nombre: string; tipo_variante: string | null }>;
  musculos: Array<{
    musculo_id: number;
    nombre: string;
    grupo: string;
    rol: string;
    orden: number;
    fraccion_volumen: number;
  }>;
}

// Grilla muscular de entrada: musculo_id (no slug) + rol + fraccion. El orden
// del array ES el `orden` de la tabla (1 = mayor contribución) — mismo
// contrato que MusculoRef en el seed, pero por id en vez de por slug.
export interface MusculoGridInput {
  musculo_id: number;
  rol: string;
  fraccion_volumen: number;
}

// POST /api/exercises — mismos campos obligatorios que un ejercicio curado a
// mano (ver SeedEjercicio): un ejercicio de la API es indistinguible en
// calidad de uno del catálogo curado. rastrea_e1rm/es_competitivo NO están acá
// a propósito: no son editables por API.
export interface NewExerciseInput {
  nombre: string;
  categoria: string;
  patron_id: number;
  ejercicio_padre_id?: number | null;
  tipo_variante?: string | null;
  transferencia?: number | null;
  proposito?: string | null;
  implemento: string;
  angulo_grados?: number | null;
  agarre?: string | null;
  postura?: string | null;
  unilateral?: boolean;
  mecanica: string;
  fuerza: string;
  sesgo_longitud: string;
  perfil_resistencia?: string;
  cadena?: string;
  carga_axial?: boolean;
  costo_fatiga: number;
  demanda_estabilidad: number;
  demanda_tecnica: number;
  notas_tecnicas?: string | null;
  contraindicaciones?: string | null;
  cues?: string | null;
  musculos: MusculoGridInput[];
}

// PATCH /api/exercises/:id — todos opcionales (merge parcial: `undefined` no
// toca el campo, `null` explícito lo limpia). `musculos` ausente no toca la
// grilla; presente reemplaza la grilla entera (nunca un merge fila a fila).
export type UpdateExerciseInput = Partial<Omit<NewExerciseInput, "musculos">> & {
  musculos?: MusculoGridInput[];
};

// Vista v_volumen_por_musculo — reemplaza a WeeklyVolume/volumen_por_categoria
// una vez que ejercicio_musculos está poblada (fase 2). Una fila por (semana de
// programa, músculo); distingue lo prescrito de lo hecho.
export interface VolumenMusculo {
  /** ISO (%Y-%W) de la semana. NULL si todavía no se entrenó ningún día. No es
   *  clave: dos semanas de programa distintas pueden caer en la misma ISO. */
  semana: string | null;
  semana_programa: number; // se reinicia por mesociclo
  mesociclo_id: number | null;
  week_id: number; // clave real: desambigua semana 1 del meso 1 vs. semana 1 sin meso
  semana_creada: string;
  musculo_id: number;
  musculo: string;
  grupo: string;
  series_programadas: number;
  series_completadas: number;
}

export interface Bodyweight {
  id: number;
  fecha: string;
  peso_kg: number;
  kcal_objetivo: number | null;
  proteina_g: number | null;
  hambre: number | null;
  digestion: string | null;
  notas: string | null;
}

// === Mesociclos: agrupador de semanas ===
export interface Mesociclo {
  id: number;
  nombre: string;
  objetivo: string | null;
  notas: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  orden: number;
  fecha_creada: string;
}

export interface MesocicloConSemanas extends Mesociclo {
  n_semanas: number;
}

export interface NewMesocicloInput {
  nombre: string;
  objetivo?: string | null;
  notas?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
}

export interface UpdateMesocicloInput {
  nombre?: string;
  objetivo?: string | null;
  notas?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  orden?: number;
}

// === Programa estructurado ===
export type Seccion = "main" | "accesorio" | "core";

export interface ProgramWeek {
  id: number;
  semana: number;
  nombre: string | null;
  bloque: string | null;
  notas: string | null;
  fecha_creada: string;
  activa: number;
  mesociclo_id: number | null;
}

export interface ProgramDayCard {
  id: number;
  week_id: number;
  dia: number;
  tipo: string | null;
  titulo: string | null;
  warmup: string | null;
  notas: string | null;
  notas_atleta: string | null;
  fecha: string | null;
  orden: number;
  nombre_ejercicios: string | null;
  n_ejercicios: number;
  n_series: number;
  n_series_hechas: number;
}

export interface ProgramWeekDetail extends ProgramWeek {
  days: ProgramDayCard[];
}

export interface ProgramExerciseCard {
  id: number;
  day_id: number;
  exercise_id: number | null;
  nombre_libre: string | null;
  seccion: Seccion;
  reps_text: string | null;
  carga_text: string | null;
  rpe_text: string | null;
  notas: string | null;
  orden: number;
  nombre: string;
  rastrea_e1rm: 0 | 1;
  n_series: number;
  n_series_hechas: number;
}

export interface ProgramDayDetail {
  id: number;
  week_id: number;
  dia: number;
  tipo: string | null;
  titulo: string | null;
  warmup: string | null;
  notas: string | null; // canal del coach (read-only, renderizado con CoachNotes)
  notas_atleta: string | null; // canal del atleta (textarea editable)
  fecha: string | null; // se autosetea al completar la primera serie; editable a mano
  hora_inicio: string | null;
  hora_fin: string | null;
  orden: number;
  semana: number;
  nombre_semana: string | null;
  exercises: ProgramExerciseCard[];
}

export interface ProgramSet {
  id: number;
  program_exercise_id: number;
  n_serie: number;
  target_reps: number | null;
  target_rpe: number | null;
  target_peso: number | null;
  real_peso: number | null;
  real_reps: number | null;
  real_rpe: number | null;
  hecha: number;
  notas: string | null;
  e1rm: number | null;
  tonelaje: number | null;
  rir: number | null;
}

export interface UpdateProgramSetTargetInput {
  target_reps?: number | null;
  target_rpe?: number | null;
  target_peso?: number | null;
}

export interface ProgramExerciseDetail {
  id: number;
  day_id: number;
  exercise_id: number | null;
  nombre_libre: string | null;
  seccion: Seccion;
  reps_text: string | null;
  carga_text: string | null;
  rpe_text: string | null;
  notas: string | null;
  orden: number;
  nombre: string;
  rastrea_e1rm: 0 | 1;
  dia: number;
  tipo: string | null;
  sets: ProgramSet[];
}

export interface UpdateProgramSetInput {
  real_peso?: number | null;
  real_reps?: number | null;
  real_rpe?: number | null;
  hecha?: boolean;
  notas?: string | null;
}

export interface BasicE1rm {
  exercise_id: number;
  nombre: string;
  mejor_e1rm: number | null;   // PR histórico. null = nunca tuvo una serie con peso+reps
  mejor_fecha: string | null;  // YYYY-MM-DD del día del PR
  actual_e1rm: number | null;  // mejor de las últimas sesiones de ESE básico
  ultima_fecha: string | null; // último día entrenado
}

export interface WeightTrendPoint {
  fecha: string;
  peso_kg: number;
  promedio_movil_7d: number;
}

export interface WeeklyVolume {
  semana: string;
  series_basicos: number;
  series_accesorios: number;
}

export interface Stats {
  basicos: BasicE1rm[];
  tendencia_peso: WeightTrendPoint[];
  volumen_semanal: WeeklyVolume[];
}

// Inputs de formularios
export interface NewBodyweightInput {
  fecha: string;
  peso_kg: number;
  kcal_objetivo: number | null;
  proteina_g: number | null;
  hambre: number | null;
  digestion: string | null;
  notas: string | null;
}

// === Trac: tracker diario de bienestar/recuperación (independiente de sessions) ===
export interface TracEntry {
  id: number;
  fecha: string;
  fatiga_pierna: number | null;
  fatiga_empuje: number | null;
  fatiga_traccion: number | null;
  descanso_alimentacion: number | null;
  recuperacion: number | null;
  motivacion: number | null;
  tecnica: number | null;
  creado_en: string;
  actualizado_en: string;
}

export interface UpsertTracInput {
  fecha: string;
  fatiga_pierna?: number | null;
  fatiga_empuje?: number | null;
  fatiga_traccion?: number | null;
  descanso_alimentacion?: number | null;
  recuperacion?: number | null;
  motivacion?: number | null;
  tecnica?: number | null;
}

// === Historial (reemplaza sessions/sets — lee directo de program_sets) ===
export interface HistoryDay {
  day_id: number;
  fecha: string;
  semana: number;
  dia: number;
  tipo: string | null;
  titulo: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  n_series: number;
}

export interface HistoryDayDetail extends HistoryDay {
  sets: Array<{
    exercise_id: number | null;
    exercise_nombre: string;
    n_serie: number;
    real_peso: number;
    real_reps: number;
    real_rpe: number | null;
    rir: number | null;
    e1rm: number | null;
  }>;
}
