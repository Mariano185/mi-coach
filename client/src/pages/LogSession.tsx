import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Exercise, NewSessionInput, NewSetInput, SessionType } from "../types";
import { useToast } from "../components/Toast";

// Una fila de set en el form. Strings para edición fluida; se parsean al guardar.
interface SetDraft {
  peso: string;
  reps: string;
  rpe: string;
  rir: string;
  notas: string;
}

interface ExerciseBlock {
  exercise_id: number;
  sets: SetDraft[];
}

function emptySet(): SetDraft {
  return { peso: "", reps: "", rpe: "", rir: "", notas: "" };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogSession() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [fecha, setFecha] = useState(today());
  const [tipo, setTipo] = useState<SessionType>("A");
  const [energia, setEnergia] = useState("");
  const [sueno, setSueno] = useState("");
  const [motivacion, setMotivacion] = useState("");
  const [dolor, setDolor] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [picker, setPicker] = useState("");
  const [saving, setSaving] = useState(false);
  const { show, node } = useToast();

  useEffect(() => {
    api.getExercises().then(setExercises).catch((e) => show(e.message, "err"));
  }, [show]);

  const byId = useMemo(() => {
    const m = new Map<number, Exercise>();
    exercises.forEach((e) => m.set(e.id, e));
    return m;
  }, [exercises]);

  function addExercise() {
    const id = Number(picker);
    if (!id) return;
    setBlocks((b) => [...b, { exercise_id: id, sets: [emptySet()] }]);
    setPicker("");
  }

  function addSet(bi: number) {
    setBlocks((b) =>
      b.map((blk, i) => (i === bi ? { ...blk, sets: [...blk.sets, emptySet()] } : blk))
    );
  }

  function removeSet(bi: number, si: number) {
    setBlocks((b) =>
      b.map((blk, i) =>
        i === bi ? { ...blk, sets: blk.sets.filter((_, j) => j !== si) } : blk
      )
    );
  }

  function removeBlock(bi: number) {
    setBlocks((b) => b.filter((_, i) => i !== bi));
  }

  function updateSet(bi: number, si: number, field: keyof SetDraft, value: string) {
    setBlocks((b) =>
      b.map((blk, i) =>
        i === bi
          ? { ...blk, sets: blk.sets.map((s, j) => (j === si ? { ...s, [field]: value } : s)) }
          : blk
      )
    );
  }

  // Enter en el último campo de la última fila agrega un set nuevo (menos fricción).
  function onSetKeyDown(e: React.KeyboardEvent, bi: number, si: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      const blk = blocks[bi];
      if (si === blk.sets.length - 1) addSet(bi);
    }
  }

  function buildPayload(): NewSessionInput | null {
    const sets: NewSetInput[] = [];
    for (const blk of blocks) {
      let n = 1;
      for (const s of blk.sets) {
        const peso = parseFloat(s.peso);
        const reps = parseInt(s.reps, 10);
        if (Number.isNaN(peso) || Number.isNaN(reps)) continue; // ignora filas vacías
        sets.push({
          exercise_id: blk.exercise_id,
          n_serie: n++,
          peso_kg: peso,
          reps,
          rpe: s.rpe === "" ? null : parseFloat(s.rpe),
          rir: s.rir === "" ? null : parseFloat(s.rir),
          notas: s.notas || null,
        });
      }
    }
    if (sets.length === 0) return null;
    return {
      fecha,
      tipo,
      energia: energia === "" ? null : Number(energia),
      sueno_horas: sueno === "" ? null : Number(sueno),
      motivacion: motivacion === "" ? null : Number(motivacion),
      dolor_molestias: dolor || null,
      comentarios: comentarios || null,
      sets,
    };
  }

  async function save() {
    const payload = buildPayload();
    if (!payload) {
      show("Agregá al menos un set con peso y reps", "err");
      return;
    }
    setSaving(true);
    try {
      await api.createSession(payload);
      show("Sesión guardada ✓");
      // Reset para la próxima carga.
      setBlocks([]);
      setEnergia(""); setSueno(""); setMotivacion(""); setDolor(""); setComentarios("");
    } catch (e) {
      show((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="panel">
        <h2>Registrar sesión</h2>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as SessionType)}>
              <option value="A">A — Squat + Bench</option>
              <option value="B">B — Deadlift + Bench</option>
            </select>
          </div>
        </div>
        <div className="row">
          <div className="field"><label>Energía (1-10)</label>
            <input type="number" min={1} max={10} value={energia} onChange={(e) => setEnergia(e.target.value)} /></div>
          <div className="field"><label>Sueño (h)</label>
            <input type="number" step={0.5} value={sueno} onChange={(e) => setSueno(e.target.value)} /></div>
          <div className="field"><label>Motivación (1-10)</label>
            <input type="number" min={1} max={10} value={motivacion} onChange={(e) => setMotivacion(e.target.value)} /></div>
        </div>
        <div className="field"><label>Dolor / molestias</label>
          <input value={dolor} onChange={(e) => setDolor(e.target.value)} placeholder="ninguno" /></div>
        <div className="field"><label>Comentarios</label>
          <input value={comentarios} onChange={(e) => setComentarios(e.target.value)} /></div>
      </div>

      <div className="panel">
        <h2>Ejercicios</h2>
        {blocks.map((blk, bi) => {
          const ex = byId.get(blk.exercise_id);
          return (
            <div className="exercise-block" key={bi}>
              <div className="head">
                <strong>{ex?.nombre ?? "—"}{ex?.es_basico ? " ⭐" : ""}</strong>
                <button className="btn danger" onClick={() => removeBlock(bi)}>Quitar</button>
              </div>
              <div className="set-grid">
                <span className="lbl">#</span>
                <span className="lbl">Peso (kg)</span>
                <span className="lbl">Reps</span>
                <span className="lbl">RPE</span>
                <span className="lbl">RIR</span>
                <span />
              </div>
              {blk.sets.map((s, si) => (
                <div className="set-grid" key={si}>
                  <span className="muted">{si + 1}</span>
                  <input type="number" step={0.5} value={s.peso}
                    onChange={(e) => updateSet(bi, si, "peso", e.target.value)} />
                  <input type="number" value={s.reps}
                    onChange={(e) => updateSet(bi, si, "reps", e.target.value)} />
                  <input type="number" step={0.5} value={s.rpe}
                    onChange={(e) => updateSet(bi, si, "rpe", e.target.value)} />
                  <input type="number" step={0.5} value={s.rir}
                    onChange={(e) => updateSet(bi, si, "rir", e.target.value)}
                    onKeyDown={(e) => onSetKeyDown(e, bi, si)} />
                  <button className="btn danger" title="quitar set"
                    onClick={() => removeSet(bi, si)}>×</button>
                </div>
              ))}
              <button className="btn ghost" onClick={() => addSet(bi)}>+ serie</button>
            </div>
          );
        })}

        <div className="row" style={{ marginTop: 8 }}>
          <div className="field" style={{ flex: 1 }}>
            <select value={picker} onChange={(e) => setPicker(e.target.value)}>
              <option value="">— elegir ejercicio —</option>
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.es_basico ? "⭐ " : ""}{e.nombre}
                </option>
              ))}
            </select>
          </div>
          <button className="btn secondary" onClick={addExercise} disabled={!picker}>+ ejercicio</button>
        </div>
      </div>

      <button className="btn" onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar sesión"}
      </button>
      {node}
    </div>
  );
}
