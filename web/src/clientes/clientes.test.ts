// O critério de saída da fase 2, escrito como teste: a mesma base produz duas
// aplicações diferentes, e o recorte de camadas de um cliente não tem efeito
// nenhum sobre o outro.
import { describe, expect, it } from "vitest";
import { cliente as geoAnalytics } from "./geo-analytics";
import { cliente as ebPrime } from "./eb-prime";
import { CATALOGO } from "@/configuracao/catalogo";

const ids = (c: { camadas: { id: string }[] }) => c.camadas.map((camada) => camada.id);

describe("os dois clientes", () => {
  it("têm identidades diferentes", () => {
    expect(geoAnalytics.id).not.toBe(ebPrime.id);
    expect(geoAnalytics.identidade.nome).not.toBe(ebPrime.identidade.nome);
  });

  it("enxergam recortes diferentes do catálogo", () => {
    expect(ids(geoAnalytics)).not.toEqual(ids(ebPrime));
  });

  it("só escolhem camada que existe no catálogo", () => {
    const doCatalogo = new Set(Object.keys(CATALOGO));
    for (const c of [geoAnalytics, ebPrime]) {
      for (const id of ids(c)) {
        expect(doCatalogo, `cliente ${c.id}`).toContain(id);
      }
    }
  });

  it("o cliente 1 enxerga o catálogo inteiro", () => {
    expect(ids(geoAnalytics).sort()).toEqual(Object.keys(CATALOGO).sort());
  });

  it("tirar camada de um cliente não tira do outro", () => {
    // Decisão do cliente em 2026-08-30: as camadas do cliente 1 menos as
    // antenas de telefonia. É esta linha que prova que o recorte é por cliente,
    // e não uma edição na lista global.
    expect(ids(ebPrime)).not.toContain("antenas");
    expect(ids(geoAnalytics)).toContain("antenas");
    for (const presente of ["rodovias", "ferrovias"]) {
      expect(ids(ebPrime)).toContain(presente);
    }
  });

  it("o EB Prime traz símbolo próprio e o cliente 1 não", () => {
    // O que a fase 4 mudou: a marca virou dado. Se um dia o cabeçalho precisar
    // de um `if` por cliente, é aqui que a regressão aparece.
    expect(ebPrime.tema.simbolo).toBeDefined();
    expect(geoAnalytics.tema.simbolo).toBeUndefined();
  });

  it("cada cliente traz a própria cidade de exemplo", () => {
    // A novidade da classe social monta a pergunta de demonstração com esta
    // cidade. Cravada em `lib/`, ela seria conteúdo de um cliente dentro do
    // código compartilhado.
    expect(geoAnalytics.cidadeExemplo).toBe("Curitiba");
    expect(ebPrime.cidadeExemplo).toBe("São Caetano do Sul");
  });

  it("as duas aplicações têm cara diferente, e não só cor diferente", () => {
    // O critério que interessa: tipografia, forma do selo e neutros. Sem isto,
    // derivar cliente novo é repintar a mesma tela.
    expect(ebPrime.tema.fontes).not.toEqual(geoAnalytics.tema.fontes);
    expect(ebPrime.tema.forma).not.toBe(geoAnalytics.tema.forma);
    expect(ebPrime.tema.claros).toBeDefined();
    expect(ebPrime.tema.escuros).toBeDefined();
  });

  it("o cliente 1 não redefine neutro nenhum", () => {
    // É o que garante que ele continua com a aparência do `styles.css`, que é a
    // que está em produção. Neutro definido aqui seria mudança silenciosa.
    expect(geoAnalytics.tema.claros).toBeUndefined();
    expect(geoAnalytics.tema.escuros).toBeUndefined();
    expect(geoAnalytics.tema.raio).toBeUndefined();
  });

  it("o cliente 1 mantém a cor que tinha antes da fase 4", () => {
    // A migração do cliente 1 para o mecanismo novo não podia mexer num pixel:
    // estes dois valores são os tokens `--primary` que o styles.css já usava.
    expect(geoAnalytics.tema.marca).toBe("oklch(0.55 0.2 257)");
    expect(geoAnalytics.tema.marcaEscura).toBe("oklch(0.72 0.15 230)");
  });

  it("nenhum cliente consegue nascer com camada ligada", () => {
    // Pedido do Gui em 2026-08-29 e virado regra da casca em 2026-09-02: quem usa
    // escolhe o nível ao entrar, em vez de achar o mapa já com município desenhado
    // por cima. Antes era um campo que cada cliente punha em `false`; hoje o campo
    // não existe, e é isto que esta asserção guarda — se ele voltar, alguém pode
    // pôr `true` e o teste antigo, que só olhava um cliente, não veria.
    for (const c of [...geoAnalytics.camadas, ...ebPrime.camadas]) {
      expect(c, `camada ${c.id}`).not.toHaveProperty("visivelPorPadrao");
    }
  });

  it("ajuste de cliente não vaza para o catálogo", () => {
    // O EB Prime repinta o setor. O catálogo — e portanto o cliente 1 — precisa
    // continuar com a cor original: `com()` copia, não muda no lugar.
    const setorDele = ebPrime.camadas.find((c) => c.id === "setor");
    expect(setorDele?.cor).toBe("#1f6f8b");
    expect(CATALOGO.setor.cor).toBe("#e08a3c");
    expect(geoAnalytics.camadas.find((c) => c.id === "setor")?.cor).toBe("#e08a3c");
  });
});
