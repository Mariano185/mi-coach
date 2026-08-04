// Catálogo canónico de músculos — base de la enciclopedia (ver docs/adr/0001).
//
// Criterio de granularidad: se subdivide un músculo en regiones SOLO cuando la
// distinción cambia una decisión de programación. El pectoral mayor se parte en
// fascículos (el ángulo del press desplaza el énfasis entre ellos) y el tríceps
// por cabezas (la cabeza larga cruza el hombro, así que su longitud depende de la
// posición del brazo). En cambio el vasto intermedio queda como una fila más del
// cuádriceps sin pretender que se pueda aislar.
//
// `biarticular` marca los músculos cuya longitud depende de DOS articulaciones.
// Es la bandera que hace razonable el campo exercises.sesgo_longitud: un isquio
// se estira o se acorta según lo que hagan cadera Y rodilla a la vez, y por eso
// el curl femoral sentado y el tumbado no son el mismo estímulo.

export type SeedMusculo = {
  slug: string; // clave estable usada por el seed de ejercicios (no se guarda en DB)
  nombre: string;
  nombre_en: string;
  grupo: "pecho" | "espalda" | "hombro" | "brazo" | "pierna" | "core";
  region: string | null;
  biarticular: 0 | 1;
};

export const MUSCULOS: SeedMusculo[] = [
  // ---------- PECHO ----------
  // Los tres fascículos del pectoral mayor tienen orientación de fibras distinta,
  // que es exactamente lo que hace que el ángulo del banco cambie el énfasis.
  { slug: "pec-clavicular", nombre: "Pectoral mayor (fascículo clavicular)", nombre_en: "Pectoralis major (clavicular head)", grupo: "pecho", region: "superior", biarticular: 0 },
  { slug: "pec-esternal", nombre: "Pectoral mayor (fascículo esternocostal)", nombre_en: "Pectoralis major (sternocostal head)", grupo: "pecho", region: "medio", biarticular: 0 },
  { slug: "pec-abdominal", nombre: "Pectoral mayor (fascículo abdominal)", nombre_en: "Pectoralis major (abdominal head)", grupo: "pecho", region: "inferior", biarticular: 0 },
  { slug: "pec-menor", nombre: "Pectoral menor", nombre_en: "Pectoralis minor", grupo: "pecho", region: null, biarticular: 0 },
  { slug: "serrato", nombre: "Serrato anterior", nombre_en: "Serratus anterior", grupo: "pecho", region: null, biarticular: 0 },

  // ---------- ESPALDA ----------
  { slug: "dorsal-ancho", nombre: "Dorsal ancho", nombre_en: "Latissimus dorsi", grupo: "espalda", region: null, biarticular: 0 },
  { slug: "redondo-mayor", nombre: "Redondo mayor", nombre_en: "Teres major", grupo: "espalda", region: null, biarticular: 0 },
  { slug: "trapecio-superior", nombre: "Trapecio superior", nombre_en: "Upper trapezius", grupo: "espalda", region: "superior", biarticular: 0 },
  { slug: "trapecio-medio", nombre: "Trapecio medio", nombre_en: "Middle trapezius", grupo: "espalda", region: "medio", biarticular: 0 },
  { slug: "trapecio-inferior", nombre: "Trapecio inferior", nombre_en: "Lower trapezius", grupo: "espalda", region: "inferior", biarticular: 0 },
  { slug: "romboides", nombre: "Romboides", nombre_en: "Rhomboids", grupo: "espalda", region: null, biarticular: 0 },
  { slug: "erector-espinal", nombre: "Erector espinal", nombre_en: "Erector spinae", grupo: "espalda", region: null, biarticular: 0 },
  { slug: "infraespinoso", nombre: "Infraespinoso y redondo menor", nombre_en: "Infraspinatus and teres minor", grupo: "espalda", region: "manguito rotador", biarticular: 0 },
  { slug: "subescapular", nombre: "Subescapular", nombre_en: "Subscapularis", grupo: "espalda", region: "manguito rotador", biarticular: 0 },
  { slug: "supraespinoso", nombre: "Supraespinoso", nombre_en: "Supraspinatus", grupo: "espalda", region: "manguito rotador", biarticular: 0 },

  // ---------- HOMBRO ----------
  { slug: "deltoides-anterior", nombre: "Deltoides anterior", nombre_en: "Anterior deltoid", grupo: "hombro", region: "anterior", biarticular: 0 },
  { slug: "deltoides-lateral", nombre: "Deltoides lateral", nombre_en: "Lateral deltoid", grupo: "hombro", region: "lateral", biarticular: 0 },
  { slug: "deltoides-posterior", nombre: "Deltoides posterior", nombre_en: "Posterior deltoid", grupo: "hombro", region: "posterior", biarticular: 0 },

  // ---------- BRAZO ----------
  // La cabeza larga del bíceps y la del tríceps cruzan el hombro: por eso el curl
  // inclinado (hombro en extensión) y la extensión sobre la cabeza (hombro en
  // flexión) trabajan esas cabezas en posición alargada.
  { slug: "biceps-larga", nombre: "Bíceps braquial (cabeza larga)", nombre_en: "Biceps brachii (long head)", grupo: "brazo", region: "cabeza larga", biarticular: 1 },
  { slug: "biceps-corta", nombre: "Bíceps braquial (cabeza corta)", nombre_en: "Biceps brachii (short head)", grupo: "brazo", region: "cabeza corta", biarticular: 1 },
  { slug: "braquial", nombre: "Braquial anterior", nombre_en: "Brachialis", grupo: "brazo", region: null, biarticular: 0 },
  { slug: "braquiorradial", nombre: "Braquiorradial", nombre_en: "Brachioradialis", grupo: "brazo", region: null, biarticular: 0 },
  { slug: "triceps-larga", nombre: "Tríceps braquial (cabeza larga)", nombre_en: "Triceps brachii (long head)", grupo: "brazo", region: "cabeza larga", biarticular: 1 },
  { slug: "triceps-lateral", nombre: "Tríceps braquial (cabeza lateral)", nombre_en: "Triceps brachii (lateral head)", grupo: "brazo", region: "cabeza lateral", biarticular: 0 },
  { slug: "triceps-medial", nombre: "Tríceps braquial (cabeza medial)", nombre_en: "Triceps brachii (medial head)", grupo: "brazo", region: "cabeza medial", biarticular: 0 },
  { slug: "antebrazo-flexores", nombre: "Flexores del antebrazo (agarre)", nombre_en: "Forearm flexors (grip)", grupo: "brazo", region: null, biarticular: 0 },
  // Antagonistas de los flexores. Nunca participan del agarre, así que no aparecen
  // como estabilizadores en tirones: solo se cargan con extensión de muñeca directa.
  { slug: "antebrazo-extensores", nombre: "Extensores del antebrazo", nombre_en: "Forearm extensors", grupo: "brazo", region: null, biarticular: 0 },

  // ---------- PIERNA ----------
  // El recto femoral cruza cadera y rodilla: en sentadilla está en desventaja
  // (cadera flexionada lo acorta) y por eso la extensión de rodilla sentado no es
  // redundante con la sentadilla.
  { slug: "recto-femoral", nombre: "Recto femoral", nombre_en: "Rectus femoris", grupo: "pierna", region: "cuádriceps", biarticular: 1 },
  { slug: "vasto-lateral", nombre: "Vasto lateral", nombre_en: "Vastus lateralis", grupo: "pierna", region: "cuádriceps", biarticular: 0 },
  { slug: "vasto-medial", nombre: "Vasto medial", nombre_en: "Vastus medialis", grupo: "pierna", region: "cuádriceps", biarticular: 0 },
  { slug: "vasto-intermedio", nombre: "Vasto intermedio", nombre_en: "Vastus intermedius", grupo: "pierna", region: "cuádriceps", biarticular: 0 },

  // Los isquios mediales (semi-) y el bíceps femoral responden distinto según la
  // flexión de cadera — base de la diferencia entre curl sentado y tumbado.
  { slug: "biceps-femoral-larga", nombre: "Bíceps femoral (cabeza larga)", nombre_en: "Biceps femoris (long head)", grupo: "pierna", region: "isquiotibiales", biarticular: 1 },
  { slug: "biceps-femoral-corta", nombre: "Bíceps femoral (cabeza corta)", nombre_en: "Biceps femoris (short head)", grupo: "pierna", region: "isquiotibiales", biarticular: 0 },
  { slug: "semitendinoso", nombre: "Semitendinoso", nombre_en: "Semitendinosus", grupo: "pierna", region: "isquiotibiales", biarticular: 1 },
  { slug: "semimembranoso", nombre: "Semimembranoso", nombre_en: "Semimembranosus", grupo: "pierna", region: "isquiotibiales", biarticular: 1 },

  { slug: "gluteo-mayor", nombre: "Glúteo mayor", nombre_en: "Gluteus maximus", grupo: "pierna", region: null, biarticular: 0 },
  { slug: "gluteo-medio", nombre: "Glúteo medio", nombre_en: "Gluteus medius", grupo: "pierna", region: null, biarticular: 0 },
  { slug: "gluteo-menor", nombre: "Glúteo menor", nombre_en: "Gluteus minimus", grupo: "pierna", region: null, biarticular: 0 },
  { slug: "aductores", nombre: "Aductores", nombre_en: "Hip adductors", grupo: "pierna", region: null, biarticular: 0 },
  { slug: "tensor-fascia-lata", nombre: "Tensor de la fascia lata", nombre_en: "Tensor fasciae latae", grupo: "pierna", region: null, biarticular: 0 },

  // El gastrocnemio cruza rodilla y tobillo: con la rodilla flexionada (elevación
  // sentado) queda acortado y el sóleo pasa a llevar la carga.
  { slug: "gastrocnemio", nombre: "Gastrocnemio", nombre_en: "Gastrocnemius", grupo: "pierna", region: "pantorrilla", biarticular: 1 },
  { slug: "soleo", nombre: "Sóleo", nombre_en: "Soleus", grupo: "pierna", region: "pantorrilla", biarticular: 0 },
  { slug: "tibial-anterior", nombre: "Tibial anterior", nombre_en: "Tibialis anterior", grupo: "pierna", region: null, biarticular: 0 },

  // ---------- CORE ----------
  { slug: "recto-abdominal", nombre: "Recto abdominal", nombre_en: "Rectus abdominis", grupo: "core", region: null, biarticular: 0 },
  { slug: "oblicuo-externo", nombre: "Oblicuo externo", nombre_en: "External oblique", grupo: "core", region: null, biarticular: 0 },
  { slug: "oblicuo-interno", nombre: "Oblicuo interno", nombre_en: "Internal oblique", grupo: "core", region: null, biarticular: 0 },
  { slug: "transverso", nombre: "Transverso del abdomen", nombre_en: "Transversus abdominis", grupo: "core", region: null, biarticular: 0 },
  { slug: "cuadrado-lumbar", nombre: "Cuadrado lumbar", nombre_en: "Quadratus lumborum", grupo: "core", region: null, biarticular: 0 },
  { slug: "psoas", nombre: "Psoas ilíaco", nombre_en: "Iliopsoas", grupo: "core", region: null, biarticular: 0 },
];
