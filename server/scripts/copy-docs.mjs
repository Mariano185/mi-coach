// Copia server/src/docs/*.md a server/dist/docs/. tsc no copia .md, así que
// este paso corre después de tsc en "npm run build" (ver package.json).
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "..", "src", "docs");
const DEST = resolve(__dirname, "..", "dist", "docs");

if (!existsSync(SRC)) {
  console.error(`[copy-docs] no existe ${SRC}`);
  process.exit(1);
}

cpSync(SRC, DEST, { recursive: true });
console.log(`[copy-docs] ${SRC} -> ${DEST}`);
