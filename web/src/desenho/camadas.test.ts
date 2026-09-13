import { describe, expect, it } from "vitest";
import { impedimentoDoRaioX, itensDoAcervo, TETO_AREA_RAIO_X_M2 } from "./camadas";

function feicao(props: Record<string, unknown>, geometria?: GeoJSON.Geometry): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: geometria ?? { type: "Point", coordinates: [0, 0] },
    properties: props,
  };
}

function colecao(...features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("itensDoAcervo", () => {
  it("acervo vazio não inventa item", () => {
    expect(itensDoAcervo(colecao())).toEqual([]);
  });

  it("traz o que o painel precisa de cada desenho", () => {
    const [item] = itensDoAcervo(
      colecao(
        feicao({
          id: "abc",
          nome: "Área 1",
          cor: "#16a34a",
          tipo: "poligono",
          area_m2: 12_345,
        }),
      ),
    );
    expect(item).toMatchObject({
      id: "abc",
      nome: "Área 1",
      cor: "#16a34a",
      tipo: "poligono",
      area_m2: 12_345,
    });
    expect(item.geometria.type).toBe("Point");
  });

  it("preserva a ordem do servidor", () => {
    const itens = itensDoAcervo(
      colecao(feicao({ id: "1", nome: "Primeiro" }), feicao({ id: "2", nome: "Segundo" })),
    );
    expect(itens.map((i) => i.nome)).toEqual(["Primeiro", "Segundo"]);
  });

  it("feição sem id não entra", () => {
    // Sem id não há como esconder nem apagar: seria uma linha morta no painel.
    expect(itensDoAcervo(colecao(feicao({ nome: "órfã" })))).toEqual([]);
  });

  it("nome e cor têm queda, para a linha nunca sair em branco", () => {
    const [item] = itensDoAcervo(colecao(feicao({ id: "x" })));
    expect(item.nome).toBe("(sem nome)");
    expect(item.cor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(item.tipo).toBe("poligono");
  });
});

describe("impedimentoDoRaioX", () => {
  const item = itensDoAcervo(
    colecao(feicao({ id: "x", nome: "Área", tipo: "poligono", area_m2: 1 })),
  )[0];

  it("aceita o teto inclusive", () => {
    expect(impedimentoDoRaioX({ ...item, area_m2: TETO_AREA_RAIO_X_M2 })).toBeNull();
  });

  it("explica a área atual, o teto e a correção", () => {
    const motivo = impedimentoDoRaioX({ ...item, area_m2: TETO_AREA_RAIO_X_M2 + 1_000_000 });
    expect(motivo).toContain("51,00 km²");
    expect(motivo).toContain("50,00 km²");
    expect(motivo).toContain("Reduza o desenho");
  });
});
