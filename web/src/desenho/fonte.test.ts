// As duas dimensões do filtro do acervo. Elas se parecem — as duas escondem coisa —
// e por isso o teste é sobre a diferença: uma esconde a CAMADA, a outra a FEIÇÃO, e
// as duas ligadas ao mesmo tempo têm de valer juntas.
import { describe, expect, it } from "vitest";
import { filtroDoAcervo } from "./fonte";
import { SEM_CATEGORIA } from "./camadas";

/** As cláusulas de um filtro `["all", …]`, ou o filtro sozinho quando não há `all`. */
function clausulas(filtro: unknown): unknown[] {
  return Array.isArray(filtro) && filtro[0] === "all" ? filtro.slice(1) : [filtro];
}

describe("filtroDoAcervo", () => {
  it("sem nada escondido, filtra só a geometria da camada", () => {
    expect(filtroDoAcervo("desenhos-area")).toEqual(["==", ["geometry-type"], "Polygon"]);
    expect(filtroDoAcervo("desenhos-ponto")).toEqual(["==", ["geometry-type"], "Point"]);
  });

  it("a geometria continua na frente quando algo é escondido", () => {
    // Sem ela, a camada de área pintaria ponto e a de ponto pintaria polígono.
    const filtro = filtroDoAcervo("desenhos-contorno", ["um-id"], ["uma-categoria"]);
    expect(clausulas(filtro)[0]).toEqual(["==", ["geometry-type"], "Polygon"]);
  });

  it("id escondido não arrasta a categoria junto", () => {
    const filtro = filtroDoAcervo("desenhos-area", ["um-id"]);
    expect(clausulas(filtro)).toHaveLength(2);
    expect(JSON.stringify(filtro)).toContain("um-id");
    expect(JSON.stringify(filtro)).not.toContain("categoria");
  });

  it("categoria escondida não vira lista de ids", () => {
    const filtro = filtroDoAcervo("desenhos-area", [], ["lotes"]);
    expect(clausulas(filtro)).toHaveLength(2);
    expect(JSON.stringify(filtro)).toContain("categoria");
    expect(JSON.stringify(filtro)).toContain("lotes");
  });

  it("as duas juntas somam cláusulas, e não substituem uma à outra", () => {
    const filtro = filtroDoAcervo("desenhos-area", ["um-id"], ["lotes"]);
    expect(clausulas(filtro)).toHaveLength(3);
  });

  it("o balde de quem não tem categoria é comparável como qualquer outro", () => {
    // O `coalesce`+`case` do filtro é o que faz nulo e vazio virarem SEM_CATEGORIA:
    // sem ele, desligar "Sem categoria" no painel não apagaria nada no mapa.
    const filtro = filtroDoAcervo("desenhos-ponto", [], [SEM_CATEGORIA]);
    const texto = JSON.stringify(filtro);
    expect(texto).toContain(SEM_CATEGORIA);
    expect(texto).toContain("coalesce");
  });
});
