// Rede de segurança das camadas.
//
// Estes testes existem por um motivo datado: o passo 5 do ADR-0001 do `webgis`
// tirou a lista de camadas de `layers.ts` e a moveu para a configuração de cada
// cliente, na fase 1 do plano de derivação. A tradução de camada para
// especificação do MapLibre — `camadasDoMapa` e `fontesDeDados` — não podia
// mudar nesse caminho, e é o snapshot no fim deste arquivo que provou isso: ele
// foi escrito ANTES da mudança e passou sem ser reescrito depois.
import { describe, expect, it } from "vitest";
import { camadasDoMapa, fontesDeDados, IDS_CLICAVEIS } from "./layers";
import { camadas } from "@/configuracao";

describe("contrato das camadas", () => {
  it("não repete id", () => {
    const ids = camadas.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declara sourceLayer e rótulo em todas", () => {
    for (const c of camadas) {
      expect(c.camadaFonte, `camada ${c.id}`).toBeTruthy();
      expect(c.rotulo, `camada ${c.id}`).toBeTruthy();
    }
  });

  it("usa só geometrias conhecidas", () => {
    for (const c of camadas) {
      expect(["poligono", "linha", "ponto"]).toContain(c.geometria);
    }
  });

  it("expõe todos os ids base como clicáveis", () => {
    expect(IDS_CLICAVEIS).toEqual(camadas.map((c) => c.id));
  });
});

describe("fontes", () => {
  it("gera uma fonte vetorial por camada", () => {
    const fontes = fontesDeDados();
    expect(Object.keys(fontes).sort()).toEqual(camadas.map((c) => c.id).sort());
    for (const [id, fonte] of Object.entries(fontes)) {
      expect(fonte.type, `fonte ${id}`).toBe("vector");
      expect((fonte as { url: string }).url, `fonte ${id}`).toMatch(/^pmtiles:\/\/.+\.pmtiles$/);
    }
  });
});

describe("camadas do mapa", () => {
  it("usa match para a camada categórica e neutro para o que não é zona", () => {
    const zoneamento = camadasDoMapa().find((camada) => camada.id === "zoneamento_sp");
    const pintura = zoneamento?.paint as { "fill-color"?: unknown } | undefined;
    expect(pintura?.["fill-color"]).toEqual(
      expect.arrayContaining(["match", ["get", "COD_ZONA"], "#94a3b8"]),
    );
  });

  it("só referencia fonte declarada", () => {
    const fontes = new Set(Object.keys(fontesDeDados()));
    for (const spec of camadasDoMapa()) {
      expect(fontes, `camada ${spec.id}`).toContain((spec as { source: string }).source);
    }
  });

  it("respeita a convenção de sufixo das sub-camadas", () => {
    const base = new Set(camadas.map((c) => c.id));
    for (const spec of camadasDoMapa()) {
      const raiz = spec.id.replace(/__(outline|label)$/, "");
      expect(base, `camada ${spec.id}`).toContain(raiz);
    }
  });

  it("põe os rótulos depois dos preenchimentos", () => {
    const especificacoes = camadasDoMapa();
    const primeiroRotulo = especificacoes.findIndex((s) => s.id.endsWith("__label"));
    const ultimoNaoRotulo = especificacoes.map((s) => s.id.endsWith("__label")).lastIndexOf(false);
    expect(primeiroRotulo).toBeGreaterThan(ultimoNaoRotulo);
  });

  it("nasce com a visibilidade que a camada declara", () => {
    const porId = new Map(camadasDoMapa().map((s) => [s.id, s]));
    for (const c of camadas) {
      const esperada = "none";
      expect(porId.get(c.id)?.layout?.visibility, `camada ${c.id}`).toBe(esperada);
    }
  });
});

// A prova do refactor. Reescrever este snapshot só se a mudança de saída for
// intencional e estiver explicada no commit.
describe("saída congelada", () => {
  it("mantém as fontes", () => {
    expect(fontesDeDados()).toMatchSnapshot();
  });

  it("mantém as camadas", () => {
    expect(camadasDoMapa()).toMatchSnapshot();
  });
});
