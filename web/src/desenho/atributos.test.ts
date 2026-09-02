import { describe, expect, it } from "vitest";
import { descreverDesenho } from "./atributos";

const BASE = {
  id: "abc",
  nome: "Terreno da esquina",
  tipo: "poligono",
  cor: "#16a34a",
  origem: "desenho",
  criado_em: "2026-09-02T14:30:00+00:00",
};

const rotulos = (props: Record<string, unknown>) => descreverDesenho(props).map((l) => l.rotulo);
const valorDe = (props: Record<string, unknown>, rotulo: string) =>
  descreverDesenho(props).find((l) => l.rotulo === rotulo)?.valor;

describe("os atributos de um desenho", () => {
  it("traduz tipo e origem, em vez de mostrar o nome da coluna", () => {
    expect(valorDe(BASE, "Tipo")).toBe("Área");
    // "carga" é o nome do script, e não diz nada a quem não o conhece.
    expect(valorDe({ ...BASE, origem: "carga" }, "Origem")).toBe("Carregado de arquivo");
  });

  it("campo vazio não vira linha com travessão", () => {
    // Meia dúzia de "—" numa lista curta empurra para fora da tela o que foi preenchido.
    expect(rotulos(BASE)).not.toContain("Categoria");
    expect(rotulos(BASE)).not.toContain("Observação");
    expect(rotulos({ ...BASE, categoria: "  " })).not.toContain("Categoria");
    expect(rotulos({ ...BASE, categoria: "lotes" })).toContain("Categoria");
  });

  it("ponto não ganha linha de área", () => {
    // Um "0 m²" ali seria lido como área medida e igual a zero.
    expect(rotulos({ ...BASE, tipo: "ponto", area_m2: 0 })).not.toContain("Área");
    expect(valorDe({ ...BASE, area_m2: 6878 }, "Área")).toContain("m²");
  });

  it("só o buffer mostra raio", () => {
    expect(rotulos(BASE)).not.toContain("Raio");
    expect(valorDe({ ...BASE, tipo: "buffer", raio_m: 500 }, "Raio")).toBe("500 m");
  });

  it("a data sai em pt-BR e uma data inválida some em vez de virar 'Invalid Date'", () => {
    expect(valorDe(BASE, "Criado em")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(rotulos({ ...BASE, criado_em: "nao e data" })).not.toContain("Criado em");
  });
});
