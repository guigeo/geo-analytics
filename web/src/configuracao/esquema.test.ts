// O esquema é a fronteira entre cliente e código. Estes testes cobrem o que ele
// precisa REJEITAR: configuração que o TypeScript aceita e o mapa ignoraria em
// silêncio é justamente o que se quer pegar no boot, e não em produção.
import { describe, expect, it } from "vitest";
import { cliente as geoAnalytics } from "@/clientes/geo-analytics";
import { cliente as ebPrime } from "@/clientes/eb-prime";
import { EsquemaCliente } from "./esquema";

/** Clona e deixa mexer sem contaminar os outros testes. */
function comCliente(ajuste: (c: typeof geoAnalytics) => void) {
  const copia = structuredClone(geoAnalytics);
  ajuste(copia);
  return EsquemaCliente.safeParse(copia);
}

describe("esquema de cliente", () => {
  it.each([
    ["geo-analytics", geoAnalytics],
    ["eb-prime", ebPrime],
  ])("aceita a configuração de %s como ela está", (_nome, config) => {
    const r = EsquemaCliente.safeParse(config);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it("recusa cor que não é hexadecimal de 6 dígitos", () => {
    const r = comCliente((c) => {
      c.camadas[0].cor = "azul" as never;
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("hexadecimal");
  });

  it("recusa id de camada fora do padrão", () => {
    const r = comCliente((c) => {
      c.camadas[0].id = "Setor Censitário" as never;
    });
    expect(r.success).toBe(false);
  });

  it("recusa camada repetida", () => {
    // Id repetido não quebra o MapLibre: a segunda sobrescreve a primeira em
    // silêncio, e a camada que sumiu continua aparecendo na legenda.
    const r = comCliente((c) => {
      c.camadas.push(structuredClone(c.camadas[0]));
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("mais de uma vez");
  });

  it("recusa ícone em camada que não é de ponto", () => {
    const r = comCliente((c) => {
      c.camadas[0].icone = "antenna-tower";
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("ícone só se aplica");
  });

  it("recusa largura de linha em polígono", () => {
    const r = comCliente((c) => {
      c.camadas[0].larguraLinha = 2;
    });
    expect(r.success).toBe(false);
  });

  it("recusa zoom inicial fora da faixa declarada", () => {
    const r = comCliente((c) => {
      c.mapa.zoomMinimo = 8;
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("abaixo do zoomMinimo");
  });

  it("recusa camada sem atributo — ela não mostraria nada ao ser clicada", () => {
    const r = comCliente((c) => {
      c.camadas[0].atributos = [];
    });
    expect(r.success).toBe(false);
  });

  it("recusa aplicação sem camada nenhuma", () => {
    const r = comCliente((c) => {
      c.camadas = [];
    });
    expect(r.success).toBe(false);
  });

  it("recusa coordenada fora do mundo", () => {
    const r = comCliente((c) => {
      c.mapa.centro = [-520, -14.5];
    });
    expect(r.success).toBe(false);
  });
});
