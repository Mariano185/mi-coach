import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import type { ProgramExerciseDetail, ProgramSet } from "../../types";
import { IconBack, IconCloudCheck, IconCloudOff, IconCloudSync } from "../../components/icons";

type Tab = "objetivo" | "real";
type SyncState = "synced" | "saving" | "error";

const DEBOUNCE_MS = 2000;

// Campo numérico de una serie: avisa cambios via onChange (sin guardado propio).
function SetCell({
  value,
  placeholder,
  onCommit,
  onDirty,
  onBlur: onBlurExtra,
  ariaLabel,
}: {
  value: number | null;
  placeholder: string;
  onCommit: (v: number | null) => void;
  onDirty: () => void;
  onBlur?: () => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  function handleBlur() {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    const normalized = next != null && Number.isFinite(next) ? next : null;
    if (normalized !== value) onCommit(normalized);
    onBlurExtra?.();
  }

  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      className=""
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onDirty();
      }}
      onBlur={handleBlur}
    />
  );
}

// Indicador de sync arriba a la derecha.
function SyncStatus({ state, onFlush }: { state: SyncState; onFlush: () => void }) {
  const canClick = state === "error";
  if (state === "synced") {
    return (
      <span className="sync-status sync-ok" aria-label="Guardado">
        <IconCloudCheck width={20} height={20} />
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="sync-status sync-saving" aria-label="Guardando…">
        <IconCloudSync width={20} height={20} />
      </span>
    );
  }
  return (
    <button
      className="sync-status sync-error"
      aria-label="Error al guardar — tap para reintentar"
      onClick={canClick ? onFlush : undefined}
    >
      <IconCloudOff width={20} height={20} />
    </button>
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
  const [syncState, setSyncState] = useState<SyncState>("synced");

  // Cola de patches pendientes: setId → campos a enviar.
  const pending = useRef<Map<number, Partial<Record<"real_peso" | "real_reps" | "real_rpe", number | null>>>>(new Map());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  useEffect(() => {
    if (!Number.isInteger(exerciseId)) {
      setErr("ejercicio inválido");
      return;
    }
    api.getProgramExercise(exerciseId).then(setData).catch((e) => setErr(e.message));
  }, [exerciseId]);

  const flush = useCallback(async () => {
    if (flushingRef.current || pending.current.size === 0) return;
    flushingRef.current = true;
    setSyncState("saving");

    const snapshot = new Map(pending.current);
    pending.current.clear();

    try {
      const updates = await Promise.all(
        [...snapshot.entries()].map(([setId, patch]) =>
          api.updateProgramSet(setId, patch)
        )
      );
      // Actualizar state con las respuestas reales del server.
      setData((prev) =>
        prev
          ? {
              ...prev,
              sets: prev.sets.map((s) => {
                const updated = updates.find((u) => u.id === s.id);
                return updated ?? s;
              }),
            }
          : prev
      );
      setSyncState("synced");
    } catch (e) {
      // Devolver los patches fallidos a la cola para que el usuario pueda reintentar.
      for (const [k, v] of snapshot) {
        if (!pending.current.has(k)) pending.current.set(k, v);
      }
      setErr((e as Error).message);
      setSyncState("error");
    } finally {
      flushingRef.current = false;
    }
  }, []);

  // Flush al desmontar (usuario navega fuera sin esperar el debounce).
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (pending.current.size > 0) void flush();
    };
  }, [flush]);

  // Marca nube amarilla mientras el usuario está tipeando (antes de commitear).
  function onDirty() {
    if (syncState === "synced") setSyncState("saving");
  }

  // Registra un cambio committeado (onBlur del campo): merge en la cola y debounce.
  function schedulePatch(
    set: ProgramSet,
    patch: Partial<Record<"real_peso" | "real_reps" | "real_rpe", number | null>>
  ) {
    if (Object.keys(patch).length === 0) return; // llamada de onDirty, ignorar

    // Actualización optimista inmediata.
    setData((prev) =>
      prev
        ? { ...prev, sets: prev.sets.map((s) => (s.id === set.id ? { ...s, ...patch } : s)) }
        : prev
    );

    // Merge en pendientes.
    const current = pending.current.get(set.id) ?? {};
    pending.current.set(set.id, { ...current, ...patch });
    setSyncState("saving");

    // Debounce: resetear timer.
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }

  // Cuando el usuario sale de un campo (blur): flush inmediato para no perder datos.
  function onBlurFlush() {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    void flush();
  }

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

  if (err && !data) return <p style={{ color: "var(--danger)" }}>{err}</p>;
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
        <SyncStatus state={syncState} onFlush={() => void flush()} />
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
          <RealGrid
            data={data}
            onPatch={schedulePatch}
            onDirty={onDirty}
            onBlurFlush={onBlurFlush}
          />
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

function ObjetivoGrid({ data }: { data: ProgramExerciseDetail }) {
  return (
    <div className="sets-table sets-table--objetivo" role="table" aria-label="Objetivo por serie">
      <div className="sh">#</div>
      <div className="sh">Reps</div>
      <div className="sh">RPE</div>
      <div className="sh">Carga sugerida</div>
      {data.sets.map((s) => (
        <Row key={s.id}>
          <div className="serie-n">{s.n_serie}</div>
          <div className="target-cell">{data.reps_text ?? "—"}</div>
          <div className="target-cell">{s.target_rpe ?? "—"}</div>
          <div className="target-cell">{data.carga_text ?? "—"}</div>
        </Row>
      ))}
    </div>
  );
}

function RealGrid({
  data,
  onPatch,
  onDirty,
  onBlurFlush,
}: {
  data: ProgramExerciseDetail;
  onPatch: (s: ProgramSet, p: Partial<Record<"real_peso" | "real_reps" | "real_rpe", number | null>>) => void;
  onDirty: () => void;
  onBlurFlush: () => void;
}) {
  return (
    <div className="sets-table sets-table--no-ok" aria-label="Real por serie">
      <div className="sh">#</div>
      <div className="sh">Peso</div>
      <div className="sh">Reps</div>
      <div className="sh">RPE</div>
      <div className="sh">Obj.</div>
      {data.sets.map((s) => (
        <Row key={s.id}>
          <div className="serie-n">{s.n_serie}</div>
          <SetCell
            value={s.real_peso}
            placeholder="kg"
            ariaLabel={`Peso serie ${s.n_serie}`}
            onCommit={(v) => onPatch(s, { real_peso: v })}
            onDirty={onDirty}
            onBlur={onBlurFlush}
          />
          <SetCell
            value={s.real_reps}
            placeholder="reps"
            ariaLabel={`Reps serie ${s.n_serie}`}
            onCommit={(v) => onPatch(s, { real_reps: v })}
            onDirty={onDirty}
            onBlur={onBlurFlush}
          />
          <SetCell
            value={s.real_rpe}
            placeholder="rpe"
            ariaLabel={`RPE serie ${s.n_serie}`}
            onCommit={(v) => onPatch(s, { real_rpe: v })}
            onDirty={onDirty}
            onBlur={onBlurFlush}
          />
          <div className="target-cell" title="objetivo">
            {data.reps_text ?? "—"}×@{data.rpe_text ?? "—"}
          </div>
        </Row>
      ))}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="set-row">{children}</div>;
}
