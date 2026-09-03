// Esconder desenho é por FILTRO, e o filtro guarda a geometria da camada na frente:
// sem ela, a camada de área pintaria ponto e a de ponto pintaria polígono.
import { describe, expect, it } from "vitest";
import { filtroDoAcervo } from "./fonte";

/** As cláusulas de um filtro `["all", …]`, ou o filtro sozinho quando não há `all`. */
function clausulas(filtro: unknown): unknown[] {
  return Array.isArray(filtro) && filtro[0] === "all" ? filtro.slice(1) : [filtro];
}

describe("filtroDoAcervo", () => {
  it("sem nada escondido, filtra só a geometria da camada", () => {
    expect(filtroDoAcervo("desenhos-area")).toEqual(["==", ["geometry-type"], "Polygon"]);
    expect(filtroDoAcervo("desenhos-ponto")).toEqual(["==", ["geometry-type"], "Point"]);
  });

  it("com ids escondidos, a geometria continua na frente", () => {
    const filtro = filtroDoAcervo("desenhos-contorno", ["um-id"]);
    expect(clausulas(filtro)[0]).toEqual(["==", ["geometry-type"], "Polygon"]);
    expect(clausulas(filtro)).toHaveLength(2);
    expect(JSON.stringify(filtro)).toContain("um-id");
  });

  it("esconder é por id, e não por índice ou ordem", () => {
    // O id vem de `properties.id`, que o servidor põe em cada feição — é o que faz o
    // liga/desliga sobreviver a uma recarga que mude a ordem.
    const filtro = filtroDoAcervo("desenhos-area", ["a", "b"]);
    expect(JSON.stringify(filtro)).toContain('["get","id"]');
  });
});
