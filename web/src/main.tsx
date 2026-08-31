import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { App } from "./App";
import { aplicarIdentidade, aplicarTema, identidade, tema } from "./configuracao";

// Antes do primeiro render: assim ninguém vê a cor da casca piscar antes da
// cor do cliente. O mesmo vale para o `<head>` — título, descrição e a cor da
// barra do navegador saem da configuração, e não do `index.html`, que é neutro.
aplicarTema(tema);
aplicarIdentidade(identidade, tema);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
