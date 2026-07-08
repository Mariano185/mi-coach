import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "../api";
import type { TracEntry, UpsertTracInput } from "../types";
import { swrKeys } from "../swr";
import { useToast } from "../components/Toast";
import {
  DESCANSO_ALIMENTACION_OPTIONS,
  FATIGA_OPTIONS,
  MOTIVACION_TRAC_OPTIONS,
  RECUPERACION_OPTIONS,
  TECNICA_OPTIONS,
  type TracOption,
} from "../constants/trac";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// "" en el <select> (sin elegir) ↔ null en el modelo. Nunca defaulteamos a un valor numérico:
// el coach necesita ver huecos reales cuando el usuario no completó un campo.
type FieldValue = number | "";

function toFieldValue(v: number | null): FieldValue {
  return v === null ? "" : v;
}
function toApiValue(v: FieldValue): number | null {
  return v === "" ? null : v;
}

interface SelectFieldProps {
  label: string;
  value: FieldValue;
  options: TracOption[];
  onChange: (v: FieldValue) => void;
}

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <div className="field">
      <label>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      >
        <option value="">Sin registrar</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function Trac() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = params.get("returnTo");
  const { show, node } = useToast();

  const [fecha, setFecha] = useState(() => params.get("fecha") ?? today());

  const { data } = useSWR<TracEntry | null>(swrKeys.trac(fecha));

  const [fatigaPierna, setFatigaPierna] = useState<FieldValue>("");
  const [fatigaEmpuje, setFatigaEmpuje] = useState<FieldValue>("");
  const [fatigaTraccion, setFatigaTraccion] = useState<FieldValue>("");
  const [descansoAlimentacion, setDescansoAlimentacion] = useState<FieldValue>("");
  const [recuperacion, setRecuperacion] = useState<FieldValue>("");
  const [motivacion, setMotivacion] = useState<FieldValue>("");
  const [tecnica, setTecnica] = useState<FieldValue>("");
  const [saving, setSaving] = useState(false);

  // Sembrar los selects con lo ya guardado para esta fecha (si existe). Si no hay
  // registro previo, todos quedan en "" (sin registrar), nunca en un valor default.
  useEffect(() => {
    setFatigaPierna(toFieldValue(data?.fatiga_pierna ?? null));
    setFatigaEmpuje(toFieldValue(data?.fatiga_empuje ?? null));
    setFatigaTraccion(toFieldValue(data?.fatiga_traccion ?? null));
    setDescansoAlimentacion(toFieldValue(data?.descanso_alimentacion ?? null));
    setRecuperacion(toFieldValue(data?.recuperacion ?? null));
    setMotivacion(toFieldValue(data?.motivacion ?? null));
    setTecnica(toFieldValue(data?.tecnica ?? null));
  }, [data, fecha]);

  async function save() {
    setSaving(true);
    const input: UpsertTracInput = {
      fecha,
      fatiga_pierna: toApiValue(fatigaPierna),
      fatiga_empuje: toApiValue(fatigaEmpuje),
      fatiga_traccion: toApiValue(fatigaTraccion),
      descanso_alimentacion: toApiValue(descansoAlimentacion),
      recuperacion: toApiValue(recuperacion),
      motivacion: toApiValue(motivacion),
      tecnica: toApiValue(tecnica),
    };
    try {
      await api.upsertTrac(input);
      show("Trac guardado ✓");
      navigate(returnTo || "/dashboard");
    } catch (e) {
      show((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="panel">
        <h2>Añadir Trac</h2>

        <div className="field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>

        <div className="groupbox">
          <p className="groupbox-title">Dolor muscular</p>
          <SelectField label="Fatiga de pierna" value={fatigaPierna} options={FATIGA_OPTIONS} onChange={setFatigaPierna} />
          <SelectField label="Fatiga de empuje" value={fatigaEmpuje} options={FATIGA_OPTIONS} onChange={setFatigaEmpuje} />
          <SelectField label="Fatiga de tracción" value={fatigaTraccion} options={FATIGA_OPTIONS} onChange={setFatigaTraccion} />
        </div>

        <div className="groupbox">
          <p className="groupbox-title">Recuperación</p>
          <SelectField label="Descanso/Alimentación" value={descansoAlimentacion} options={DESCANSO_ALIMENTACION_OPTIONS} onChange={setDescansoAlimentacion} />
          <SelectField label="Recuperación" value={recuperacion} options={RECUPERACION_OPTIONS} onChange={setRecuperacion} />
          <SelectField label="Motivación" value={motivacion} options={MOTIVACION_TRAC_OPTIONS} onChange={setMotivacion} />
          <SelectField label="Técnica" value={tecnica} options={TECNICA_OPTIONS} onChange={setTecnica} />
        </div>

        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {node}
    </div>
  );
}
