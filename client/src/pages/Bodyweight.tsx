import { useState } from "react";
import useSWR from "swr";
import { api } from "../api";
import type { NewBodyweightInput, Stats } from "../types";
import { swrKeys } from "../swr";
import { TrendChart } from "../components/TrendChart";
import { useToast } from "../components/Toast";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Bodyweight() {
  // El promedio móvil 7d lo calcula el backend en /api/stats (key compartida con Dashboard).
  const { data: stats, error, mutate } = useSWR<Stats>(swrKeys.stats());
  const trend = stats?.tendencia_peso ?? [];
  const [fecha, setFecha] = useState(today());
  const [peso, setPeso] = useState("");
  const [kcal, setKcal] = useState("");
  const [prote, setProte] = useState("");
  const [hambre, setHambre] = useState("");
  const [digestion, setDigestion] = useState("");
  const [notas, setNotas] = useState("");
  const { show, node } = useToast();

  async function save() {
    const peso_kg = parseFloat(peso);
    if (Number.isNaN(peso_kg)) {
      show("Peso requerido", "err");
      return;
    }
    const input: NewBodyweightInput = {
      fecha,
      peso_kg,
      kcal_objetivo: kcal === "" ? null : Number(kcal),
      proteina_g: prote === "" ? null : Number(prote),
      hambre: hambre === "" ? null : Number(hambre),
      digestion: digestion || null,
      notas: notas || null,
    };
    try {
      await api.createBodyweight(input);
      show("Registro guardado ✓");
      setPeso(""); setKcal(""); setProte(""); setHambre(""); setDigestion(""); setNotas("");
      await mutate();
    } catch (e) {
      show((e as Error).message, "err");
    }
  }

  return (
    <div>
      <div className="panel">
        <h2>Peso corporal / Nutrición</h2>
        <div className="row">
          <div className="field"><label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="field"><label>Peso (kg)</label>
            <input type="number" step={0.1} value={peso} onChange={(e) => setPeso(e.target.value)} /></div>
          <div className="field"><label>Kcal objetivo</label>
            <input type="number" value={kcal} onChange={(e) => setKcal(e.target.value)} /></div>
          <div className="field"><label>Proteína (g)</label>
            <input type="number" value={prote} onChange={(e) => setProte(e.target.value)} /></div>
        </div>
        <div className="row">
          <div className="field"><label>Hambre (1-10)</label>
            <input type="number" min={1} max={10} value={hambre} onChange={(e) => setHambre(e.target.value)} /></div>
          <div className="field" style={{ flex: 2 }}><label>Digestión</label>
            <input value={digestion} onChange={(e) => setDigestion(e.target.value)} /></div>
        </div>
        <div className="field"><label>Notas</label>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        <button className="btn" onClick={save}>Guardar registro</button>
      </div>

      <div className="panel">
        <h2>Tendencia de peso (promedio móvil 7d)</h2>
        {error && <p style={{ color: "var(--danger)" }}>{(error as Error).message}</p>}
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
