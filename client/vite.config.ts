import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El backend corre en :3001. Proxy de /api para que el cliente use rutas relativas.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
