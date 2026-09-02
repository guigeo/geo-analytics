import { describe, expect, it } from "vitest";
import {
  comRaio,
  comVertice,
  criarEstadoDesenho,
  DESENHO_OCIOSO,
  faltam,
  geometriaParaSalvar,
  semUltimoVertice,
  tracadoParaDesenhar,
} from "./estado";
import type { Coordenada } from "./geometria";

const A: Coordenada = [-46.66, -23.57];
const B: Coordenada = [-46.65, -23.57];
const C: Coordenada = [-46.65, -23.56];
const D: Coordenada = [-46.66, -23.56];

describe("criarEstadoDesenho", () => {
  it("sem modo, fica ocioso", () => {
    expect(criarEstadoDesenho(null)).toEqual(DESENHO_OCIOSO);
  });

  it("recém-ativado não acusa impedimento", () => {
    // Avisar antes do primeiro clique seria repreender quem ainda não fez nada.
    const e = criarEstadoDesenho("poligono");
    expect(e.impedimento).toBeNull();
    expect(e.completo).toBe(false);
  });

  it("acusa impedimento depois do primeiro clique", () => {
    expect(criarEstadoDesenho("poligono", [A]).impedimento).toMatch(/pelo menos/);
  });
});

describe("comVertice", () => {
  it("no polígono, acumula", () => {
    const e = [A, B, C].reduce(comVertice, criarEstadoDesenho("poligono"));
    expect(e.coordenadas).toEqual([A, B, C]);
    expect(e.completo).toBe(true);
  });

  it("no ponto, SUBSTITUI em vez de acumular", () => {
    // Um ponto tem um lugar só: quem clicou de novo está corrigindo, não desenhando.
    const e = [A, B].reduce(comVertice, criarEstadoDesenho("ponto"));
    expect(e.coordenadas).toEqual([B]);
    expect(e.completo).toBe(true);
  });

  it("ignora clique sem modo ativo", () => {
    expect(comVertice(DESENHO_OCIOSO, A)).toEqual(DESENHO_OCIOSO);
  });
});

describe("semUltimoVertice", () => {
  it("desfaz o último clique", () => {
    const e = [A, B, C].reduce(comVertice, criarEstadoDesenho("poligono"));
    const desfeito = semUltimoVertice(e);
    expect(desfeito.coordenadas).toEqual([A, B]);
    expect(desfeito.completo).toBe(false);
  });

  it("desfazer sem vértice nenhum não quebra", () => {
    const vazio = criarEstadoDesenho("poligono");
    expect(semUltimoVertice(vazio)).toEqual(vazio);
  });

  it("volta a ficar válido ao desfazer o vértice que cruzava", () => {
    // A ordem A, C, B, D é a gravata: o contorno se cruza. Desfazer o último deixa
    // um triângulo, que é válido — é o caminho que a pessoa percorre ao errar um
    // clique, e a razão de `desfazer` existir.
    const gravata = [A, C, B, D].reduce(comVertice, criarEstadoDesenho("poligono"));
    expect(gravata.impedimento).toMatch(/cruza/i);
    expect(gravata.completo).toBe(false);

    const desfeito = semUltimoVertice(gravata);
    expect(desfeito.impedimento).toBeNull();
    expect(desfeito.completo).toBe(true);
  });
});

describe("geometriaParaSalvar", () => {
  it("não entrega geometria de traçado incompleto", () => {
    expect(geometriaParaSalvar(comVertice(criarEstadoDesenho("poligono"), A))).toBeNull();
  });

  it("entrega o polígono quando fecha", () => {
    const e = [A, B, C].reduce(comVertice, criarEstadoDesenho("poligono"));
    expect((geometriaParaSalvar(e) as GeoJSON.Polygon).type).toBe("Polygon");
  });
});

describe("faltam", () => {
  it("conta quantos vértices faltam", () => {
    expect(faltam(criarEstadoDesenho("poligono"))).toBe(3);
    expect(faltam(comVertice(criarEstadoDesenho("poligono"), A))).toBe(2);
    expect(faltam([A, B, C].reduce(comVertice, criarEstadoDesenho("poligono")))).toBe(0);
  });
});

describe("comRaio", () => {
  it("guarda o raio sem perder o traçado", () => {
    const e = comRaio(comVertice(criarEstadoDesenho("buffer"), A), 500);
    expect(e.raioM).toBe(500);
    expect(e.coordenadas).toEqual([A]);
  });
});

describe("o buffer no estado do traçado", () => {
  const CENTRO: Coordenada = [-46.6333, -23.5505];

  it("um segundo clique move o centro em vez de acrescentar outro", () => {
    const outro: Coordenada = [-46.64, -23.55];
    const estado = comVertice(comVertice(criarEstadoDesenho("buffer"), CENTRO), outro);
    expect(estado.coordenadas).toEqual([outro]);
  });

  it("com centro mas sem raio não dá para salvar, e o painel diz o quê", () => {
    const estado = comVertice(criarEstadoDesenho("buffer"), CENTRO);
    expect(estado.completo).toBe(false);
    expect(estado.impedimento).toContain("raio");
    expect(geometriaParaSalvar(estado)).toBeNull();
  });

  it("o que vai ao servidor é o CENTRO, não o círculo", () => {
    // O círculo definitivo é gerado pelo PostGIS; mandar o daqui faria o servidor
    // guardar a aproximação em vez de calcular a boa.
    const estado = comRaio(comVertice(criarEstadoDesenho("buffer"), CENTRO), 500);
    expect(estado.completo).toBe(true);
    expect(geometriaParaSalvar(estado)).toEqual({ type: "Point", coordinates: CENTRO });
  });

  it("o traçado desenha UM vértice e um anel de 64 pontos", () => {
    // A separação existe por isto: bolinha em cada ponto do círculo sugeriria que dá
    // para arrastá-los, e não dá — quem os move é o campo de raio.
    const { vertices, anel } = tracadoParaDesenhar(
      comRaio(comVertice(criarEstadoDesenho("buffer"), CENTRO), 500),
    );
    expect(vertices).toEqual([CENTRO]);
    expect(anel).toHaveLength(64);
  });

  it("sem raio ainda não há anel para desenhar", () => {
    const { vertices, anel } = tracadoParaDesenhar(
      comVertice(criarEstadoDesenho("buffer"), CENTRO),
    );
    expect(vertices).toEqual([CENTRO]);
    expect(anel).toBeNull();
  });

  it("trocar de modo larga o raio junto", () => {
    // Um raio sobrevivente faria a próxima área desenhada parecer pronta para salvar
    // por um motivo que não está na tela.
    const buffer = comRaio(comVertice(criarEstadoDesenho("buffer"), CENTRO), 500);
    expect(criarEstadoDesenho("poligono", buffer.coordenadas).raioM).toBeNull();
  });
});
