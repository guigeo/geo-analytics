// A lista de novidades é conteúdo, e conteúdo não tem compilador. Estas asserções
// são o que substitui um: elas guardam as três regras que o módulo declara e que,
// quebradas, falham CALADAS — o aviso simplesmente não aparece.
import { describe, expect, it } from "vitest";
import { NOVIDADES, maisRecente } from "./novidades";

describe("NOVIDADES", () => {
  it("tem pelo menos uma", () => {
    expect(NOVIDADES.length).toBeGreaterThan(0);
  });

  it("os ids são únicos", () => {
    // O id é a chave de "já lida" no localStorage. Repetido, uma novidade nasce
    // marcada como vista por causa de outra.
    const ids = NOVIDADES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a primeira é a mais recente", () => {
    // A ordem é o contrato do módulo: `maisRecente()` devolve NOVIDADES[0], e é o
    // id dela que decide se há algo não lido.
    const datas = NOVIDADES.map((n) => n.data);
    expect([...datas].sort().reverse()).toEqual(datas);
    expect(maisRecente()).toBe(NOVIDADES[0]);
  });

  it("toda data é ISO", () => {
    for (const n of NOVIDADES) {
      expect(n.data, `novidade ${n.id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("chip sem pergunta não existe", () => {
    // O chat só monta o chip quando os DOIS existem (`ChatPanel`, CHIPS). Um chip
    // sozinho não vira nada e ninguém percebe — é a falha calada que este teste pega.
    for (const n of NOVIDADES) {
      if (n.chip) expect(n.pergunta, `novidade ${n.id}`).toBeTruthy();
    }
  });

  it("título e texto não vêm vazios", () => {
    for (const n of NOVIDADES) {
      expect(n.titulo.trim(), `novidade ${n.id}`).not.toBe("");
      expect(n.texto.trim(), `novidade ${n.id}`).not.toBe("");
    }
  });
});
