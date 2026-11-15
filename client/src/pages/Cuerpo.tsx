import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "../api";
import type { RegistroCorporal, Stats, UpsertRegistroCorporalInput } from "../types";
import { swrKeys } from "../swr";
import { TrendChart } from "../components/TrendChart";
import { useToast } from "../components/Toast";
import { PERIMETROS, type PerimetroKey } from "../constants/cuerpo";

// Fecha LOCAL de hoy (no toISOString(): de noche en UTC−3 la fecha UTC ya es mañana).
function hoyLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

type Form = { peso_kg: string; notas: string } & Record<PerimetroKey, string>;

const FORM_VACIO: Form = { peso_kg: "", brazo_cm: "", pierna_cm: "", abdomen_cm: "", notas: "" };

function aForm(r: RegistroCorporal | undefined): Form {
  if (!r) return FORM_VACIO;
  return {
    peso_kg: String(r.peso_kg),
    brazo_cm: r.brazo_cm == null ? "" : String(r.brazo_cm),
    pierna_cm: r.pierna_cm == null ? "" : String(r.pierna_cm),
    abdomen_cm: r.abdomen_cm == null ? "" : String(r.abdomen_cm),
    notas: r.notas ?? "",
  };
}

// Acepta coma decimal (teclado numérico en español).
function aNumero(raw: string): number {
  return Number(raw.trim().replace(",", "."));
}

export function Cuerpo() {
  // El promedio móvil 7d lo calcula el backend en /api/stats (key compartida con Dashboard).
  const { data: stats, error: statsError, mutate: mutateStats } = useSWR<Stats>(swrKeys.stats());
  const { data: registros, error, isLoading, mutate } = useSWR<RegistroCorporal[]>(swrKeys.cuerpo());
  const trend = stats?.tendencia_peso ?? [];

  const [fecha, setFecha] = useState(hoyLocal);
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const { show, node } = useToast();

  const registro = registros?.find((r) => r.fecha === fecha);

  // Precargar el registro si la fecha ya tiene uno; si no, formulario vacío.
  useEffect(() => {
    setForm(aForm(registro));
  }, [registro, fecha]);

  // Último valor cargado de cada Perímetro (cada uno con su fecha: no siempre se miden juntos).
  const ultimos = useMemo(
    () =>
      PERIMETROS.map(({ key, label }) => {
        const r = [...(registros ?? [])].reverse().find((x) => x[key] != null);
        return { key, label, valor: r?.[key] ?? null, fecha: r?.fecha ?? null };
      }),
    [registros]
  );

  async function save() {
    const peso_kg = aNumero(form.peso_kg);
    if (form.peso_kg.trim() === "" || !Number.isFinite(peso_kg) || peso_kg <= 0) {
      show("Peso: cargá un número mayor a 0", "err");
      return;
    }
    const input: UpsertRegistroCorporalInput = { fecha, peso_kg, notas: form.notas.trim() || null };
    for (const { key, label } of PERIMETROS) {
      const raw = form[key].trim();
      if (raw === "") {
        input[key] = null;
        continue;
      }
      const n = aNumero(raw);
      if (!Number.isFinite(n) || n <= 0) {
        show(`${label}: dejalo vacío o cargá un número mayor a 0`, "err");
        return;
      }
      input[key] = n;
    }

    setSaving(true);
    try {
      await api.upsertCuerpo(input);
      await Promise.all([mutate(), mutateStats()]);
      show(registro ? "Registro corregido ✓" : "Registro guardado ✓");
    } catch (e) {
      show((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="panel">
        <h2>{registro ? "Corregir registro corporal" : "Registro corporal"}</h2>
        {error && <p style={{ color: "var(--danger)" }}>{(error as Error).message}</p>}
        <div className="row">
          <div className="field">
            <label htmlFor="cuerpo-fecha">Fecha</label>
            <input
              id="cuerpo-fecha"
              type="date"
              value={fecha}
              max={hoyLocal()}
              onChange={(e) => e.target.value && setFecha(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cuerpo-peso">Peso (kg)</label>
            <input
              id="cuerpo-peso"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={form.peso_kg}
              onChange={(e) => setForm((f) => ({ ...f, peso_kg: e.target.value }))}
            />
          </div>
        </div>

        <p className="sec-label">Perímetros (cm, opcionales)</p>
        <div className="row">
          {PERIMETROS.map(({ key, label, protocolo }) => (
            <div className="field" key={key} style={{ flex: "1 1 160px" }}>
              <label htmlFor={`cuerpo-${key}`}>{label} (cm)</label>
              <input
                id={`cuerpo-${key}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={form[key]}
                aria-describedby={`cuerpo-${key}-protocolo`}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
              <small id={`cuerpo-${key}-protocolo`} className="muted field-hint">
                {protocolo}
              </small>
            </div>
          ))}
        </div>

        <div className="field">
          <label htmlFor="cuerpo-notas">Notas (opcional)</label>
          <textarea
            id="cuerpo-notas"
            rows={2}
            value={form.notas}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
          />
        </div>
        <button className="btn" onClick={save} disabled={saving || isLoading}>
          {saving ? "Guardando…" : registro ? "Guardar corrección" : "Guardar"}
        </button>
      </div>

      <div className="panel">
        <h2>Últimos perímetros</h2>
        <div className="mini-stats cuerpo-stats">
          {ultimos.map(({ key, label, valor, fecha: f }) => (
            <div className="ms" key={key}>
              <div className="k">{label}</div>
              <div className="v">
                {valor == null ? "—" : valor} {valor != null && <span className="u">cm</span>}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>{f ?? "sin cargar"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Tendencia de peso (promedio móvil 7d)</h2>
        {statsError && <p style={{ color: "var(--danger)" }}>{(statsError as Error).message}</p>}
        <TrendChart
          labels={trend.map((r) => r.fecha.slice(5))}
          yLabel="kg"
          series={[
            { label: "Peso", color: "#4f9dff", points: trend.map((r) => r.peso_kg) },
            { label: "PM 7d", color: "#34d399", points: trend.map((r) => r.promedio_movil_7d) },
          ]}
        />
        <p className="muted" style={{ fontSize: 12 }}>
          Azul: peso diario · Verde: promedio móvil 7 días
        </p>
      </div>
      {node}
    </div>
  );
}
