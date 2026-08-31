/**
 * O que este arquivo cobre, e por quê.
 *
 * Medida errada não parece errada: ela sai formatada, com unidade, e ninguém
 * desconfia de "1,24 km". Por isso os números esperados aqui não foram calculados
 * por esta mesma implementação — vieram do **PostGIS**, que é a fonte que o resto
 * do sistema já usa para distância exata (ADR-0001, §2.1), rodando
 * `ST_Length(geography)` e `ST_Area(geography)` sobre as mesmas coordenadas.
 *
 * O PostGIS calcula no elipsoide e este módulo calcula na esfera, então os valores
 * não batem na vírgula — e a tolerância de cada caso é a diferença medida em
 * 2026-08-31, não uma folga escolhida no olho.
 */
import { describe, expect, it } from "vitest";
import {
  areaEmMetrosQuadrados,
  criarEstadoMedicao,
  distanciaEmMetros,
  formatarMedida,
  geometriaDaMedicao,
  type Coordenada,
} from "./medicao";

/** Um quarteirão e um terreno em São Caetano do Sul — a cidade de exemplo do cliente 2. */
const QUADRA: Coordenada[] = [
  [-46.5745, -23.618],
  [-46.568, -23.618],
];
const TERRENO: Coordenada[] = [
  [-46.5745, -23.618],
  [-46.568, -23.618],
  [-46.568, -23.612],
  [-46.5745, -23.612],
];

describe("cálculo, conferido contra o PostGIS", () => {
  it("distância acumulada: 2° no equador", () => {
    // ST_Length('LINESTRING(0 0, 1 0, 2 0)'::geography) = 222.638,98 m
    expect(
      distanciaEmMetros([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    ).toBeCloseTo(222_638.98, -3);
  });

  it("distância de um quarteirão: 663,32 m no PostGIS, 0,17% abaixo aqui", () => {
    const nosso = distanciaEmMetros(QUADRA);
    expect(Math.abs(nosso - 663.3241) / 663.3241).toBeLessThan(0.002);
  });

  it("área de 1°×1° no equador: 12.308.778.361 m² no PostGIS, 0,45% acima aqui", () => {
    const nosso = areaEmMetrosQuadrados([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    expect(Math.abs(nosso - 12_308_778_361) / 12_308_778_361).toBeLessThan(0.005);
  });

  it("área de um terreno: 440.799,65 m² no PostGIS, 0,23% acima aqui", () => {
    const nosso = areaEmMetrosQuadrados(TERRENO);
    expect(Math.abs(nosso - 440_799.65) / 440_799.65).toBeLessThan(0.003);
  });

  it("a ordem dos vértices não muda a área", () => {
    expect(areaEmMetrosQuadrados([...TERRENO].reverse())).toBeCloseTo(
      areaEmMetrosQuadrados(TERRENO),
      6,
    );
  });

  it("polígono com menos de três vértices não tem área", () => {
    expect(areaEmMetrosQuadrados(QUADRA)).toBe(0);
  });
});

describe("estado", () => {
  it("só publica resultado depois do mínimo de vértices", () => {
    expect(criarEstadoMedicao("distancia", [QUADRA[0]]).valor).toBeNull();
    expect(criarEstadoMedicao("area", QUADRA).valor).toBeNull();
    expect(criarEstadoMedicao("distancia", QUADRA).valor).not.toBeNull();
    expect(criarEstadoMedicao("area", TERRENO).valor).not.toBeNull();
  });

  it("sem modo, não há medição — nem os vértices sobrevivem", () => {
    const estado = criarEstadoMedicao(null, TERRENO);
    expect(estado).toEqual({ modo: null, coordenadas: [], valor: null, formatado: null });
  });

  it("não devolve o mesmo array que recebeu", () => {
    // Se devolvesse, o estado do React mudaria por baixo de quem já o renderizou.
    const entrada = [...QUADRA];
    const estado = criarEstadoMedicao("distancia", entrada);
    expect(estado.coordenadas).not.toBe(entrada);
  });
});

describe("formatação", () => {
  it("troca de unidade pela grandeza, em pt-BR", () => {
    expect(formatarMedida("distancia", 950)).toBe("950 m");
    expect(formatarMedida("distancia", 1_500)).toBe("1,50 km");
    expect(formatarMedida("area", 500_000)).toBe("500.000 m²");
    expect(formatarMedida("area", 2_500_000)).toBe("2,50 km²");
  });

  it("o quarteirão e o terreno saem legíveis", () => {
    expect(criarEstadoMedicao("distancia", QUADRA).formatado).toBe("662 m");
    expect(criarEstadoMedicao("area", TERRENO).formatado).toBe("441.828 m²");
  });
});

describe("desenho", () => {
  it("um vértice desenha só o ponto", () => {
    const fc = geometriaDaMedicao(criarEstadoMedicao("distancia", [QUADRA[0]]));
    expect(fc.features.map((f) => f.geometry.type)).toEqual(["Point"]);
  });

  it("distância desenha a linha aberta", () => {
    const fc = geometriaDaMedicao(criarEstadoMedicao("distancia", TERRENO));
    const linha = fc.features.find((f) => f.geometry.type === "LineString");
    expect(fc.features.some((f) => f.geometry.type === "Polygon")).toBe(false);
    expect((linha!.geometry as GeoJSON.LineString).coordinates).toHaveLength(TERRENO.length);
  });

  it("área desenha o polígono com o anel fechado", () => {
    const fc = geometriaDaMedicao(criarEstadoMedicao("area", TERRENO));
    const anel = (
      fc.features.find((f) => f.geometry.type === "Polygon")!.geometry as GeoJSON.Polygon
    ).coordinates[0];
    expect(anel).toHaveLength(TERRENO.length + 1);
    expect(anel[0]).toEqual(anel[anel.length - 1]);
  });

  it("sem modo, não desenha nada", () => {
    expect(geometriaDaMedicao(criarEstadoMedicao(null)).features).toEqual([]);
  });
});
