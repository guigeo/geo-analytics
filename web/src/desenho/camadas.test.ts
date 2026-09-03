import { describe, expect, it } from "vitest";
import { camadasDoAcervo, SEM_CATEGORIA } from "./camadas";

function feicao(categoria: string | null, cor = "#111111"): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { id: Math.random().toString(36), categoria, cor },
  };
}

function colecao(...features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("camadasDoAcervo", () => {
  it("acervo vazio não inventa camada", () => {
    expect(camadasDoAcervo(colecao())).toEqual([]);
  });

  it("uma camada por categoria, com a contagem", () => {
    const camadas = camadasDoAcervo(
      colecao(feicao("terrenos"), feicao("terrenos"), feicao("prédios")),
    );
    expect(camadas.map((c) => [c.id, c.quantidade])).toEqual([
      ["terrenos", 2],
      ["prédios", 1],
    ]);
  });

  it("ordena por frequência, e desempata pelo nome", () => {
    const camadas = camadasDoAcervo(colecao(feicao("zeta"), feicao("alfa")));
    expect(camadas.map((c) => c.id)).toEqual(["alfa", "zeta"]);
  });

  it("sem categoria vira um balde só, e ele fica por último", () => {
    // Nulo, ausente e string vazia são a mesma coisa para quem olha o painel; se
    // caíssem em baldes diferentes, o painel mostraria três camadas anônimas.
    const semNada: GeoJSON.Feature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: { cor: "#222222" },
    };
    const camadas = camadasDoAcervo(
      colecao(feicao(null), feicao("  "), semNada, feicao("terrenos")),
    );
    expect(camadas.map((c) => c.id)).toEqual(["terrenos", SEM_CATEGORIA]);
    expect(camadas[1]).toMatchObject({ rotulo: "Sem categoria", quantidade: 3 });
  });

  it("a amostra usa a cor mais frequente da categoria", () => {
    const camadas = camadasDoAcervo(
      colecao(feicao("lotes", "#aaaaaa"), feicao("lotes", "#bbbbbb"), feicao("lotes", "#bbbbbb")),
    );
    expect(camadas[0].cor).toBe("#bbbbbb");
  });

  it("categoria é aparada antes de agrupar", () => {
    const camadas = camadasDoAcervo(colecao(feicao("lotes"), feicao(" lotes ")));
    expect(camadas).toHaveLength(1);
    expect(camadas[0].quantidade).toBe(2);
  });
});
