// Preparo do ambiente de teste (vitest + jsdom).
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// A limpeza entre testes é explícita de propósito. O testing-library só a
// registra sozinho quando o vitest roda com `globals: true`, e aqui não roda —
// sem isto o DOM do teste anterior sobra montado e as consultas do seguinte
// enxergam o dobro de elementos.
afterEach(cleanup);

// O jsdom não implementa ResizeObserver, e os componentes do Radix que medem
// espaço (ScrollArea) o exigem no primeiro render. Stub mínimo: os testes daqui
// verificam conteúdo, não layout.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
