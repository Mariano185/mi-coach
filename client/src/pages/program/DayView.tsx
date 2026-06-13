import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import type { ProgramDayDetail, ProgramExerciseCard, Seccion } from "../../types";
import { IconBack, IconLayers } from "../../components/icons";

const SECCION_LABEL: Record<Seccion, string> = {
  main: "Básicos",
  accesorio: "Accesorios",
  core: "Core / Opcional",
};
const SECCION_ORDER: Seccion[] = ["main", "accesorio", "core"];

export function DayView() {
  const { dayId: dayIdParam } = useParams();
  const dayId = Number(dayIdParam);
  const navigate = useNavigate();
  const [data, setData] = useState<ProgramDayDetail | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  function load() {
    if (!Number.isInteger(dayId)) {
      setErr("día inválido");
      return;
    }
    api.getProgramDay(dayId).then(setData).catch((e) => setErr(e.message));
  }
  useEffect(load, [dayId]);

  // Toast efímero al registrar un día.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const grouped = useMemo(() => {
    const map = new Map<Seccion, ProgramExerciseCard[]>();
    for (const ex of data?.exercises ?? []) {
      const arr = map.get(ex.seccion) ?? [];
      arr.push(ex);
      map.set(ex.seccion, arr);
    }
    return SECCION_ORDER.filter((s) => map.has(s)).map((s) => [s, map.get(s)!] as const);
  }, [data]);

  const progreso = useMemo(() => {
    const exs = data?.exercises ?? [];
    const total = exs.reduce((a, e) => a + e.n_series, 0);
    const hechas = exs.reduce((a, e) => a + e.n_series_hechas, 0);
    return { total, hechas };
  }, [data]);

  async function registrarDia() {
    if (!data) return;
    setSaving(true);
    setErr("");
    try {
      const r = await api.completeProgramDay(dayId, {});
      setToast(`Día ${data.dia} registrado · ${r.sets} series → historial`);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (err) return <p style={{ color: "var(--danger)" }}>{err}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <div>
      <div className="prog-nav">
        <button
          className="prog-back"
          onClick={() => navigate(`/programs/weeks/${data.week_id}`)}
          aria-label="Volver a la semana"
        >
          <IconBack width={18} height={18} />
        </button>
        <span className="prog-crumb">
          Semana <b>{data.semana}</b>
          {data.nombre_semana ? <> · {data.nombre_semana}</> : null}
        </span>
      </div>

      <h2 className="prog-title">
        Día {data.dia}
        {data.tipo ? <span className={`pill ${data.tipo}`} style={{ marginLeft: 12, verticalAlign: "middle" }}>Opción {data.tipo}</span> : null}
        {data.titulo ? <span className="sub">{data.titulo}</span> : null}
      </h2>

      {data.warmup ? (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Warm-up</h3>
          <p className="muted" style={{ margin: 0 }}>{data.warmup}</p>
        </div>
      ) : null}

      {grouped.map(([sec, items]) => (
        <section key={sec}>
          <h3 className={`sec-label ${sec === "main" ? "main" : ""}`}>{SECCION_LABEL[sec]}</h3>
          <div className="card-grid">
            {items.map((ex) => {
              const pct = ex.n_series ? ex.n_series_hechas / ex.n_series : 0;
              const complete = ex.n_series > 0 && ex.n_series_hechas === ex.n_series;
              return (
                <button
                  key={ex.id}
                  className={`tile ${complete ? "complete" : ""}`}
                  onClick={() => navigate(`/programs/days/${dayId}/exercises/${ex.id}`)}
                >
                  <span className="edge">
                    <span className="fill" style={{ height: `${pct * 100}%` }} />
                  </span>
                  <div className="tile-head">
                    <div className="tile-name">{ex.nombre}</div>
                  </div>
                  <div className="tile-meta">
                    <span className="m">
                      <IconLayers /> {ex.n_series} series
                    </span>
                    {ex.n_series_hechas > 0 ? (
                      <span className="done-chip">{ex.n_series_hechas}/{ex.n_series} hechas</span>
                    ) : null}
                  </div>
                  {ex.reps_text || ex.carga_text || ex.rpe_text ? (
                    <div className="tile-sub">
                      {ex.reps_text ?? "—"} · {ex.carga_text ?? "—"} · RPE {ex.rpe_text ?? "—"}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="panel" style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Progreso del día
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700 }}>
            {progreso.hechas} / {progreso.total} series
            {data.session_id ? <span className="done-chip" style={{ marginLeft: 12 }}>✓ en historial</span> : null}
          </div>
        </div>
        <button
          className="btn"
          onClick={registrarDia}
          disabled={saving || progreso.hechas === 0}
          title={progreso.hechas === 0 ? "Completá al menos una serie real" : "Volcar al historial"}
        >
          {saving ? "Guardando…" : data.session_id ? "Actualizar historial" : "Registrar día"}
        </button>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
