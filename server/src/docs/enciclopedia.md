# Enciclopedia de Ejercicios — Cómo Leerla y Usarla

**Uso:** Referencia del vocabulario biomecánico que devuelve la API. Consultar cuando necesites
**elegir o sustituir un ejercicio** con criterio, no solo por nombre. Responde: qué significa cada
campo, qué valores toma, y cuánto peso darle a cada uno en una decisión.

**Alcance (frontera con los docs de coach):** este doc responde **"¿qué es este dato y cuánto
vale?"**. `Variantes_y_ejercicios.md` (material de coach, fuera de esta API) responde **"¿cuándo
uso esta variante concreta?"** — ese es el hogar canónico de las decisiones de selección; este
doc es el diccionario que las sostiene. `Filosofia_progresion.md` y `Periodizacion.md` no se
tocan acá.

---

## 0. Cómo pedir los datos (3 niveles de detalle + catálogo canónico)

| Necesidad | Endpoint | Qué trae |
|---|---|---|
| Armar la semana (default) | `GET /api/coach/analisis` → campo `ejercicios` | Forma **compacta**: `id`, `nombre`, `patron`, `implemento`, `mecanica`, `ejercicio_padre_id`, `tipo_variante`, `proposito`, `costo_fatiga`, `sesgo_longitud`, `rastrea_e1rm`. Alcanza para el 90% de las decisiones. |
| Comparar variantes / elegir con criterio fino | `GET /api/exercises/:id` | Un ejercicio **completo**: toda la biomecánica + `musculos[]` (grilla rankeada) + `variantes[]` (sus hijos). |
| Auditar el catálogo entero | `GET /api/exercises?detalle=full` | Todos los ejercicios en forma completa. Payload grande: usalo solo si realmente necesitás barrer todo. |
| Universo de músculos | `GET /api/musculos` (`?grupo=pierna` opcional) | Catálogo canónico completo, no solo lo entrenado. Cada fila trae `n_ejercicios`: si es `0`, ese músculo no tiene forma de entrenarse todavía con el catálogo actual — es un hueco a considerar, no un error. |
| Universo de patrones | `GET /api/patrones` | Lista completa con `plano` y `descripcion`. |
| "¿Qué entrena el glúteo medio?" (filtro inverso) | `GET /api/exercises?musculo_id=X&rol=agonista` | Ejercicios que trabajan ese músculo, ordenados por `orden` (los que más lo trabajan primero). `rol` es opcional (`agonista·sinergista·estabilizador`); sin filtro trae los tres. |

```bash
# Detalle de un ejercicio concreto (el id sale de analisis.ejercicios)
curl -s -H "X-Coach-Key: $COACH_API_KEY" \
  http://192.168.0.110:3001/api/exercises/3 | jq .

# Qué ejercicios trabajan el glúteo medio como agonista (id sale de /api/musculos)
curl -s -H "X-Coach-Key: $COACH_API_KEY" \
  "http://192.168.0.110:3001/api/exercises?musculo_id=36&rol=agonista" | jq .
```

**El tamaño exacto del catálogo (cuántos músculos, patrones y ejercicios hay) no está fijado
acá a propósito** — crece con el tiempo. Pedí `GET /api/musculos`, `GET /api/patrones` o
`GET /api/exercises` para el número actual en vez de asumir uno.

### Cobertura semanal: "¿qué músculo no entrené?"

`volumen_por_musculo` (en `/coach/analisis`) solo lista los músculos que **sí** aparecen en la
ventana — un músculo en cero simplemente no figura, no llega con `series: 0`. Para saber qué
falta, cruzá el universo completo contra lo entrenado:

1. `GET /api/musculos` → el catálogo completo.
2. `volumen_por_musculo` de `/coach/analisis` → los que sí se entrenaron esta ventana.
3. La diferencia entre ambos es lo que no se tocó. Filtrá antes por `n_ejercicios > 0` — un
   músculo sin ejercicios en el catálogo no es una omisión de programación, es un hueco de datos.

> Si falta un ejercicio, ahora **sí podés darlo de alta vos mismo** vía `POST /api/exercises`
> (ver §8) — con la misma biomecánica completa que un ejercicio curado a mano, no una versión
> pobre. La única excepción es el **catálogo curado del proyecto**: esos no se editan por API
> (ver §8), porque el código los pisa en cada arranque del servidor.

---

## 1. Modelo de datos (qué tabla responde qué)

