import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

export function Login() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const next = search.get("next") || "/dashboard";

  useEffect(() => {
    api
      .authStatus()
      .then((s) => {
        setConfigured(s.password_configured);
        if (s.authenticated) navigate(next, { replace: true });
      })
      .catch(() => {
        /* si falla, el form sigue habilitado */
      });
  }, [navigate, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api.login(password);
      navigate(next, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="panel login-card" onSubmit={onSubmit}>
        <h2 className="login-title">Mi Coach</h2>
        {configured === false ? (
          <p className="muted" style={{ marginTop: 0 }}>
            Auth no configurado en el server. Setear <code>AUTH_PASSWORD</code> y reiniciar.
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            Ingresá tu password.
          </p>
        )}
        <div className="field">
          <label htmlFor="login-pwd">Password</label>
          <input
            id="login-pwd"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
            autoComplete="current-password"
          />
        </div>
        {err ? <p className="login-err">{err}</p> : null}
        <button
          className="btn"
          type="submit"
          disabled={busy || configured === false}
          style={{ width: "100%" }}
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
