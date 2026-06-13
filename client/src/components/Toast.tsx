import { useCallback, useState } from "react";

interface ToastState {
  msg: string;
  kind: "ok" | "err";
}

// Hook simple para mostrar un mensaje efímero tras guardar.
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const show = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  }, []);

  const node = toast ? (
    <div className={`toast ${toast.kind === "err" ? "err" : ""}`}>{toast.msg}</div>
  ) : null;

  return { show, node };
}
