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
  server: { port: 5173 },
  // Em dev, os tiles são servidos de public/tiles. No build de produção NÃO os
  // copiamos para o dist (são ~2 GB) — eles sobem para a VPS por rsync próprio
  // e o Caddy serve em /tiles. Ver deploy/.
  build: { copyPublicDir: false },
});
