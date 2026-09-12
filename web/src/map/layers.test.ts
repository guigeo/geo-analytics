// Rede de segurança das camadas.
//
// Estes testes existem por um motivo datado: o passo 5 do ADR-0001 do `webgis`
// tirou a lista de camadas de `layers.ts` e a moveu para a configuração de cada
// cliente, na fase 1 do plano de derivação. A tradução de camada para
// especificação do MapLibre — `camadasDoMapa` e `fontesDeDados` — não podia
// mudar nesse caminho, e é o snapshot no fim deste arquivo que provou isso: ele
// foi escrito ANTES da mudança e passou sem ser reescrito depois.
import { describe, expect, it } from "vitest";
import {
  camadasDoMapa,
  expressaoDeCorNumerica,
  fontesDeDados,
  IDS_CLICAVEIS,
  SUFIXOS_SUBCAMADA,
  temaDaCamada,
} from "./layers";
import { camadas } from "@/configuracao";

describe("contrato das camadas", () => {
  it("não repete id", () => {
    const ids = camadas.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declara sourceLayer e rótulo em todas", () => {
    for (const c of camadas) {
      expect(c.camadaFonte, `camada ${c.id}`).toBeTruthy();
      expect(c.rotulo, `camada ${c.id}`).toBeTruthy();
    }
  });

  it("usa só geometrias conhecidas", () => {
    for (const c of camadas) {
      expect(["poligono", "linha", "ponto"]).toContain(c.geometria);
    }
  });

  it("expõe todos os ids base como clicáveis", () => {
    expect(IDS_CLICAVEIS).toEqual(camadas.map((c) => c.id));
  });
});

describe("fontes", () => {
  it("gera uma fonte vetorial por camada", () => {
    const fontes = fontesDeDados();
    expect(Object.keys(fontes).sort()).toEqual(camadas.map((c) => c.id).sort());
    for (const [id, fonte] of Object.entries(fontes)) {
      expect(fonte.type, `fonte ${id}`).toBe("vector");
      expect((fonte as { url: string }).url, `fonte ${id}`).toMatch(/^pmtiles:\/\/.+\.pmtiles$/);
    }
  });
});

describe("camadas do mapa", () => {
  it("usa match para a camada categórica e neutro para o que não é zona", () => {
    const zoneamento = camadasDoMapa().find((camada) => camada.id === "zoneamento_sp");
    const pintura = zoneamento?.paint as { "fill-color"?: unknown } | undefined;
    expect(pintura?.["fill-color"]).toEqual(
      expect.arrayContaining(["match", ["get", "COD_ZONA"], "#94a3b8"]),
    );
  });

  it("interpola a contagem H3 até o teto medido da legenda", () => {
    const h3 = camadasDoMapa().find((camada) => camada.id === "h3_domicilios");
    const pintura = h3?.paint as { "fill-color"?: unknown } | undefined;
    expect(pintura?.["fill-color"]).toEqual([
      "interpolate",
      ["linear"],
      ["to-number", ["get", "DOM_APARTAMENTO"], 0],
      0,
      "#eff6ff",
      820,
      "#1d4ed8",
    ]);
  });

  it("só referencia fonte declarada", () => {
    const fontes = new Set(Object.keys(fontesDeDados()));
    for (const spec of camadasDoMapa()) {
      expect(fontes, `camada ${spec.id}`).toContain((spec as { source: string }).source);
    }
  });

  it("respeita a convenção de sufixo das sub-camadas", () => {
    // A lista de sufixos sai de SUFIXOS_SUBCAMADA, e não de uma cópia aqui: é ela que
    // o MapView percorre para acender a camada inteira, então sub-camada que não
    // esteja lá seria justamente a que nunca acende.
    const base = new Set(camadas.map((c) => c.id));
    const sufixos = SUFIXOS_SUBCAMADA.filter(Boolean);
    for (const spec of camadasDoMapa()) {
      const sufixo = sufixos.find((s) => spec.id.endsWith(s));
      const raiz = sufixo ? spec.id.slice(0, -sufixo.length) : spec.id;
      expect(base, `camada ${spec.id}`).toContain(raiz);
    }
  });

  it("põe os rótulos depois dos preenchimentos", () => {
    const especificacoes = camadasDoMapa();
    const primeiroRotulo = especificacoes.findIndex((s) => s.id.endsWith("__label"));
    const ultimoNaoRotulo = especificacoes.map((s) => s.id.endsWith("__label")).lastIndexOf(false);
    expect(primeiroRotulo).toBeGreaterThan(ultimoNaoRotulo);
  });

  it("nasce com a visibilidade que a camada declara", () => {
    const porId = new Map(camadasDoMapa().map((s) => [s.id, s]));
    for (const c of camadas) {
      const esperada = "none";
      expect(porId.get(c.id)?.layout?.visibility, `camada ${c.id}`).toBe(esperada);
    }
  });
});

