// A folha injetada é o único ponto onde a configuração vira pixel. Estes testes
// cobrem o que ela precisa escrever, e o que precisa NÃO escrever.
import { describe, expect, it } from "vitest";
import { aplicarTema } from "./tema";
import { cliente as geoAnalytics } from "@/clientes/geo-analytics";
import { cliente as ebPrime } from "@/clientes/eb-prime";

function folhaDe(tema: Parameters<typeof aplicarTema>[0]) {
  const cabeca = document.createElement("head");
  aplicarTema(tema, cabeca);
  return cabeca.querySelector("style")!.textContent!;
}

describe("aplicação do tema", () => {
  it("escreve a marca do cliente nos dois temas", () => {
    const css = folhaDe(ebPrime.tema);
    expect(css).toContain("--primary:#26405F");
    expect(css).toContain("--primary:#7DA8DC");
  });

  it("não escreve neutro nenhum para quem não pediu", () => {
    // O cliente 1 tem que sair daqui com a folha mínima: marca e fonte. Se um
    // `--background` vazar para ele, a aparência em produção muda sem ninguém
    // ter decidido isso.
    const css = folhaDe(geoAnalytics.tema);
    for (const token of ["--background", "--card", "--border", "--radius"]) {
      expect(css, token).not.toContain(token);
    }
  });

  it("traduz um neutro para todos os tokens que ele governa", () => {
    // `cartao` vale para card e popover: se só um mudasse, o menu suspenso
    // ficaria de outra cor que o painel, e isso só apareceria clicando.
    const css = folhaDe(ebPrime.tema);
    expect(css).toContain("--card:#FFFFFF");
    expect(css).toContain("--popover:#FFFFFF");
  });

  it("resolve a fonte pelo catálogo, não pelo que o cliente escreveu", () => {
    const css = folhaDe(ebPrime.tema);
    expect(css).toContain("--fonte-titulo:Montserrat,");
    expect(css).toContain("--fonte-texto:Raleway,");
  });

  it("troca a folha em vez de empilhar uma nova", () => {
    const cabeca = document.createElement("head");
    aplicarTema(geoAnalytics.tema, cabeca);
    aplicarTema(ebPrime.tema, cabeca);
    expect(cabeca.querySelectorAll("style")).toHaveLength(1);
    expect(cabeca.querySelector("style")!.textContent).toContain("#26405F");
  });
});
