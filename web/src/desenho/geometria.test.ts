import { describe, expect, it } from "vitest";
import {
  areaFormatada,
  autoIntersecta,
  MAX_VERTICES,
  paraGeoJSON,
  validar,
  type Coordenada,
} from "./geometria";

const QUADRADO: Coordenada[] = [
  [-46.66, -23.57],
  [-46.65, -23.57],
  [-46.65, -23.56],
  [-46.66, -23.56],
];

// Os dois primeiros vértices trocados de lugar: o contorno vira uma gravata.
const GRAVATA: Coordenada[] = [
  [-46.66, -23.57],
  [-46.65, -23.56],
  [-46.65, -23.57],
  [-46.66, -23.56],
];

describe("validar", () => {
  it("aceita um ponto com uma coordenada", () => {
    expect(validar("ponto", [[-46.65, -23.56]])).toBeNull();
  });

  it("recusa modo sem coordenada nenhuma, dizendo o que fazer", () => {
    expect(validar("ponto", [])?.motivo).toMatch(/clique/i);
  });

  it("recusa polígono com menos de três pontos", () => {
    expect(
      validar("poligono", [
        [-46.66, -23.57],
        [-46.65, -23.57],
      ])?.motivo,
    ).toMatch(/pelo menos 3/);
  });

  it("aceita um quadrado", () => {
    expect(validar("poligono", QUADRADO)).toBeNull();
  });

  it("recusa contorno que cruza a si mesmo", () => {
    expect(validar("poligono", GRAVATA)?.motivo).toMatch(/cruza a si mesmo/i);
  });

  it("recusa vértices repetidos seguidos, que viram anel degenerado", () => {
    const repetido: Coordenada[] = [QUADRADO[0], QUADRADO[0], QUADRADO[1], QUADRADO[2]];
    expect(validar("poligono", repetido)?.motivo).toMatch(/repetidos/i);
  });

  it("recusa acima do teto de vértices, dizendo o número", () => {
    const demais = Array.from(
      { length: MAX_VERTICES + 1 },
      (_, i) => [-46 + i * 1e-6, -23] as Coordenada,
    );
    expect(validar("poligono", demais)?.motivo).toContain(String(MAX_VERTICES));
  });
});

describe("autoIntersecta", () => {
  it("não acusa o fechamento do anel como cruzamento", () => {
    // O erro clássico: o segmento de volta compartilha vértice com o primeiro, e uma
    // varredura ingênua o contaria como interseção — recusando todo polígono válido.
    expect(autoIntersecta(QUADRADO)).toBe(false);
  });

  it("acusa a gravata", () => {
    expect(autoIntersecta(GRAVATA)).toBe(true);
  });

  it("acusa cruzamento no segmento de volta", () => {
    const bandeirinha: Coordenada[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [1, -1],
    ];
    expect(autoIntersecta(bandeirinha)).toBe(true);
  });
});

describe("paraGeoJSON", () => {
  it("ponto vira Point", () => {
    expect(paraGeoJSON("ponto", [[-46.65, -23.56]])).toEqual({
      type: "Point",
      coordinates: [-46.65, -23.56],
    });
  });

  it("polígono fecha o anel repetindo o primeiro vértice", () => {
    const g = paraGeoJSON("poligono", QUADRADO) as GeoJSON.Polygon;
    expect(g.type).toBe("Polygon");
    expect(g.coordinates[0]).toHaveLength(QUADRADO.length + 1);
    expect(g.coordinates[0].at(-1)).toEqual(QUADRADO[0]);
  });
});

describe("areaFormatada", () => {
  it("não promete área para um ponto", () => {
    expect(areaFormatada("ponto", [[-46.65, -23.56]])).toBeNull();
  });

  it("formata a área do quadrado em unidade legível", () => {
    // ~0,01 grau de lado nesta latitude: da ordem de 1 km x 1,1 km.
    expect(areaFormatada("poligono", QUADRADO)).toMatch(/km²|ha|m²/);
  });
});
