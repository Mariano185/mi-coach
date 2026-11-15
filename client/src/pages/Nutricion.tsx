import { useEffect, useState } from "react";
import useSWR from "swr";
import { api } from "../api";
import type { IngestaDiaria, NutricionDia, ObjetivoNutricional, UpsertIngestaDiariaInput } from "../types";
import { swrKeys } from "../swr";
import { useToast } from "../components/Toast";
import { CoachNotes } from "../components/CoachNotes";
import { hoyLocal } from "../fecha";

const VALORES = [
  { key: "kcal", label: "Kcal", unidad: "kcal" },
  { key: "proteina_g", label: "Proteína", unidad: "g" },
  { key: "carbohidratos_g", label: "Carbohidratos", unidad: "g" },
  { key: "grasas_g", label: "Grasas", unidad: "g" },
] as const;

// El objetivo nombra kcal/proteina_g/... igual que la ingesta: una barra por clave.
function BarraNutricional({
  label,
  unidad,
  cargado,
  objetivo,
}: {
  label: string;
  unidad: string;
  cargado: number | null;
  objetivo: number;
}) {
  // Arranca en 0 y en el frame siguiente pasa al valor real: la transición de width
  // anima de 0 hasta lo cargado (con prefers-reduced-motion queda directo en el valor).
  const [lleno, setLleno] = useState(0);
  const proporcion = cargado === null || objetivo <= 0 ? 0 : cargado / objetivo;
  useEffect(() => {
    const raf = requestAnimationFrame(() => setLleno(Math.min(proporcion, 1)));
    return () => cancelAnimationFrame(raf);
  }, [proporcion]);

  const excedido = cargado !== null && cargado > objetivo;
  return (
    <div className={`barra-nutri${excedido ? " excedida" : ""}`}>
      <div className="barra-nutri-cab">
        <span className="barra-nutri-label">{label}</span>
        <span className="barra-nutri-num">
          <strong>{cargado ?? "—"}</strong> / {objetivo} <span className="u">{unidad}</span>
          {excedido && <span className="barra-nutri-exceso">+{cargado - objetivo}</span>}
        </span>
      </div>
      <div
        className="barra-nutri-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={objetivo}
        aria-valuenow={cargado ?? 0}
      >
        <div className="barra-nutri-fill" style={{ width: `${lleno * 100}%` }} />
      </div>
    </div>
  );
}

