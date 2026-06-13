import { useState } from "react";
import { LogSession } from "./pages/LogSession";
import { Bodyweight } from "./pages/Bodyweight";
import { History } from "./pages/History";
import { Dashboard } from "./pages/Dashboard";
import { Programs } from "./pages/Programs";

type Tab = "log" | "peso" | "historial" | "dashboard" | "programas";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "log", label: "Registrar sesión" },
  { id: "peso", label: "Peso / Nutrición" },
  { id: "historial", label: "Historial" },
  { id: "dashboard", label: "Dashboard" },
  { id: "programas", label: "Programas" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("log");

  return (
    <div className="app">
      <header className="topbar">
        <h1>Powerbuilding <span className="accent">Coach</span></h1>
        <span className="sub">app local · un solo atleta</span>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "log" && <LogSession />}
      {tab === "peso" && <Bodyweight />}
      {tab === "historial" && <History />}
      {tab === "dashboard" && <Dashboard />}
      {tab === "programas" && <Programs />}
    </div>
  );
}
