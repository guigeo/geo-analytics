// Rede de segurança das camadas.
//
// Estes testes existem por um motivo datado: o passo 5 do ADR-0001 do `webgis`
// tira a lista de camadas daqui e a move para a configuração de cada cliente. A
// tradução de camada para especificação do MapLibre — `dataLayers` e
// `dataSources` — não pode mudar nesse caminho, e é o snapshot no fim deste
// arquivo que prova isso: se a saída mudar, o refactor deixou de ser refactor.
import { describe, expect, it } from "vitest";
import { dataLayers, dataSources, INTERACTIVE_LAYER_IDS, LAYERS } from "./layers";

describe("contrato das camadas", () => {
  it("não repete id", () => {
    const ids = LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declara sourceLayer e rótulo em todas", () => {
    for (const l of LAYERS) {
      expect(l.sourceLayer, `camada ${l.id}`).toBeTruthy();
      expect(l.label, `camada ${l.id}`).toBeTruthy();
    }
  });

  it("usa só geometrias conhecidas", () => {
    for (const l of LAYERS) {
      expect(["polygon", "line", "point"]).toContain(l.geometry);
    }
  });

  it("expõe todos os ids base como clicáveis", () => {
    expect(INTERACTIVE_LAYER_IDS).toEqual(LAYERS.map((l) => l.id));
  });
});

describe("fontes", () => {
  it("gera uma fonte vetorial por camada", () => {
    const fontes = dataSources();
    expect(Object.keys(fontes).sort()).toEqual(LAYERS.map((l) => l.id).sort());
    for (const [id, fonte] of Object.entries(fontes)) {
      expect(fonte.type, `fonte ${id}`).toBe("vector");
      expect((fonte as { url: string }).url, `fonte ${id}`).toMatch(/^pmtiles:\/\/.+\.pmtiles$/);
    }
  });
});

describe("camadas do mapa", () => {
  it("só referencia fonte declarada", () => {
    const fontes = new Set(Object.keys(dataSources()));
    for (const spec of dataLayers()) {
      expect(fontes, `camada ${spec.id}`).toContain((spec as { source: string }).source);
    }
  });

  it("respeita a convenção de sufixo das sub-camadas", () => {
    const base = new Set(LAYERS.map((l) => l.id));
    for (const spec of dataLayers()) {
      const raiz = spec.id.replace(/__(outline|label)$/, "");
      expect(base, `camada ${spec.id}`).toContain(raiz);
    }
  });

  it("põe os rótulos depois dos preenchimentos", () => {
    const especificacoes = dataLayers();
    const primeiroRotulo = especificacoes.findIndex((s) => s.id.endsWith("__label"));
    const ultimoNaoRotulo = especificacoes.map((s) => s.id.endsWith("__label")).lastIndexOf(false);
    expect(primeiroRotulo).toBeGreaterThan(ultimoNaoRotulo);
  });

  it("nasce com a visibilidade que a camada declara", () => {
    const porId = new Map(dataLayers().map((s) => [s.id, s]));
    for (const l of LAYERS) {
      const esperada = l.defaultVisible ? "visible" : "none";
      expect(porId.get(l.id)?.layout?.visibility, `camada ${l.id}`).toBe(esperada);
    }
  });
});

// A prova do refactor. Reescrever este snapshot só se a mudança de saída for
// intencional e estiver explicada no commit.
describe("saída congelada", () => {
  it("mantém as fontes", () => {
    expect(dataSources()).toMatchSnapshot();
  });

  it("mantém as camadas", () => {
    expect(dataLayers()).toMatchSnapshot();
  });
});