// A prova do refactor. Reescrever este snapshot só se a mudança de saída for
// intencional e estiver explicada no commit.
describe("saída congelada", () => {
  it("mantém as fontes", () => {
    expect(fontesDeDados()).toMatchSnapshot();
  });

  it("linha com tracejado sai tracejada, e de ponta reta", () => {
    // O mesmo campo que desenha os dormentes na legenda do painel: se um dia ele
    // parar de chegar aqui, a legenda passa a prometer o que o mapa não faz.
    const ferrovias = camadasDoMapa().find((camada) => camada.id === "ferrovias");
    expect(ferrovias).toBeDefined();
    expect(ferrovias).toHaveProperty(["paint", "line-dasharray"], [1, 1]);
    expect(ferrovias).toHaveProperty(["layout", "line-cap"], "butt");

    const rodovias = camadasDoMapa().find((camada) => camada.id === "rodovias");
    expect(rodovias?.paint).not.toHaveProperty("line-dasharray");
  });

  it("a rodovia ganha a faixa central, e ela só aparece de perto", () => {
    const faixa = camadasDoMapa().find((camada) => camada.id === "rodovias__faixa");
    expect(faixa).toBeDefined();
    expect(faixa).toHaveProperty(["paint", "line-color"], "#ffffff");
    expect(faixa).toHaveProperty(["paint", "line-dasharray"], [2, 2]);
    // Sem o minzoom, a divisória viraria sujeira dentro de um traço de um pixel.
    expect(faixa).toHaveProperty("minzoom", 9);
    // Nasce apagada como toda camada: quem acende é o painel.
    expect(faixa?.layout?.visibility).toBe("none");
    // E ela é sub-camada: o toggle do painel alcança pelo sufixo.
    expect(SUFIXOS_SUBCAMADA).toContain("__faixa");
  });

  it("a camada de temas nasce pintando o primeiro deles", () => {
    // O style e o estado inicial do App têm de concordar: se divergirem, a legenda
    // diz uma variável e o mapa pinta outra até a primeira troca.
    const h3 = camadas.find((c) => c.temasNumericos)!;
    const spec = camadasDoMapa().find((s) => s.id === h3.id);
    expect(spec).toHaveProperty(
      ["paint", "fill-color"],
      expressaoDeCorNumerica(h3.temasNumericos![0]),
    );
  });

  it("uma camada por malha, e não uma por variável", () => {
    // AT-007: a alternativa descartada (uma camada por tema) apareceria aqui como
    // três ids de h3 no style, e três linhas no painel.
    const h3 = camadas.find((c) => c.temasNumericos)!;
    const ids = camadasDoMapa().map((s) => s.id);
    expect(ids.filter((id) => id === h3.id)).toHaveLength(1);
    // Nenhum id carrega o nome de um tema — o contorno (`__outline`) é sub-camada da
    // malha, e continua sendo uma só para as três variáveis.
    for (const tema of h3.temasNumericos!) {
      expect(ids.some((id) => id.includes(tema.id))).toBe(false);
    }
    expect(h3.temasNumericos!.length).toBeGreaterThan(1);
  });

  it("cada tema tem a sua expressão, com o campo e o teto dele", () => {
    const h3 = camadas.find((c) => c.temasNumericos)!;
    for (const tema of h3.temasNumericos!) {
      const expr = expressaoDeCorNumerica(tema) as unknown[];
      expect(expr).toContain(tema.corFinal);
      expect(expr).toContain(tema.maximo);
      expect(JSON.stringify(expr)).toContain(tema.campo);
    }
  });

  it("id de tema que não existe mais cai no primeiro, e não deixa a camada sem cor", () => {
    const h3 = camadas.find((c) => c.temasNumericos)!;
    expect(temaDaCamada(h3, "variavel_que_saiu_do_catalogo")).toEqual(h3.temasNumericos![0]);
    expect(temaDaCamada(h3, undefined)).toEqual(h3.temasNumericos![0]);
    const semTema = camadas.find((c) => !c.temasNumericos)!;
    expect(temaDaCamada(semTema, "qualquer")).toBeNull();
  });

  it("mantém as camadas", () => {
    expect(camadasDoMapa()).toMatchSnapshot();
  });
});
