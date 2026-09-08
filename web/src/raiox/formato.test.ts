import { describe, expect, it } from "vitest";
import { compararComMunicipio } from "./formato";

describe("compararComMunicipio", () => {
  it("não afirma diferença dentro da faixa morta", () => {
    // 1,4% acima é ruído do rateio. Escrever "acima da média" para isso seria dar
    // significado a um decimal que o método não sustenta.
    expect(compararComMunicipio(1014, 1000).sentido).toBe("igual");
  });

  it("diz a direção quando a diferença é real", () => {
    expect(compararComMunicipio(1300, 1000)).toMatchObject({ sentido: "acima" });
    expect(compararComMunicipio(700, 1000)).toMatchObject({ sentido: "abaixo" });
  });

  it("usa múltiplo quando a diferença passa de 100%", () => {
    expect(compararComMunicipio(2300, 1000).texto).toContain("×");
  });

  it("sem referência municipal não inventa comparação", () => {
    expect(compararComMunicipio(1000, null).sentido).toBe("indisponivel");
    expect(compararComMunicipio(null, 1000).sentido).toBe("indisponivel");
    expect(compararComMunicipio(1000, 0).sentido).toBe("indisponivel");
  });
});
