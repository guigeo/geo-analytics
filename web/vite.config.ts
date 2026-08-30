import fs from "node:fs";
import path from "path";
// `vitest/config` no lugar de `vite`: é o mesmo defineConfig, com o bloco `test`
// tipado. Sem isso o TypeScript recusa a configuração dos testes.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Qual cliente esta aplicação é. A escolha acontece no BUILD, não em runtime —
// é o que o ADR-0001 do webgis chama de composição de build (§8), e a razão de
// multi-tenancy em runtime estar fora de escopo. Cada cliente vira um bundle, e
// o bundle de um não carrega a configuração do outro.
//
//   npm run dev                          → geo-analytics (padrão)
//   VITE_CLIENTE=eb-prime npm run dev    → EB Prime
const CLIENTE = process.env.VITE_CLIENTE ?? "geo-analytics";
// Porta do agente deste cliente (make agente [PORTA_IA=…]); só vale em dev.
const PORTA_AGENTE = process.env.PORTA_AGENTE ?? "8000";
const ARQUIVO_DO_CLIENTE = path.resolve(__dirname, `./src/clientes/${CLIENTE}.ts`);

if (!fs.existsSync(ARQUIVO_DO_CLIENTE)) {
  const disponiveis = fs
    .readdirSync(path.resolve(__dirname, "./src/clientes"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.replace(/\.ts$/, ""))
    .join(", ");
  // Falha aqui, e não com um import quebrado lá na frente: errar o nome do
  // cliente é o erro mais provável deste mecanismo, e ele precisa dizer o que
  // existe em vez de "módulo não encontrado".
  throw new Error(`VITE_CLIENTE="${CLIENTE}" não existe. Disponíveis: ${disponiveis}`);
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // O cliente ativo, resolvido acima. Quem importa "cliente-ativo" recebe o
      // arquivo do cliente deste build e não conhece nenhum outro pelo nome.
      "cliente-ativo": ARQUIVO_DO_CLIENTE,
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Chat (Fase 2): o web roda em container, o agente roda nativo no host
      // (make agente). Same-origin via proxy — sem CORS. No trabalho (sem Docker),
      // troque o host por localhost.
      //
      // A PORTA vem do ambiente porque agora existe um agente por cliente: com as
      // duas aplicações de pé, o :5174 tem de falar com o agente do EB Prime e não
      // com o do cliente 1 — senão o chat do segundo responde com a persona do
      // primeiro, que é exatamente o que a fase 5 veio consertar.
      "/api": { target: `http://host.docker.internal:${PORTA_AGENTE}`, changeOrigin: true },
    },
  },
  // Tiles não são build desta app: vivem no host de tiles compartilhado (fora do
  // repositório) e chegam por `map/tileHost.ts`. O dist nunca os contém — na VPS
  // quem serve /tiles é o Caddy, alimentado por rsync próprio. Ver deploy/ e
  // ../webgis/docs/LOCAL.md.
  build: { copyPublicDir: false },
  test: {
    environment: "jsdom",
    setupFiles: ["./testes/preparo.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
