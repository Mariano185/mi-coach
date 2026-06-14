import { useEffect, useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Bodyweight } from "./pages/Bodyweight";
import { History } from "./pages/History";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { ProgramIndexRedirect, Programs } from "./pages/Programs";
import { WeekView } from "./pages/program/WeekView";
import { DayView } from "./pages/program/DayView";
import { ExerciseView } from "./pages/program/ExerciseView";
import { BottomNav } from "./components/BottomNav";
import { api } from "./api";

const NAV: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/dashboard", label: "Dashboard", end: true },
  { to: "/weight", label: "Peso / Nutrición", end: true },
  { to: "/history", label: "Historial", end: true },
  { to: "/programs", label: "Programas" },
];

function RootLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  async function logout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Powerbuilding <span className="accent">Coach</span>
        </h1>
        <span className="sub">app local · un solo atleta</span>
        <button className="topbar-logout" onClick={logout} aria-label="Cerrar sesión">
          Salir
        </button>
      </header>

      <nav className="tabs" aria-label="Secciones principales">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      {children}

      <BottomNav />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ok" | "no">("loading");
  const location = useLocation();
  useEffect(() => {
    let cancelled = false;
    api
      .authStatus()
      .then((s) => {
        if (!cancelled) setStatus(s.authenticated ? "ok" : "no");
      })
      .catch(() => {
        if (!cancelled) setStatus("no");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (status === "loading") {
    return (
      <p className="muted" style={{ padding: 40, textAlign: "center" }}>
        Cargando…
      </p>
    );
  }
  if (status === "no") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="panel">
      <h2>404</h2>
      <p className="muted">No encontramos esa ruta.</p>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/login" element={<Login />} />

        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <RootLayout>
                <Dashboard />
              </RootLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/weight"
          element={
            <RequireAuth>
              <RootLayout>
                <Bodyweight />
              </RootLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/history"
          element={
            <RequireAuth>
              <RootLayout>
                <History />
              </RootLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/programs"
          element={
            <RequireAuth>
              <RootLayout>
                <Programs />
              </RootLayout>
            </RequireAuth>
          }
        >
          <Route index element={<ProgramIndexRedirect />} />
          <Route path="weeks/:weekId" element={<WeekView />} />
          <Route path="days/:dayId" element={<DayView />} />
          <Route
            path="days/:dayId/exercises/:exerciseId"
            element={<ExerciseView />}
          />
        </Route>

        <Route
          path="*"
          element={
            <RequireAuth>
              <RootLayout>
                <NotFound />
              </RootLayout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
