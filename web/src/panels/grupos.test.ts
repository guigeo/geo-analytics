import { describe, expect, it } from "vitest";
import { agruparCamadas, ligadasNoGrupo } from "./grupos";
import { CATALOGO } from "@/configuracao/catalogo";

describe("agruparCamadas", () => {
  it("arruma o catálogo inteiro em dois combos, na ordem declarada", () => {
    const grupos = agruparCamadas(Object.values(CATALOGO));
    expect(grupos.map((g) => g.id)).toEqual(["ibge", "infraestrutura"]);
    expect(grupos[0].camadas.map((c) => c.id)).toEqual([
      "uf",
      "municipio",
      "distrito",
      "bairro",
      "setor",
    ]);
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

describe("ligadasNoGrupo", () => {
  it("conta só as do próprio grupo", () => {
    const [ibge, infra] = agruparCamadas(Object.values(CATALOGO));
    const visiveis = { uf: true, setor: true, rodovias: true };
    expect(ligadasNoGrupo(ibge, visiveis)).toBe(2);
    expect(ligadasNoGrupo(infra, visiveis)).toBe(1);
  });

  it("sem nada ligado, zero", () => {
    const [ibge] = agruparCamadas(Object.values(CATALOGO));
    expect(ligadasNoGrupo(ibge, {})).toBe(0);
  });
});
