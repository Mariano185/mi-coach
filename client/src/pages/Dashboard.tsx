import { useEffect, useState } from "react";
import { api } from "../api";
import type { Stats } from "../types";

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="panel"><p style={{ color: "var(--danger)" }}>{err}</p></div>;
  if (!stats) return <div className="panel"><p className="muted">Cargando…</p></div>;

  return (
    <div>
      <div className="panel">
        <h2>Mejor e1RM por básico vs 1RM inicial</h2>
        <div className="stat-cards">
          {stats.basicos.map((b) => {
            const delta = b.rm_inicial != null ? b.mejor_e1rm - b.rm_inicial : null;
            return (
              <div className="stat-card" key={b.exercise_id}>
                <div className="name">{b.nombre}</div>
                <div className="big">{b.mejor_e1rm} kg</div>
                {b.rm_inicial != null && (
                  <div className={`delta ${delta! >= 0 ? "up" : "down"}`}>
                    {delta! >= 0 ? "▲" : "▼"} {Math.abs(delta!).toFixed(1)} kg vs {b.rm_inicial} inicial
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h2>Volumen semanal (series: básicos vs accesorios)</h2>
        <table>
          <thead>
            <tr><th>Semana (ISO)</th><th>Básicos</th><th>Accesorios</th><th>Total</th></tr>
          </thead>
          <tbody>
            {stats.volumen_semanal.map((v) => (
              <tr key={v.semana}>
                <td>{v.semana}</td>
                <td>{v.series_basicos}</td>
                <td>{v.series_accesorios}</td>
                <td>{v.series_basicos + v.series_accesorios}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