```
patrones ──< exercises >── exercises        (self-FK: variante → padre)
                │
                └──< ejercicio_musculos >── musculos
```

- **`patrones`** — el patrón de movimiento por acción articular dominante, no por músculo ni
  por implemento. Habilita: *"dame otro empuje horizontal"* (sustitución) y el balance
  empuje/tracción de la semana. Ej: `Empuje horizontal`, `Bisagra de cadera`, `Tracción vertical
  (jalón)`, `Anti-rotación (core)`.
- **`musculos`** — catálogo canónico, subdividido **solo donde cambia una decisión**: el
  pectoral mayor tiene 3 fascículos y el tríceps 3 cabezas porque la selección de ejercicio los
  separa de verdad. Agrupados en `pecho · espalda · hombro · brazo · pierna · core`.
- **`ejercicio_musculos`** — el ranking. Una fila por músculo involucrado, con `rol`, `orden` y
  `fraccion_volumen`.
- **`exercises`** — catálogo curado + ejercicios agregados por el coach vía API.

---

## 2. Linaje: canónico vs variante (lo más importante)

- **`ejercicio_padre_id: null`** → es un ejercicio **canónico**. Es el default.
- **`ejercicio_padre_id: <id>`** → es una **variante** de ese padre, y `tipo_variante` dice en qué
  eje varía: `angulo · agarre · postura · tempo · pausa · rom · resistencia_acomodada ·
  implemento · unilateral`.
- **`proposito`** (texto) — para qué existe esa variante. **Es el campo que decide si la usás.**
- **`transferencia`** (0.7–1.0) — cuánto transfiere al movimiento padre. Heurística ordinal, no
  medición: sirve para rankear entre variantes del mismo padre, no como número absoluto.

**Regla operativa:** el canónico es el default. Una variante entra **solo** cuando su `proposito`
responde a una necesidad identificada en los datos (punto débil, meseta, restricción, bloque de
fuerza). Nunca por variedad. El detalle de cuándo entra cada una → `Variantes_y_ejercicios.md`
(material de coach, fuera de esta API).

**Cada variante lleva su propia grilla muscular, no la hereda del padre.** Por eso el press
inclinado a 30° y a 60° son filas distintas: a 30° el orden es pectoral clavicular primero; a 60°
el deltoides anterior pasa a agonista. Eso es exactamente lo que leés para elegir.

---

## 3. La grilla muscular (`musculos[]` en `GET /exercises/:id`)

Ordenada por `orden` (1 = mayor contribución). Tres campos por músculo:

| Campo | Valores | Cómo usarlo |
|---|---|---|
| `rol` | `agonista` · `sinergista` · `estabilizador` | Rol funcional en ese ejercicio. |
| `orden` | 1, 2, 3… | Ranking **ordinal**: el 1 aporta más que el 2. **No es un porcentaje** y la distancia entre puestos no es medible (ver §6). |
| `fraccion_volumen` | `1.0` · `0.5` · `0.25` · `0` | Cuántas series computa para ese músculo. |

**El fraccionamiento es la clave del conteo de volumen.** Una serie de remo con barra aporta
**1.0 al dorsal ancho** y **0.5 al bíceps**; los estabilizadores (erector espinal, etc.) computan
**0** — trabajan, pero no acumulan volumen de hipertrofia contable.

> ⚠️ **`volumen_por_musculo` no es comparable con el viejo `volumen_por_categoria`.** Antes una
> serie de remo era "1 serie de espalda". Ahora es 1.0 dorsal + 0.5 bíceps + 0.5 romboides…
> Los targets de **10-20 series/músculo/semana** de `Filosofia_progresion.md` se leen contra
> **este** número fraccionado, que es el que tiene respaldo en la literatura de dosis-respuesta
> (Schoenfeld 2017; Baz-Valle 2018).

---

## 4. Campos biomecánicos (diccionario)

