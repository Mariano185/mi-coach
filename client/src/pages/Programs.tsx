import { useEffect, useState } from "react";
import { api } from "../api";
import type { ProgramWeek } from "../types";
import { WeekView } from "./program/WeekView";
import { DayView } from "./program/DayView";
import { ExerciseView } from "./program/ExerciseView";

// Navegación drill-down como estado discriminado (no boolean props).
type View =
  | { level: "week" }
  | { level: "day"; dayId: number }
  | { level: "exercise"; dayId: number; exerciseId: number };

export function Programs() {
  const [weeks, setWeeks] = useState<ProgramWeek[]>([]);
  const [weekId, setWeekId] = useState<number | null>(null);
  const [view, setView] = useState<View>({ level: "week" });
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .getProgramWeeks()
      .then((ws) => {
        setWeeks(ws);
        if (ws.length > 0) setWeekId(ws[0].id);
      })
      .catch((e) => setErr(e.message));
  }, []);

  // Toast efímero al registrar un día.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (err) {
    return (
      <div className="panel">
        <p style={{ color: "var(--danger)" }}>{err}</p>
      </div>
    );
  }

  if (weeks.length === 0 || weekId == null) {
    return (
      <div className="panel">
        <h2>Programas</h2>
        <p className="muted">
          Todavía no hay semanas cargadas. Abrí Claude Code en esta carpeta y pedí:{" "}
          <em>"analizá la semana y armá la próxima"</em>.
        </p>
      </div>
    );
  }

  return (
    <div>
      {view.level === "week" ? (
        <WeekView
          weeks={weeks}
          weekId={weekId}
          onSelectWeek={setWeekId}
          onOpenDay={(dayId) => setView({ level: "day", dayId })}
        />
      ) : null}

      {view.level === "day" ? (
        <DayView
          dayId={view.dayId}
          onBack={() => setView({ level: "week" })}
          onOpenExercise={(exerciseId) =>
            setView({ level: "exercise", dayId: view.dayId, exerciseId })
          }
          onCompleted={setToast}
        />
      ) : null}

      {view.level === "exercise" ? (
        <ExerciseView
          exerciseId={view.exerciseId}
          onBack={() => setView({ level: "day", dayId: view.dayId })}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
