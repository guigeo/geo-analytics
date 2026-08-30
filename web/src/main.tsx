import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { App } from "./App";
import { aplicarTema, tema } from "./configuracao";

// Antes do primeiro render: assim ninguém vê a cor da casca piscar antes da
// cor do cliente.
aplicarTema(tema);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
