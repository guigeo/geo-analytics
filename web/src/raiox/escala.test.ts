import { describe, expect, it } from "vitest";
import { escalaDe, SEM_VALOR, TONS } from "./escala";

describe("escalaDe", () => {
  it("distribui o intervalo observado nos cinco tons", () => {
    const escala = escalaDe([100, 200, 300, 400, 500]);
    expect(escala.minimo).toBe(100);
    expect(escala.maximo).toBe(500);
    expect(escala.cor(100)).toBe(TONS[0]);
    expect(escala.cor(500)).toBe(TONS[TONS.length - 1]);
  });

  it("desenho homogêneo ganha um tom só, e o do meio", () => {
    // Pintar tudo do tom mais escuro diria "tudo alto", que não é o que o dado diz —
    // e é justamente o caso em que a escala global mentiria.
    const escala = escalaDe([300, 300, 300]);
    expect(escala.cor(300)).toBe(TONS[Math.floor(TONS.length / 2)]);
  });

  it("setor sem valor não é setor de valor zero", () => {
    const escala = escalaDe([100, 500]);
    expect(escala.cor(null)).toBe(SEM_VALOR);
    expect(escala.cor(undefined)).toBe(SEM_VALOR);
  });

  it("lista vazia não quebra a legenda", () => {
    const escala = escalaDe([]);
    expect(escala.minimo).toBe(0);
    expect(escala.maximo).toBe(0);
    expect(escala.cortes).toHaveLength(TONS.length);
  });
});
