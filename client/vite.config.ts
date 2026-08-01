import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// El backend corre en :3001. Proxy de /api para que el cliente use rutas relativas.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt': el SW nuevo espera y le ofrecemos un botón "Actualizar" en
      // vez de recargar solo. 'autoUpdate' haría skipWaiting a ciegas y
      // puede romper chunks lazy de una página ya cargada.
      registerType: "prompt",

      // manifest.json ya existe en public/ y está completo (íconos, scope,
      // standalone). No lo regeneramos para no duplicar la fuente de verdad;
      // se agrega a includeAssets para que igual entre al precache.
      manifest: false,
      includeAssets: ["favicon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "manifest.json"],

      workbox: {
        // Todo lo que Vite emite a dist/ entra al precache, incluidas las
        // fuentes self-hosted.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],

        // Abrir la PWA en frío offline en una ruta profunda (/programs/days/3)
        // debe resolver al shell precacheado.
        navigateFallback: "/index.html",
        // CRÍTICO: SPA y API comparten origen (mismo Express en prod). Sin
        // esto, un fetch fallido a /api/* devolvería index.html y el
        // JSON.parse del cliente explotaría con "Unexpected token <".
        navigateFallbackDenylist: [/^\/api\//],

        // Antídoto contra "la app quedó pegada en una versión vieja": borra
        // precaches de revisiones anteriores del SW.
        cleanupOutdatedCaches: true,
        clientsClaim: true,

        runtimeCaching: [
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              sameOrigin &&
              request.method === "GET" &&
              url.pathname.startsWith("/api/") &&
              // /api/health es el latido de conectividad: nunca debe salir de cache.
              !url.pathname.startsWith("/api/health") &&
              // Un 200 viejo de /api/auth/* enmascararía una sesión ya vencida.
              !url.pathname.startsWith("/api/auth/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "mi-coach-api",
              // El default es 0 (desactivado). Sin esto, un WiFi que "asocia
              // pero no rutea" cuelga la request 30-60s antes de caer al cache.
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 60, // 60 días
              },
              // OBLIGATORIO: el default de NetworkFirst también cachea status 0
              // (respuestas opacas). Cachear un 401 dejaría al usuario en un
              // loop de login permanente.
              cacheableResponse: { statuses: [200] },
              matchOptions: { ignoreVary: true },
            },
          },
        ],
      },

      devOptions: {
        // Sin SW en `npm run dev`: evita que se pelee con el HMR de Vite.
        enabled: false,
        type: "module",
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