| Campo | Valores | Qué significa y cuándo pesa |
|---|---|---|
| `patron` | ver §1 | Eje de **sustitución**: para reemplazar un ejercicio, buscá el mismo patrón. |
| `mecanica` | `compuesto` · `aislamiento` | Compuesto para carga y fuerza; aislamiento para volumen dirigido a un músculo rezagado. |
| `fuerza` | `empuje` · `traccion` · `estatico` | Balance empuje/tracción de la semana. |
| `implemento` | `barra · mancuerna · polea · maquina · smith · peso_corporal · banda · kettlebell` | No cambia adaptaciones primarias a esfuerzo igualado (ACSM 2026). Elegí por estabilidad y perfil, no por jerarquía. |
| `perfil_resistencia` | `ascendente` (más duro arriba) · `descendente` (más duro abajo) · `campana` (pico medio) · `constante` | Perfil de dificultad a lo largo del ROM. `constante` = poleas (tensión pareja); `descendente` = aperturas/curl inclinado (duro en estiramiento). Útil para complementar: si el punto débil es abajo, un perfil descendente lo ataca. |
| `cadena` | `abierta` · `cerrada` | Cerrada (pie/mano fijos) = más demanda de estabilidad y coordinación. |
| `carga_axial` | `0` · `1` | `1` = comprime la columna (squat, peso muerto, press militar de pie). **Gestión de fatiga sistémica:** si la semana ya acumula mucha carga axial o el atleta reporta fatiga lumbar, sustituí por algo con `carga_axial: 0` del mismo patrón. |
| `unilateral` | `0` · `1` | Un lado por vez: corrige asimetrías, menos carga axial, más tiempo por serie. |
| `angulo_grados` | número | Ángulo del banco/plataforma. **A 30° pico de pectoral clavicular; pasando 45° el trabajo migra al hombro** (Rodríguez-Ridao 2020). |
| `agarre`, `postura` | texto | Descriptores de la ejecución (ej. `prono`, `supino`, `neutro`). |
| `sesgo_longitud` | `alargado` · `medio` · `acortado` | Ver §5 — **leer el caveat antes de usarlo**. |

### Costos heurísticos (escala 1–5)

| Campo | Qué mide | Cómo usarlo |
|---|---|---|
| `costo_fatiga` | Cuánta fatiga sistémica genera (1 = trivial, 5 = deadlift pesado) | **La palanca más útil de las tres.** Ante fatiga acumulada: bajá `costo_fatiga` **sin cambiar de patrón** — así conservás el estímulo y descargás el sistema. |
| `demanda_tecnica` | Cuánta técnica exige (1–5) | Alta + fatiga/RPE inflado = mala combinación. Bajala en deload o reentrada. |
| `demanda_estabilidad` | Cuánta estabilización exige (1–4 observado) | Baja (Smith, máquina) = permite acercarse al fallo con seguridad y sin spotter. |

### Texto libre

- **`proposito`** — para qué existe la variante (ver §2).
- **`contraindicaciones`** — cuándo evitarlo o progresarlo despacio. **Chequealo siempre que el
  atleta reporte una molestia** (ej. hay ejercicios marcados por estrés femoropatelar o de cápsula
  anterior de hombro). Cruzá con `trac_reciente` y las notas de día.
- **`notas_tecnicas`** y **`cues`** — ejecución y señales verbales. Material listo para reusar en
  el campo `notas` de un ejercicio prescrito.

### Tracking

- **`rastrea_e1rm`** (`0`/`1`) — reemplaza al viejo `es_basico`. Solo los **3 movimientos de
  competencia** lo tienen en 1 (Squat, Bench, Deadlift). Lo fija el sistema, no el POST.
  **Las variantes quedan en 0: su progresión NO contamina el e1RM del básico.** Por eso el RPE y
  la progresión de una variante se miden *dentro* de la variante.
- **`es_competitivo`** (`0`/`1`) — el movimiento tal como se ejecuta en competencia.

---

## 5. `sesgo_longitud` — el caveat que hay que respetar

Marca a qué longitud muscular el ejercicio impone más tensión: `alargado` (estirado),
`medio`, `acortado`.

**La evidencia es prometedora pero MIXTA.** Wolf et al. (2025) revisa el crecimiento longitudinal
en rango alargado; Varovic et al. (2025) aporta contra-evidencia sobre hipertrofia regional. Maeo
et al. (2024) sí sostiene especificidad por ejercicio en isquios.

**Cómo usarlo:** como **criterio de desempate**, nunca como ley. Si dos ejercicios del mismo
patrón empatan en todo lo demás, preferí el `alargado` — es consistente con el principio de
estiramiento de `Principios_evidencia.md` (pto 5, material de coach). Pero **no reorganices un
bloque entero** en función de este campo, y no se lo presentes al atleta como un hecho establecido.

> Lo mismo aplica, en menor grado, a `costo_fatiga` / `demanda_tecnica` / `demanda_estabilidad`:
> son **heurísticas declaradas por quien curó el catálogo, no mediciones**. Si los datos reales
> del atleta contradicen la etiqueta, **mandan los datos del atleta**.

