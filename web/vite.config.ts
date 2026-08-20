import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Chat (Fase 2): o web roda em container, o agente roda nativo no host
      // (make agent). Same-origin via proxy — sem CORS. No trabalho (sem Docker),
      // troque o target por http://localhost:8000.
      "/api": { target: "http://host.docker.internal:8000", changeOrigin: true },
    },
  },
  // Tiles não são build desta app: vivem no host de tiles compartilhado (fora do
  // repositório) e chegam por `map/tileHost.ts`. O dist nunca os contém — na VPS
  // quem serve /tiles é o Caddy, alimentado por rsync próprio. Ver deploy/ e
  // ../webgis/docs/LOCAL.md.
  build: { copyPublicDir: false },
});
