import { describe, expect, it } from "vitest";
import {
  areaFormatada,
  autoIntersecta,
  circuloAproximado,
  MAX_RAIO_M,
  MAX_VERTICES,
  paraGeoJSON,
  validar,
  type Coordenada,
} from "./geometria";
import { areaEmMetrosQuadrados, distanciaEmMetros } from "@/map/medicao";

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

describe("círculo do buffer", () => {
  const CENTRO: Coordenada = [-46.6333, -23.5505];

  it("tem 64 lados, e é o mesmo número que o PostGIS usa ao salvar", () => {
    expect(circuloAproximado(CENTRO, 500)).toHaveLength(64);
  });

  it("a área do polígono inscrito fica logo abaixo de πr²", () => {
    // Inscrito: sempre MENOR que o círculo, e por pouco. Se desse maior, o cálculo
    // estaria circunscrevendo — e a área anunciada antes de salvar seria otimista.
    const area = areaEmMetrosQuadrados(circuloAproximado(CENTRO, 500));
    const circulo = Math.PI * 500 ** 2;
    expect(area / circulo).toBeGreaterThan(0.99);
    expect(area / circulo).toBeLessThan(1.0);
  });

  it("continua redondo longe do equador", () => {
    // A armadilha de somar deltas iguais em lon/lat: em latitude alta um grau de
    // longitude é bem mais curto que um de latitude, e o círculo sairia achatado.
    // Aqui se mede a distância de cada ponto ao centro — todas têm de ser o raio.
    for (const lat of [-33, 0, 5]) {
      const pontos = circuloAproximado([-46.6, lat], 1000);
      const distancias = pontos.map((p) => distanciaEmMetros([[-46.6, lat], p]));
      expect(Math.min(...distancias)).toBeGreaterThan(995);
      expect(Math.max(...distancias)).toBeLessThan(1005);
    }
  });

  it("o buffer só é válido com raio, e o motivo diz qual é o problema", () => {
    expect(validar("buffer", [CENTRO])?.motivo).toContain("raio");
    expect(validar("buffer", [CENTRO], 0)?.motivo).toContain("maior que zero");
    expect(validar("buffer", [CENTRO], MAX_RAIO_M + 1)?.motivo).toContain("50 km");
    expect(validar("buffer", [CENTRO], 500)).toBeNull();
  });

  it("a área formatada do buffer sai do círculo, não de πr²", () => {
    // É a área do que está NA TELA — e é ela que a pessoa está conferindo.
    expect(areaFormatada("buffer", [CENTRO], 500)).toBeTruthy();
    expect(areaFormatada("buffer", [CENTRO], null)).toBeNull();
    expect(areaFormatada("buffer", [], 500)).toBeNull();
  });
});
