import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { App } from "./App";
import { ProvedorDeSessao } from "./auth/sessao";
import { aplicarIdentidade, aplicarTema, identidade, tema } from "./configuracao";

// Antes do primeiro render: assim ninguém vê a cor da casca piscar antes da
// cor do cliente. O mesmo vale para o `<head>` — título, descrição e a cor da
// barra do navegador saem da configuração, e não do `index.html`, que é neutro.
aplicarTema(tema);
aplicarIdentidade(identidade, tema);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* O portao envolve a aplicacao, e nao o contrario: sem sessao, nada do App chega
        a montar — nem o mapa, nem as chamadas que ele dispara no primeiro render.
        Ele decide o que se VE; quem decide o que se ACESSA e o middleware do agente,
        que responde 401 ao /api independentemente do que esta tela mostre. */}
    <ProvedorDeSessao>
      <App />
    </ProvedorDeSessao>
  </StrictMode>,
);
