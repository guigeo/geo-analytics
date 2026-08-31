// O `<head>` é a parte da cara que não se vê olhando a aplicação — aba do
// navegador, prévia de link, barra do celular. Foi por aí que o cliente 1 vazou
// para o EB Prime em produção, então o que estes testes guardam é justamente o
// que ninguém confere na tela.
import { describe, expect, it } from "vitest";
import { aplicarIdentidade } from "./identidade";
import { cliente as geoAnalytics } from "@/clientes/geo-analytics";
import { cliente as ebPrime } from "@/clientes/eb-prime";

/** Um documento com o `<head>` como o `index.html` entrega. */
function documentoNovo(): Document {
  const doc = document.implementation.createHTMLDocument("Carregando…");
  const descricao = doc.createElement("meta");
  descricao.setAttribute("name", "description");
  descricao.setAttribute("content", "Mapa interativo do Brasil.");
  doc.head.appendChild(descricao);
  const cor = doc.createElement("meta");
  cor.setAttribute("name", "theme-color");
  cor.setAttribute("content", "#0f1420");
  doc.head.appendChild(cor);
  return doc;
}

function conteudo(doc: Document, nome: string): string | null {
  return doc.head.querySelector(`meta[name="${nome}"]`)?.getAttribute("content") ?? null;
}

describe("identidade no <head>", () => {
  it("põe o nome do cliente no título", () => {
    const doc = documentoNovo();
    aplicarIdentidade(ebPrime.identidade, ebPrime.tema, doc);
    expect(doc.title).toBe("EB Prime");
  });

  it("não deixa o nome de um cliente aparecer na aplicação do outro", () => {
    // A regressão de 2026-08-31, em uma linha: o EB Prime subiu com "Geo
    // Intelligence" na aba porque o `index.html` trazia o cliente 1 cravado.
    const doc = documentoNovo();
    aplicarIdentidade(ebPrime.identidade, ebPrime.tema, doc);
    expect(doc.title).not.toContain("Geo Intelligence");
    expect(conteudo(doc, "description")).not.toContain("Geo Intelligence");

    const outro = documentoNovo();
    aplicarIdentidade(geoAnalytics.identidade, geoAnalytics.tema, outro);
    expect(outro.title).not.toContain("EB Prime");
    expect(conteudo(outro, "description")).not.toContain("EB Prime");
  });

  it("descreve a aplicação com nome e subtítulo do cliente", () => {
    const doc = documentoNovo();
    aplicarIdentidade(ebPrime.identidade, ebPrime.tema, doc);
    expect(conteudo(doc, "description")).toBe("EB Prime — Inteligência Geográfica");
  });

  it("usa o fundo escuro do cliente na barra do navegador", () => {
    const doc = documentoNovo();
    aplicarIdentidade(ebPrime.identidade, ebPrime.tema, doc);
    expect(conteudo(doc, "theme-color")).toBe("#001F33");
  });

  it("deixa a cor da casca para quem não pediu fundo escuro próprio", () => {
    // O cliente 1 não define `escuros`, e a cor do `index.html` é a da casca —
    // não a dele. Sobrescrever aqui mudaria a aparência de quem já está no ar.
    const doc = documentoNovo();
    aplicarIdentidade(geoAnalytics.identidade, geoAnalytics.tema, doc);
    expect(conteudo(doc, "theme-color")).toBe("#0f1420");
  });

  it("cria a meta que faltar, em vez de depender do index.html", () => {
    const doc = document.implementation.createHTMLDocument("");
    aplicarIdentidade(ebPrime.identidade, ebPrime.tema, doc);
    expect(conteudo(doc, "description")).toBe("EB Prime — Inteligência Geográfica");
    expect(conteudo(doc, "theme-color")).toBe("#001F33");
  });
});
