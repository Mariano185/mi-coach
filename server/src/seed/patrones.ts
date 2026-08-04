// Catálogo de patrones de movimiento (ver docs/adr/0001).
//
// Para qué sirve: habilita dos consultas que con `categoria` en texto libre eran
// imposibles — sustituir un ejercicio por otro del mismo patrón ("dame otro
// empuje horizontal") y auditar el balance empuje/tracción de la semana.
//
// El criterio de corte es la ACCIÓN ARTICULAR dominante, no el músculo ni el
// implemento. Por eso "empuje horizontal" agrupa press de banca, fondos y peck
// deck aunque usen barra, peso corporal y máquina respectivamente: para decidir
// una sustitución lo que importa es que resuelven la misma tarea mecánica.
//
// Los patrones de aislamiento (extensión de rodilla, flexión de codo…) existen
// como patrón propio en vez de colgar de uno compuesto porque el coach los
// prescribe con otra lógica: no sustituyen a un básico, complementan su volumen.

export type SeedPatron = {
  slug: string; // clave estable usada por el seed de ejercicios (no se guarda en DB)
  nombre: string;
  plano: "sagital" | "frontal" | "transversal" | "multiplanar";
  descripcion: string;
};

export const PATRONES: SeedPatron[] = [
  // --- Compuestos: tren inferior ---
  {
    slug: "sentadilla",
    nombre: "Sentadilla (rodilla dominante)",
    plano: "sagital",
    descripcion:
      "Flexo-extensión simultánea de cadera y rodilla con torso relativamente vertical. Cuádriceps como motor principal y glúteo mayor como coagonista.",
  },
  {
    slug: "bisagra-cadera",
    nombre: "Bisagra de cadera",
    plano: "sagital",
    descripcion:
      "Flexo-extensión de cadera con rodilla poco flexionada. Isquiotibiales y glúteo mayor como motores; erector espinal resistiendo la flexión del tronco.",
  },
  {
    slug: "zancada",
    nombre: "Zancada / split (unilateral)",
    plano: "sagital",
    descripcion:
      "Patrón de rodilla dominante en base dividida. Añade demanda de estabilidad frontal (glúteo medio) que la sentadilla bilateral no impone.",
  },
  {
    slug: "extension-cadera",
    nombre: "Extensión de cadera (puente)",
    plano: "sagital",
    descripcion:
      "Extensión de cadera con rodilla flexionada y columna neutra, típicamente en decúbito. Glúteo mayor en posición acortada bajo tensión máxima.",
  },

  // --- Compuestos: tren superior ---
  {
    slug: "empuje-horizontal",
    nombre: "Empuje horizontal",
    plano: "transversal",
    descripcion:
      "Aducción horizontal de hombro + extensión de codo. Pectoral, deltoides anterior y tríceps contra una resistencia alejándose del torso.",
  },
  {
    slug: "empuje-vertical",
    nombre: "Empuje vertical",
    plano: "frontal",
    descripcion:
      "Flexión/abducción de hombro por encima de la cabeza + extensión de codo. Deltoides anterior como motor, tríceps y serrato como sinergistas.",
  },
  {
    slug: "traccion-horizontal",
    nombre: "Tracción horizontal (remo)",
    plano: "transversal",
    descripcion:
      "Extensión/abducción horizontal de hombro + flexión de codo, tirando hacia el torso. Retractores escapulares y dorsal.",
  },
  {
    slug: "traccion-vertical",
    nombre: "Tracción vertical (jalón)",
    plano: "frontal",
    descripcion:
      "Aducción de hombro desde por encima de la cabeza + flexión de codo. Dorsal ancho como motor principal.",
  },

  // --- Aislamientos ---
  {
    slug: "extension-rodilla",
    nombre: "Extensión de rodilla",
    plano: "sagital",
    descripcion:
      "Aislamiento de cuádriceps. Único patrón que carga el recto femoral sin acortarlo por flexión de cadera simultánea.",
  },
  {
    slug: "flexion-rodilla",
    nombre: "Flexión de rodilla",
    plano: "sagital",
    descripcion:
      "Aislamiento de isquiotibiales. La flexión de cadera (sentado vs tumbado) cambia la longitud de las porciones biarticulares.",
  },
  {
    slug: "abduccion-cadera",
    nombre: "Abducción de cadera",
    plano: "frontal",
    descripcion:
      "Aislamiento de glúteo medio y menor separando el fémur de la línea media. Único patrón que los carga como agonistas: en sentadillas, zancadas y bisagras solo estabilizan. La flexión de cadera (sentado vs de pie) desplaza el énfasis entre fibras posteriores y anteriores.",
  },
  {
    slug: "aduccion-cadera",
    nombre: "Aducción de cadera",
    plano: "frontal",
    descripcion:
      "Aislamiento del grupo aductor acercando el fémur a la línea media. Complemento del patrón de abducción: los aductores contribuyen a la extensión de cadera en sentadilla pero nunca son agonistas en el plano frontal.",
  },
  {
    slug: "abduccion-hombro",
    nombre: "Abducción de hombro",
    plano: "frontal",
    descripcion: "Aislamiento de deltoides lateral separando el brazo del cuerpo en el plano frontal.",
  },
  {
    slug: "aduccion-horizontal",
    nombre: "Aducción horizontal de hombro (apertura)",
    plano: "transversal",
    descripcion:
      "Aislamiento de pectoral con codo casi fijo. Permite cargar el pectoral en posición alargada sin participación del tríceps.",
  },
  {
    slug: "abduccion-horizontal",
    nombre: "Abducción horizontal de hombro (apertura inversa)",
    plano: "transversal",
    descripcion: "Aislamiento de deltoides posterior y retractores escapulares con codo casi fijo.",
  },
  {
    slug: "flexion-codo",
    nombre: "Flexión de codo",
    plano: "sagital",
    descripcion:
      "Aislamiento de flexores del codo. La posición del hombro determina la longitud de la cabeza larga del bíceps.",
  },
  {
    slug: "extension-codo",
    nombre: "Extensión de codo",
    plano: "sagital",
    descripcion:
      "Aislamiento de tríceps. La posición del hombro determina la longitud de la cabeza larga.",
  },
  {
    slug: "flexion-plantar",
    nombre: "Flexión plantar",
    plano: "sagital",
    descripcion:
      "Aislamiento de pantorrilla. La flexión de rodilla determina si domina el gastrocnemio (rodilla extendida) o el sóleo (rodilla flexionada).",
  },
  {
    slug: "flexion-extension-muneca",
    nombre: "Flexión / extensión de muñeca",
    plano: "sagital",
    descripcion:
      "Aislamiento del antebrazo. Los flexores ya trabajan como estabilizadores en todo tirón cargado; los extensores, en cambio, solo se cargan con extensión de muñeca directa.",
  },
  {
    slug: "elevacion-escapular",
    nombre: "Elevación escapular",
    plano: "frontal",
    descripcion: "Aislamiento de trapecio superior elevando la cintura escapular.",
  },

  // --- Core, definido por la fuerza que RESISTE, no por la que produce ---
  {
    slug: "anti-extension",
    nombre: "Anti-extensión (core)",
    plano: "sagital",
    descripcion:
      "El core resiste la extensión de la columna lumbar. Recto abdominal y transverso como estabilizadores bajo carga anterior.",
  },
  {
    slug: "anti-rotacion",
    nombre: "Anti-rotación (core)",
    plano: "transversal",
    descripcion: "El core resiste un momento rotacional externo. Oblicuos y transverso.",
  },
  {
    slug: "anti-flexion-lateral",
    nombre: "Anti-flexión lateral (core)",
    plano: "frontal",
    descripcion:
      "El core resiste la inclinación lateral del tronco ante una carga asimétrica. Cuadrado lumbar y oblicuos del lado contrario a la carga. Es el tercer plano del core: completa a anti-extensión (sagital) y anti-rotación (transversal).",
  },
  {
    slug: "flexion-tronco",
    nombre: "Flexión de tronco (core)",
    plano: "sagital",
    descripcion: "Flexión activa de la columna contra resistencia. Recto abdominal como motor.",
  },
];