---

## 6. Qué NO vas a encontrar (y por qué no lo pidas)

| No está | Motivo |
|---|---|
| `% de activación EMG` | La amplitud de EMG de superficie **no permite inferir hipertrofia ni fuerza** entre ejercicios (Vigotsky et al. 2018). Guardarlo sería falsa precisión. Por eso el ranking es **ordinal** (`orden`) + rol funcional, no porcentual. |
| Nivel principiante/avanzado | Arbitrario; es una app de un solo atleta cuyo nivel se conoce. |
| MET / calorías | Irrelevante para powerbuilding. |
| Instrucciones largas / imágenes | Inflarían el payload. Lo esencial está en `notas_tecnicas` y `cues`. |

---

## 7. Cuándo ir a PubMed

El catálogo cubre **estructura** (qué trabaja cada ejercicio, qué lo distingue). **No cubre
dosis-respuesta ni decisiones de programación.** Si la duda es de programación (cuántas series,
qué RIR, cuándo deloadear), la respuesta está en los docs de coach (`Filosofia_progresion.md` /
`Periodizacion.md` / `Principios_evidencia.md`), no acá.

Buscá evidencia (PubMed, jerarquía meta-análisis > RCT > estudio suelto; ver `CLAUDE.md` del
coach) cuando:

- Necesitás un ejercicio o variante **que no está en el catálogo** y hay que justificar su alta.
- Vas a apoyarte fuerte en `sesgo_longitud` o `perfil_resistencia` para una decisión importante
  — son los campos con evidencia más blanda.
- El atleta reporta una **molestia articular** y hay que elegir sustituto con criterio clínico
  (`contraindicaciones` orienta, no diagnostica).
- Un hallazgo nuevo **contradice** lo que dice este doc → avisá al atleta para actualizarlo.

**No busques** para confirmar lo que el catálogo ya afirma como estructura (qué músculos entran en
un remo). Eso es anatomía establecida.

---

## 8. Dar de alta un ejercicio (`POST /api/exercises`)

**El estándar es el mismo que el del catálogo curado.** No hay una versión "rápida" o "pobre":
el endpoint exige los mismos campos obligatorios que un ejercicio investigado a mano
(`nombre`, `categoria`, `patron_id`, `implemento`, `mecanica`, `fuerza`, `sesgo_longitud`, las
3 escalas de costo, y la grilla muscular completa). Si no podés completar todos con criterio,
**es señal de que hace falta más research antes de dar el alta**, no de saltear el campo.

### Qué investigar antes de mandar el POST

1. **Patrón** (`patron_id`) — pedí `GET /api/patrones` y elegí por la acción articular
   dominante, no por el músculo ni el implemento (ver §1). Si el ejercicio no encaja en ninguno,
   avisá al atleta antes de forzar el más parecido.
2. **Músculos y su ranking** (`musculos[]`) — pedí `GET /api/musculos` para los `musculo_id`.
   Para cada uno, decidí:
   - **`rol`**: `agonista` (motor directo, cerca del fallo), `sinergista` (participa pero no
     limita la serie), o `estabilizador` (sostiene, no genera el movimiento).
   - **`orden`**: es el **índice del array**, no un campo propio — el primer músculo del array es
     el de mayor contribución. Es ordinal a propósito (ver §6, por qué no hay porcentajes).
   - **`fraccion_volumen`**: `1.0` agonista principal, `0.5` participación significativa,
     `0.25` menor, `0` **siempre** para estabilizadores (la API lo rechaza si no).
   - **Regla dura**: tiene que haber **al menos un agonista**, y **ningún músculo repetido**.
3. **Biomecánica** (`mecanica`, `fuerza`, `sesgo_longitud`, `implemento`, y opcionalmente
   `perfil_resistencia`/`cadena`/`angulo_grados`/`carga_axial`) — mismos vocabularios de §4.
   Si dudás sobre `sesgo_longitud` con evidencia real detrás, es de los campos donde vale la pena
   ir a PubMed antes (ver §7 y §5).
4. **Costos heurísticos** (`costo_fatiga`, `demanda_estabilidad`, `demanda_tecnica`, 1–5) —
   son juicio informado comparando contra ejercicios similares ya en el catálogo, no medición.
   Sé honesto con vos mismo: es una heurística declarada (§5), no la inventes de la nada.
