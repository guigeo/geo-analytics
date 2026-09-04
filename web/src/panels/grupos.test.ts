import { describe, expect, it } from "vitest";
import { agruparCamadas } from "./grupos";
import { CATALOGO } from "@/configuracao/catalogo";

describe("agruparCamadas", () => {
  it("arruma o catálogo inteiro em três combos, na ordem declarada", () => {
    const grupos = agruparCamadas(Object.values(CATALOGO));
    expect(grupos.map((g) => g.id)).toEqual(["ibge", "infraestrutura", "regulacao"]);
    expect(grupos[0].camadas.map((c) => c.id)).toEqual([
      "uf",
      "municipio",
      "distrito",
      "bairro",
      "setor",
    ]);
    expect(grupos[2].camadas.map((c) => c.id)).toEqual(["zoneamento_sp"]);
    expect(grupos[1].camadas.map((c) => c.id)).toEqual(["antenas", "rodovias", "ferrovias"]);
  });

  it("grupo sem camada nenhuma não aparece", () => {
    // O caso do cliente que não enxerga infraestrutura: combo vazio sugeriria que
    // algo não carregou.
    const grupos = agruparCamadas([CATALOGO.uf, CATALOGO.municipio]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].id).toBe("ibge");
  });

  it("preserva a ordem que o cliente declarou dentro do combo", () => {
    const grupos = agruparCamadas([CATALOGO.setor, CATALOGO.uf]);
    expect(grupos[0].camadas.map((c) => c.id)).toEqual(["setor", "uf"]);
  });

  it("acervo vazio de camadas devolve nenhum combo", () => {
    expect(agruparCamadas([])).toEqual([]);
  });
});
