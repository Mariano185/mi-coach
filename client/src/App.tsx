import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { LogSession } from "./pages/LogSession";
import { Bodyweight } from "./pages/Bodyweight";
import { History } from "./pages/History";
import { Dashboard } from "./pages/Dashboard";
import { ProgramIndexRedirect, Programs } from "./pages/Programs";
import { WeekView } from "./pages/program/WeekView";
import { DayView } from "./pages/program/DayView";
import { ExerciseView } from "./pages/program/ExerciseView";
import { BottomNav } from "./components/BottomNav";

const NAV: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/dashboard", label: "Dashboard", end: true },
  { to: "/log", label: "Registrar sesión", end: true },
  { to: "/weight", label: "Peso / Nutrición", end: true },
  { to: "/history", label: "Historial", end: true },
  { to: "/programs", label: "Programas" },
];

function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Powerbuilding <span className="accent">Coach</span>
        </h1>
        <span className="sub">app local · un solo atleta</span>
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

        <Route
          path="/dashboard"
          element={
            <RootLayout>
              <Dashboard />
            </RootLayout>
          }
        />
        <Route
          path="/log"
          element={
            <RootLayout>
              <LogSession />
            </RootLayout>
          }
        />
        <Route
          path="/weight"
          element={
            <RootLayout>
              <Bodyweight />
            </RootLayout>
          }
        />
        <Route
          path="/history"
          element={
            <RootLayout>
              <History />
            </RootLayout>
          }
        />

        <Route
          path="/programs"
          element={
            <RootLayout>
              <Programs />
            </RootLayout>
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
            <RootLayout>
              <NotFound />
            </RootLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
