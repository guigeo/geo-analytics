// A regressão que este arquivo existe para impedir.
//
// Em 2026-08-29 o primeiro cliente derivado subiu com a tela vazia e nenhum
// pedido de tile. A causa: `highlight.ts` citava quatro fontes fixas — incluindo
// `distrito`, que aquele cliente não enxerga — e **style com fonte inexistente é
// recusado inteiro pelo MapLibre**. Não some a camada: some o mapa.
//
// Por isso o teste roda para TODO cliente, e não só para o ativo: o defeito só
// aparece em quem tem recorte menor que o catálogo.
import { describe, expect, it } from "vitest";
import { cliente as geoAnalytics } from "@/clientes/geo-analytics";
import { cliente as ebPrime } from "@/clientes/eb-prime";
import { montarEstilo } from "./estilo";

const CLIENTES = [
  ["geo-analytics", geoAnalytics],
  ["eb-prime", ebPrime],
] as const;

const COMBINACOES = [
  { tema: "light", satelite: false, sobreporVias: false },
  { tema: "dark", satelite: false, sobreporVias: false },
  { tema: "light", satelite: true, sobreporVias: true },
  { tema: "light", satelite: true, sobreporVias: false },
] as const;

describe.each(CLIENTES)("style de %s", (_nome, config) => {
  it.each(COMBINACOES)(
    "não referencia fonte inexistente (tema=$tema satélite=$satelite)",
    (opcoes) => {
      const estilo = montarEstilo({ camadas: config.camadas, ...opcoes });
      const declaradas = new Set(Object.keys(estilo.sources));
      for (const camada of estilo.layers) {
        if (!("source" in camada) || !camada.source) continue;
        expect(declaradas, `camada "${camada.id}"`).toContain(camada.source);
      }
    },
  );

  it("não repete id de camada", () => {
    const ids = montarEstilo({ camadas: config.camadas, ...COMBINACOES[0] }).layers.map(
      (c) => c.id,
    );
    expect(new Set(ids).size, `ids repetidos em ${ids.length} camadas`).toBe(ids.length);
  });

  it("declara uma fonte por camada do cliente, mais basemap, satélite e seleção", () => {
    const estilo = montarEstilo({ camadas: config.camadas, ...COMBINACOES[0] });
    for (const c of config.camadas) {
      expect(Object.keys(estilo.sources)).toContain(c.id);
    }
    expect(Object.keys(estilo.sources)).toEqual(
      expect.arrayContaining(["basemap", "satellite", "selection"]),
    );
  });
});
