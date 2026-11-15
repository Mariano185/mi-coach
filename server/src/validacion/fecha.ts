// YYYY-MM-DD y además una fecha real del calendario (rechaza 2026-02-30: Date la
// "normaliza" a otro día, así que se compara la vuelta).
export function esFecha(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
