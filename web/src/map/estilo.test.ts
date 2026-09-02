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

  it("declara uma fonte por camada do cliente, mais as fontes da casca", () => {
    const estilo = montarEstilo({ camadas: config.camadas, ...COMBINACOES[0] });
    for (const c of config.camadas) {
      expect(Object.keys(estilo.sources)).toContain(c.id);
    }
    expect(Object.keys(estilo.sources)).toEqual(
      expect.arrayContaining([
        "basemap",
        "satellite",
        "selection",
        "medicao",
        "desenhos",
        "desenho-tracado",
      ]),
    );
  });

  // A medição é da casca e todo cliente recebe (webgis/docs/HERANCA.md, §1): não
  // há campo de configuração para desligá-la, e este teste é o que impede alguém
  // de inventar um sem perceber que quebrou o outro cliente.
  it("desenha a medição por cima de tudo, em qualquer combinação", () => {
    for (const opcoes of COMBINACOES) {
      const ids = montarEstilo({ camadas: config.camadas, ...opcoes }).layers.map((c) => c.id);
      expect(ids).toEqual(
        expect.arrayContaining(["medicao-area", "medicao-linha", "medicao-vertice"]),
      );
      expect(ids[ids.length - 1]).toBe("medicao-vertice");
    }
  });

  // Desenhar é da casca pelo mesmo argumento da medição: a regra 1 do ADR-0001 diz
  // que o que *difere* entre clientes é dado — ferramenta que nenhum cliente quer
  // desligar não é ponto de variação. O que difere é o CONTEÚDO do acervo, e esse
  // já é dado, num schema por cliente. Este teste é o que impede alguém de inventar
  // uma chave de configuração para desligar o desenho sem notar que quebrou o outro.
  it("desenha o acervo e o traçado em qualquer combinação", () => {
    for (const opcoes of COMBINACOES) {
      const ids = montarEstilo({ camadas: config.camadas, ...opcoes }).layers.map((c) => c.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          "desenhos-area",
          "desenhos-contorno",
          "desenhos-ponto",
          "desenho-tracado-area",
          "desenho-tracado-linha",
          "desenho-tracado-vertice",
        ]),
      );
    }
  });

  // O acervo fica ACIMA das camadas de dado e ABAIXO da seleção. Não é arrumação:
  // um desenho grande escondendo o realce do clique faria o mapa parecer não ter
  // respondido ao gesto.
  it("põe os desenhos acima do dado do cliente e abaixo da seleção", () => {
    const camadasDoEstilo = montarEstilo({ camadas: config.camadas, ...COMBINACOES[0] }).layers;
    const ids = camadasDoEstilo.map((c) => c.id);
    const primeiroDesenho = ids.indexOf("desenhos-area");
    // Pela FONTE, e não por sufixo de id: as camadas do cliente terminam em
    // `__outline` e `__label`, e procurar um sufixo que não existe faria o teste
    // passar com `indexOf` devolvendo -1 sem comparar coisa nenhuma.
    const ultimaDoCliente = camadasDoEstilo.reduce(
      (maior, c, i) =>
        "source" in c && config.camadas.some((camada) => camada.id === c.source) ? i : maior,
      -1,
    );
    expect(ultimaDoCliente).toBeGreaterThan(-1);
    expect(ultimaDoCliente).toBeLessThan(primeiroDesenho);
    expect(primeiroDesenho).toBeLessThan(ids.indexOf("selection-fill"));
  });
});
