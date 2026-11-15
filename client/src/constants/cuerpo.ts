// Perímetros del Registro corporal y su Protocolo de medición (GLOSSARY.md). El mismo
// texto está en el manual del coach (server/src/docs/flujo-semana.md): si cambia uno,
// cambiar el otro.

export const PERIMETROS = [
  {
    key: "brazo_cm",
    label: "Brazo",
    protocolo: "Brazo derecho flexionado y contraído, en el punto más grueso del bíceps.",
  },
  {
    key: "pierna_cm",
    label: "Pierna",
    protocolo: "Muslo derecho, a mitad entre ingle y rodilla, de pie.",
  },
  {
    key: "abdomen_cm",
    label: "Abdomen",
    protocolo: "A la altura del ombligo, relajado, tras exhalar, en ayunas.",
  },
] as const;

export type PerimetroKey = (typeof PERIMETROS)[number]["key"];
