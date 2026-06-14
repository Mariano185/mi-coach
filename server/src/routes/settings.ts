import { Router } from "express";
import { getSetting, setSetting } from "../db.js";

export const settingsRouter = Router();

const ALLOWED_KEYS = ["rm_squat", "rm_bench", "rm_deadlift"];

// GET /api/settings — devuelve los 1RM actuales.
settingsRouter.get("/", (_req, res) => {
  const data: Record<string, string | null> = {};
  for (const k of ALLOWED_KEYS) data[k] = getSetting(k);
  res.json(data);
});

// PATCH /api/settings — actualiza uno o más 1RM.
// Body: { "rm_squat": 100, "rm_bench": 85, "rm_deadlift": 165 }  (cualquier subconjunto)
settingsRouter.patch("/", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const updated: Record<string, number> = {};
  const errors: string[] = [];

  for (const key of ALLOWED_KEYS) {
    if (!(key in body)) continue;
    const val = Number(body[key]);
    if (!Number.isFinite(val) || val <= 0) {
      errors.push(`${key}: debe ser un número positivo`);
      continue;
    }
    setSetting(key, String(val));
    updated[key] = val;
  }

  if (errors.length) return res.status(400).json({ error: errors.join(", ") });
  if (!Object.keys(updated).length) {
    return res.status(400).json({ error: `campos válidos: ${ALLOWED_KEYS.join(", ")}` });
  }

  res.json({ updated });
});
