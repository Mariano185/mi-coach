// Tipos del dominio compartidos por el backend.

export interface Exercise {
  id: number;
  nombre: string;
  categoria: string;
  es_basico: 0 | 1;
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

// Vista v_volumen_por_musculo — reemplaza a WeeklyVolume/volumen_por_categoria
// una vez que ejercicio_musculos está poblada (fase 2).
export interface VolumenMusculo {
  semana: string;
  musculo_id: number;
  musculo: string;
  grupo: string;
  series: number;
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

export interface NewBodyweightInput {
  fecha: string;
  peso_kg: number;
  kcal_objetivo?: number | null;
  proteina_g?: number | null;
  hambre?: number | null;
  digestion?: string | null;
  notas?: string | null;
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

export interface ProgramDay {
  id: number;
  week_id: number;
  dia: number;
  tipo: string | null;
  titulo: string | null;
  warmup: string | null;
  notas: string | null;
  fecha: string | null; // se autosetea al completar la primera serie; editable a mano
  hora_inicio: string | null;
  hora_fin: string | null;
  orden: number;
}

export interface ProgramExercise {
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
  rir: number | null; // derivado en v_program_sets_e1rm: MAX(0, ROUND(10 - real_rpe))
}

// Vistas agregadas devueltas por la API:
export interface ProgramDayCard extends ProgramDay {
  nombre_ejercicios: string; // "Squat + Bench"
  n_ejercicios: number;
  n_series: number;
  n_series_hechas: number;
}

export interface ProgramWeekDetail extends ProgramWeek {
  days: ProgramDayCard[];
}

export interface ProgramExerciseCard extends ProgramExercise {
  nombre: string;     // exercise.nombre o nombre_libre
  es_basico: 0 | 1;
  n_series: number;
  n_series_hechas: number;
}

export interface ProgramDayDetail extends ProgramDay {
  nombre_semana: string | null;
  semana: number;
  exercises: ProgramExerciseCard[];
}

export interface ProgramExerciseDetail extends ProgramExercise {
  nombre: string;
  es_basico: 0 | 1;
  dia: number;
  tipo: string | null;
  sets: Array<ProgramSet & { e1rm: number | null; tonelaje: number | null }>;
}

// Inputs
export interface UpdateProgramSetInput {
  real_peso?: number | null;
  real_reps?: number | null;
  real_rpe?: number | null;
  hecha?: boolean;
  notas?: string | null;
}

export interface NewProgramWeekInput {
  semana: number;
  nombre?: string | null;
  bloque?: string | null;
  notas?: string | null;
  mesociclo_id?: number | null;
  days: Array<{
    dia: number;
    tipo?: string | null;
    titulo?: string | null;
    warmup?: string | null;
    exercises: Array<{
      exercise_id?: number | null;
      nombre_libre?: string | null;
      seccion?: Seccion;
      reps_text?: string | null;
      carga_text?: string | null;
      rpe_text?: string | null;
      notas?: string | null;
      sets: Array<{
        n_serie: number;
        target_reps?: number | null;
        target_rpe?: number | null;
        target_peso?: number | null;
      }>;
    }>;
  }>;
}

// PATCH /program/sets/:id/target — el coach corrige la prescripción de una serie ya creada.
export interface UpdateProgramSetTargetInput {
  target_reps?: number | null;
  target_rpe?: number | null;
  target_peso?: number | null;
}

// === Trac: tracker diario de bienestar/recuperación (independiente de sessions) ===
export interface TracEntry {
  id: number;
  fecha: string; // YYYY-MM-DD
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

// Respuesta de /api/stats
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
  semana: string; // ISO week label (YYYY-WW)
  series_basicos: number;
  series_accesorios: number;
}

export interface Stats {
  basicos: BasicE1rm[];
  tendencia_peso: WeightTrendPoint[];
  volumen_semanal: WeeklyVolume[];
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