5. **Si es variante de un ejercicio existente** (`ejercicio_padre_id`) — mandá también
   `tipo_variante`, `transferencia` (0–1, cuánto transfiere al padre) y `proposito` (para qué
   se elige esta variante y no el padre). Los tres son obligatorios juntos: sin uno, la API
   rechaza el alta. `rastrea_e1rm` y `es_competitivo` **no los mandes**: la API los fuerza a 0
   y devuelve 400 si vienen en el body — solo los 3 movimientos de competencia los tienen en 1,
   y eso lo fija el sistema, no vos.

### Ejemplo

```bash
curl -s -X POST -H "X-Coach-Key: $COACH_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "nombre": "Hip Thrust con banda",
    "categoria": "Piernas",
    "patron_id": 4,
    "implemento": "banda",
    "mecanica": "compuesto",
    "fuerza": "empuje",
    "sesgo_longitud": "acortado",
    "costo_fatiga": 2,
    "demanda_estabilidad": 2,
    "demanda_tecnica": 2,
    "musculos": [
      { "musculo_id": 35, "rol": "agonista", "fraccion_volumen": 1.0 },
      { "musculo_id": 31, "rol": "sinergista", "fraccion_volumen": 0.5 }
    ]
  }' \
  http://192.168.0.110:3001/api/exercises
```

Respuesta `201` con el detalle completo del ejercicio creado (mismo formato que
`GET /exercises/:id`), listo para usar su `id` en la semana.

### Editar (`PATCH /api/exercises/:id`)

Merge parcial: mandá solo los campos que cambian. `musculos` ausente no toca la grilla; si lo
mandás, **reemplaza la grilla entera** (no es un merge fila a fila) — si vas a sacar un músculo,
mandá el array completo sin él.

### El catálogo curado no se edita por API

`POST` y `PATCH` devuelven **409** si el nombre coincide con uno de los ejercicios curados a mano
en el código del proyecto (los básicos y sus variantes originales). No es una limitación
arbitraria: el servidor **re-siembra ese catálogo en cada arranque**, así que un cambio hecho por
API se perdería solo en el próximo restart sin que nadie se entere. Si necesitás corregir uno de
esos, pedíselo al atleta para que lo actualice en el código.

### No hay DELETE

Los ejercicios no se pueden borrar por API todavía. Si uno quedó mal cargado, corregilo con PATCH
o pedíselo al atleta.

---

## Fuentes (PubMed / DOI)

- **Schoenfeld, Ogborn & Krieger (2017)** — Dosis-respuesta volumen semanal ↔ hipertrofia. Respaldo
  de contar volumen **por músculo**. [DOI](https://doi.org/10.1080/02640414.2016.1210197)
- **Baz-Valle et al. (2018)** — Número total de series como método de cuantificación de volumen.
  Base del conteo fraccionado. [DOI](https://doi.org/10.1519/JSC.0000000000002776)
- **Vigotsky et al. (2018)** — Interpretación de amplitudes en EMG de superficie. **Por qué NO
  guardamos EMG.** [DOI](https://doi.org/10.3389/fphys.2017.00985)
- **Maeo et al. (2024)** — La hipertrofia de isquios es específica del ejercicio. Respaldo de que
  cada variante lleve su propia grilla. [DOI](https://doi.org/10.1249/MSS.0000000000003490)
- **Wolf et al. (2025)** — ¿Entrenar en longitud alargada causa mayor crecimiento longitudinal?
  [DOI](https://doi.org/10.1016/j.smhs.2025.03.001)
- **Varovic et al. (2025)** — ¿Influye la longitud muscular en la hipertrofia regional?
  **Contra-evidencia; obliga a matizar `sesgo_longitud`.** [DOI](https://doi.org/10.1055/a-2615-4935)
- **Appleby et al. (2019)** — Especificidad y transferencia de fuerza en tren inferior. Base del
  campo `transferencia`. [DOI](https://doi.org/10.1519/JSC.0000000000002923)
- **Rodríguez-Ridao et al. (2020)** — 5 inclinaciones de banco, EMG: 30° óptimo para pecho
  superior. [PMID 33049982](https://pubmed.ncbi.nlm.nih.gov/33049982/)
- **ACSM Position Stand (2026)** — El equipo no cambia adaptaciones primarias a esfuerzo igualado.
  [PMID 41843416](https://pubmed.ncbi.nlm.nih.gov/41843416/)
