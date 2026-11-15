// Opciones de los selects de Trac (tracker diario de bienestar/recuperación).
// Cada dimensión se guarda como entero 1-5 (1=peor, 5=mejor); estas listas
// mapean el entero a la etiqueta visible.

export interface TracOption {
  value: number;
  label: string;
}

// Compartida por las 3 dimensiones del grupo "Dolor muscular".
export const FATIGA_OPTIONS: TracOption[] = [
  { value: 1, label: "Fatiga severa, muy incómoda" },
  { value: 2, label: "Fatiga significativa, incómoda" },
  { value: 3, label: "Fatiga moderada, perceptible pero manejable" },
  { value: 4, label: "Leve fatiga, apenas perceptible" },
  { value: 5, label: "Sin fatiga ni rigidez" },
];

// Cómo siente el atleta que durmió (percepción, no horas). Hasta noviembre de 2026 este
// mismo valor era "descanso/alimentación"; la comida ahora va en la Ingesta diaria.
export const SUENO_OPTIONS: TracOption[] = [
  { value: 1, label: "Dormí muy mal" },
  { value: 2, label: "Dormí mal" },
  { value: 3, label: "Dormí aceptable" },
  { value: 4, label: "Dormí bien" },
  { value: 5, label: "Dormí muy bien" },
];

export const RECUPERACION_OPTIONS: TracOption[] = [
  { value: 1, label: "Completamente exhausto" },
  { value: 2, label: "Muy cansado" },
  { value: 3, label: "Algo cansado" },
  { value: 4, label: "Moderadamente fresco" },
  { value: 5, label: "Muy fresco" },
];

// Nombrada de forma distintiva: no confundir con sessions.motivacion (escala 1-10, distinta tabla).
export const MOTIVACION_TRAC_OPTIONS: TracOption[] = [
  { value: 1, label: "Sin motivación" },
  { value: 2, label: "Ligeramente motivado" },
  { value: 3, label: "Algo motivado" },
  { value: 4, label: "Moderadamente motivado" },
  { value: 5, label: "Muy motivado" },
];

export const TECNICA_OPTIONS: TracOption[] = [
  { value: 1, label: "Muy incómodo técnicamente" },
  { value: 2, label: "Un poco incómodo técnicamente" },
  { value: 3, label: "Algo cómodo técnicamente" },
  { value: 4, label: "Mayormente cómodo técnicamente" },
  { value: 5, label: "Muy cómodo técnicamente" },
];
