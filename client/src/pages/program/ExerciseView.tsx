import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import type { ProgramExerciseDetail, ProgramSet } from "../../types";
import { IconBack, IconCheck } from "../../components/icons";

type Tab = "objetivo" | "real";

// Campo numérico de una serie, edición optimista con guardado al salir (onBlur).
function SetCell({
  value,
  placeholder,
  onCommit,
  ariaLabel,
}: {
  value: number | null;
  placeholder: string;
  onCommit: (v: number | null) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      className={draft !== "" ? "filled" : ""}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        const next = trimmed === "" ? null : Number(trimmed.replace(",", "."));
        const normalized = next != null && Number.isFinite(next) ? next : null;
        if (normalized !== value) onCommit(normalized);
      }}
    />
  );
}

export function ExerciseView() {
  const { exerciseId: exerciseIdParam } = useParams();
  const exerciseId = Number(exerciseIdParam);
  const { dayId: dayIdParam } = useParams();
  const dayId = Number(dayIdParam);
  const navigate = useNavigate();
  const [data, setData] = useState<ProgramExerciseDetail | null>(null);
  const [tab, setTab] = useState<Tab>("real");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!Number.isInteger(exerciseId)) {
      setErr("ejercicio inválido");
      return;
    }
    api.getProgramExercise(exerciseId).then(setData).catch((e) => setErr(e.message));
  }, [exerciseId]);

  // Estadísticas derivadas en render (no en effect): mejor e1RM + tonelaje total.
  const stats = useMemo(() => {
    if (!data) return { e1rm: 0, tonelaje: 0 };
    let e1rm = 0;
    let tonelaje = 0;
    for (const s of data.sets) {
      if (s.e1rm != null && s.e1rm > e1rm) e1rm = s.e1rm;
      if (s.tonelaje != null) tonelaje += s.tonelaje;
    }
    return { e1rm: Math.round(e1rm * 10) / 10, tonelaje: Math.round(tonelaje) };
  }, [data]);

  function patchSet(set: ProgramSet, patch: Partial<Record<"real_peso" | "real_reps" | "real_rpe", number | null>> & { hecha?: boolean }) {
    // Optimista: actualizo local, luego confirmo con server.
    setData((prev) =>
      prev
        ? { ...prev, sets: prev.sets.map((s) => (s.id === set.id ? { ...s, ...patch, hecha: patch.hecha != null ? (patch.hecha ? 1 : 0) : s.hecha } : s)) }
        : prev
    );
    api
      .updateProgramSet(set.id, patch)
      .then((updated) =>
        setData((prev) =>
          prev ? { ...prev, sets: prev.sets.map((s) => (s.id === updated.id ? updated : s)) } : prev
        )
      )
      .catch((e) => setErr((e as Error).message));
  }

  function toggleDone(set: ProgramSet) {
    patchSet(set, { hecha: set.hecha ? false : true });
  }

  if (err) return <p style={{ color: "var(--danger)" }}>{err}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <div>
      <div className="prog-nav">
        <button
          className="prog-back"
          onClick={() => navigate(`/programs/days/${dayId}`)}
          aria-label="Volver al día"
        >
          <IconBack width={18} height={18} />
        </button>
        <span className="prog-crumb">
          Día <b>{data.dia}</b> · serie por serie
        </span>
      </div>

      <h2 className="prog-title">{data.nombre}</h2>

      <div className="panel">
        <div className="seg" role="tablist" aria-label="Objetivo o real">
          <button
            role="tab"
            aria-selected={tab === "objetivo"}
            className={tab === "objetivo" ? "active" : ""}
            onClick={() => setTab("objetivo")}
          >
            Objetivo
          </button>
          <button
            role="tab"
            aria-selected={tab === "real"}
            className={tab === "real" ? "active" : ""}
            onClick={() => setTab("real")}
          >
            Real
          </button>
        </div>

        {tab === "objetivo" ? (
          <ObjetivoGrid data={data} />
        ) : (
          <RealGrid data={data} onPatch={patchSet} onToggle={toggleDone} />
        )}
      </div>

      <h3 className="sec-label main">Estadísticas</h3>
      <div className="mini-stats">
        <div className="ms">
          <div className="k">e1RM (mejor)</div>
          <div className="v">
            {stats.e1rm || 0} <span className="u">kg</span>
          </div>
        </div>
        <div className="ms">
          <div className="k">Tonelaje real</div>
          <div className="v">
            {stats.tonelaje || 0} <span className="u">kg</span>
          </div>
        </div>
        <div className="ms">
          <div className="k">Objetivo</div>
          <div className="v" style={{ fontSize: 18 }}>
            {data.reps_text ?? "—"} · {data.carga_text ?? "—"} · RPE {data.rpe_text ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

// Variante: solo lectura del objetivo del coach.
function ObjetivoGrid({ data }: { data: ProgramExerciseDetail }) {
  return (
    <div className="sets-table" role="table" aria-label="Objetivo por serie">
      <div className="sh">#</div>
      <div className="sh">Reps</div>
      <div className="sh">RPE</div>
      <div className="sh" style={{ gridColumn: "span 2" }}>
        Carga sugerida
      </div>
      <div className="sh" />
      {data.sets.map((s) => (
        <Row key={s.id}>
          <div className="serie-n">{s.n_serie}</div>
          <div className="target-cell">{data.reps_text ?? "—"}</div>
          <div className="target-cell">{s.target_rpe ?? "—"}</div>
          <div className="target-cell" style={{ gridColumn: "span 2" }}>
            {data.carga_text ?? "—"}
          </div>
          <div />
        </Row>
      ))}
    </div>
  );
}

// Variante: edición de los valores reales.
function RealGrid({
  data,
  onPatch,
  onToggle,
}: {
  data: ProgramExerciseDetail;
  onPatch: (s: ProgramSet, p: Partial<Record<"real_peso" | "real_reps" | "real_rpe", number | null>>) => void;
  onToggle: (s: ProgramSet) => void;
}) {
  return (
    <div className="sets-table" aria-label="Real por serie">
      <div className="sh">#</div>
      <div className="sh">Peso</div>
      <div className="sh">Reps</div>
      <div className="sh">RPE</div>
      <div className="sh">Obj.</div>
      <div className="sh">OK</div>
      {data.sets.map((s) => (
        <Row key={s.id}>
          <div className="serie-n">{s.n_serie}</div>
          <SetCell
            value={s.real_peso}
            placeholder="kg"
            ariaLabel={`Peso serie ${s.n_serie}`}
            onCommit={(v) => onPatch(s, { real_peso: v })}
          />
          <SetCell
            value={s.real_reps}
            placeholder="reps"
            ariaLabel={`Reps serie ${s.n_serie}`}
            onCommit={(v) => onPatch(s, { real_reps: v })}
          />
          <SetCell
            value={s.real_rpe}
            placeholder="rpe"
            ariaLabel={`RPE serie ${s.n_serie}`}
            onCommit={(v) => onPatch(s, { real_rpe: v })}
          />
          <div className="obj-row">
            <div className="target-cell" title="objetivo">
              {data.reps_text ?? "—"}×@{data.rpe_text ?? "—"}
            </div>
            <button
              className={`check ${s.hecha ? "on" : ""}`}
              aria-pressed={s.hecha === 1}
              aria-label={`Marcar serie ${s.n_serie} como hecha`}
              onClick={() => onToggle(s)}
            >
              {s.hecha ? <IconCheck width={18} height={18} /> : null}
            </button>
          </div>
        </Row>
      ))}
    </div>
  );
}

// Fragment helper: una fila es solo los 6 hijos directos del grid.
// En desktop usa display:contents para que sus hijos participen del grid del .sets-table.
// En mobile el CSS lo convierte en una card apilada.
function Row({ children }: { children: React.ReactNode }) {
  return <div className="set-row">{children}</div>;
}