function ObjetivoPanel({ objetivo, ingesta }: { objetivo: ObjetivoNutricional; ingesta: IngestaDiaria | null }) {
  return (
    <div className="objetivo-nutri">
      <p className="sec-label">Objetivo del coach</p>
      {objetivo.nota && <CoachNotes text={objetivo.nota} />}
      <div className="barras-nutri">
        {VALORES.map(({ key, label, unidad }) => (
          <BarraNutricional
            key={key}
            label={label}
            unidad={unidad}
            cargado={ingesta ? ingesta[key] : null}
            objetivo={objetivo[key]}
          />
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Rige desde el {objetivo.pautado_en}</p>
    </div>
  );
}

type ValorKey = (typeof VALORES)[number]["key"];
type Form = Record<ValorKey, string>;

const FORM_VACIO: Form = { kcal: "", proteina_g: "", carbohidratos_g: "", grasas_g: "" };

function aForm(ingesta: IngestaDiaria | null | undefined): Form {
  if (!ingesta) return FORM_VACIO;
  return {
    kcal: String(ingesta.kcal),
    proteina_g: String(ingesta.proteina_g),
    carbohidratos_g: String(ingesta.carbohidratos_g),
    grasas_g: String(ingesta.grasas_g),
  };
}

export function Nutricion() {
  const [fecha, setFecha] = useState(hoyLocal);
  // keepPreviousData: false (pisa el global): al cambiar de fecha, mostrar la ingesta de la
  // fecha anterior —y precargarla en el formulario— haría fácil guardarla en la fecha nueva.
  const { data: dia, error, isLoading, mutate } = useSWR<NutricionDia>(swrKeys.nutricionDia(fecha), {
    keepPreviousData: false,
  });
  const ingesta = dia?.ingesta;
  const objetivo = dia?.objetivo ?? null;
  const pasos = dia?.pasos ?? null;

  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const { show, node } = useToast();

  // Precargar con lo ya guardado en la fecha; sin ingesta, el formulario queda vacío
  // (nunca en 0: un día sin ingesta no es "0 kcal").
  useEffect(() => {
    setForm(aForm(ingesta));
    setComentario(ingesta?.comentario ?? "");
  }, [ingesta, fecha]);

  async function save() {
    const valores = {} as Record<ValorKey, number>;
    for (const { key, label } of VALORES) {
      const raw = form[key].trim();
      const n = Number(raw);
      if (raw === "" || !Number.isInteger(n) || n < 0) {
        show(`${label}: cargá un entero ≥ 0`, "err");
        return;
      }
      valores[key] = n;
    }
    const input: UpsertIngestaDiariaInput = { fecha, ...valores, comentario: comentario.trim() || null };

    setSaving(true);
    try {
      const guardada = await api.upsertIngesta(input);
      await mutate({ fecha, objetivo, pasos, ingesta: guardada }, { revalidate: false });
      show(ingesta ? "Ingesta corregida ✓" : "Ingesta guardada ✓");
    } catch (e) {
      show((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  const esHoy = fecha === hoyLocal();

  return (
    <div>
      <div className="panel">
        <h2>Nutrición</h2>
        <div className="field">
          <label htmlFor="nutri-fecha">Fecha</label>
          <input
            id="nutri-fecha"
            type="date"
            value={fecha}
            max={hoyLocal()}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
          />
        </div>

        {/* key={fecha}: al cambiar de fecha las barras vuelven a animarse desde 0. */}
        {objetivo && <ObjetivoPanel key={fecha} objetivo={objetivo} ingesta={ingesta ?? null} />}

        <p className="sec-label">Ingesta {esHoy ? "de hoy" : `del ${fecha}`}</p>
        {error && <p style={{ color: "var(--danger)" }}>{(error as Error).message}</p>}
        {ingesta && objetivo ? (
          // Con objetivo, los números ya están junto a cada barra: solo queda el comentario.
          ingesta.comentario ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>“{ingesta.comentario}”</p>
          ) : (
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Cargada.</p>
          )
        ) : ingesta ? (
          <>
            <div className="mini-stats ingesta-stats">
              {VALORES.map(({ key, label, unidad }) => (
                <div className="ms" key={key}>
                  <div className="k">{label}</div>
                  <div className="v">
                    {ingesta[key]} <span className="u">{unidad}</span>
                  </div>
                </div>
              ))}
            </div>
            {ingesta.comentario && (
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>“{ingesta.comentario}”</p>
            )}
          </>
        ) : (
          <p className="muted">{isLoading ? "Cargando…" : "Sin ingesta para esta fecha."}</p>
        )}

        {/* Solo lectura: los manda el atajo de iOS a la madrugada siguiente. */}
        <p className="sec-label">Pasos diarios</p>
        {pasos ? (
          <div className="mini-stats">
            <div className="ms">
              <div className="k">Pasos</div>
              <div className="v">{pasos.pasos.toLocaleString("es-AR")}</div>
            </div>
          </div>
        ) : (
          !isLoading && (
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              {esHoy
                ? "Los Pasos diarios de hoy llegan solos desde el iPhone después de medianoche."
                : "No llegaron Pasos diarios para esta fecha."}
            </p>
          )
        )}
      </div>

      <div className="panel">
        <h2>{ingesta ? "Corregir ingesta" : "Cargar ingesta"}</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Copiá los totales del resumen diario de MyFitnessPal. Los cuatro valores son obligatorios.
        </p>
        <div className="row">
          {VALORES.map(({ key, label, unidad }) => (
            <div className="field" key={key} style={{ flex: "1 1 120px" }}>
              <label htmlFor={`nutri-${key}`}>
                {unidad === "g" ? `${label} (g)` : label}
              </label>
              <input
                id={`nutri-${key}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor="nutri-comentario">Comentario (opcional)</label>
          <textarea
            id="nutri-comentario"
            rows={2}
            placeholder="ej. la cena fue a ojo"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </div>
        <button className="btn" onClick={save} disabled={saving || isLoading}>
          {saving ? "Guardando…" : ingesta ? "Guardar corrección" : "Guardar"}
        </button>
      </div>
      {node}
    </div>
  );
}
