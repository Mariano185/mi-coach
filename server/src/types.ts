// Tipos del dominio compartidos por el backend.

export type SessionType = "A" | "B";

export interface Exercise {
  id: number;
  nombre: string;
  categoria: string;
  es_basico: 0 | 1;
}

export interface SessionSet {
  id: number;
  session_id: number;
  exercise_id: number;
  n_serie: number;
  peso_kg: number;
  reps: number;
  rpe: number | null;
  rir: number | null;
  notas: string | null;
}

export interface Session {
  id: number;
  fecha: string; // YYYY-MM-DD
  tipo: SessionType;
  energia: number | null;
  sueno_horas: number | null;
  motivacion: number | null;
  dolor_molestias: string | null;
  comentarios: string | null;
}

export interface SessionWithSets extends Session {
  sets: Array<SessionSet & { exercise_nombre: string; e1rm: number }>;
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

export interface Program {
  id: number;
  semana: number;
  fecha_creada: string;
  contenido_md: string;
  resumen: string | null;
}

// Payload del form de LogSession: una sesión + sus sets en un solo POST.
export interface NewSetInput {
  exercise_id: number;
  n_serie: number;
  peso_kg: number;
  reps: number;
  rpe?: number | null;
  rir?: number | null;
  notas?: string | null;
}

export interface NewSessionInput {
  fecha: string;
  tipo: SessionType;
  energia?: number | null;
  sueno_horas?: number | null;
  motivacion?: number | null;
  dolor_molestias?: string | null;
  comentarios?: string | null;
  sets: NewSetInput[];
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

export interface NewProgramInput {
  semana: number;
  contenido_md: string;
  resumen?: string | null;
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
}

export interface ProgramDay {
  id: number;
  week_id: number;
  dia: number;
  tipo: SessionType | null;
  titulo: string | null;
  warmup: string | null;
  notas: string | null;
  fecha_plan: string | null;
  fecha_real: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  session_id: number | null;
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
  real_peso: number | null;
  real_reps: number | null;
  real_rpe: number | null;
  hecha: number;
  notas: string | null;
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
  tipo: SessionType | null;
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
  days: Array<{
    dia: number;
    tipo?: SessionType | null;
    titulo?: string | null;
    warmup?: string | null;
    fecha_plan?: string | null;
    exercises: Array<{
      exercise_id?: number | null;
      nombre_libre?: string | null;
      seccion?: Seccion;
      reps_text?: string | null;
      carga_text?: string | null;
      rpe_text?: string | null;
      notas?: string | null;
      sets: Array<{ n_serie: number; target_reps?: number | null; target_rpe?: number | null }>;
    }>;
  }>;
}

// Respuesta de /api/stats
export interface BasicE1rm {
  exercise_id: number;
  nombre: string;
  mejor_e1rm: number;
  rm_inicial: number | null;
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
