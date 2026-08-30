/**
 * Cliente 2 — EB Prime, imobiliária.
 *
 * A cara e o recorte vieram do cliente em 2026-08-30: logo oficial, domínio
 * `ebprime.com.br`, o Brasil inteiro no mapa e as camadas do cliente 1 menos as
 * antenas de telefonia. O que ainda é escolha minha, e está marcado onde
 * aparece, são as três sugestões do chat.
 *
 * Tudo o que difere do cliente 1 está neste arquivo. Nenhum `.tsx` sabe que o
 * EB Prime existe.
 */
import { CATALOGO, com } from "@/configuracao/catalogo";
import type { ConfiguracaoCliente } from "@/configuracao/esquema";

export const cliente: ConfiguracaoCliente = {
  id: "eb-prime",

  identidade: {
    nome: "EB Prime",
    subtitulo: "Inteligência geográfica · imóveis",
  },

  tema: {
    // Medida no núcleo do traço do logo oficial, não estimada de olho. O outro
    // material do cliente — os ícones de ficha de imóvel — usa um segundo azul,
    // `#001F33`; são dois azuis distintos, e o do logo é o que vale.
    marca: "#26405F",
    // O navy da marca sobre o fundo escuro da aplicação dá 1,8:1 e some. Esta é
    // a mesma matiz clareada até a luminosidade que a primária escura já usava:
    // 7,7:1 sobre aquele fundo.
    marcaEscura: "#7DA8DC",
    // O símbolo, vetorizado do logo que o cliente mandou e conferido contra ele
    // por rasterização: 98,98% de sobreposição. Só o símbolo, sem o "EB PRIME"
    // escrito — no cabeçalho o nome já aparece ao lado, e repetir vira ruído.
    //
    // O anel é arco aberto, e não círculo inteiro coberto pelas silhuetas,
    // justamente para o desenho não depender de preenchimento branco: assim o
    // mesmo arquivo serve navy sobre claro e branco sobre navy.
    simbolo: {
      viewBox: "0 0 318.51 306.97",
      espessura: 9.55,
      tracos: [
        { d: "M96.09 300.23A154.48 154.48 0 1 1 222.47 300.22" },
        { d: "M138.19 306.97V48.67L222.47 119.67V306.97", aparado: true },
        { d: "M176.72 306.97V115.75L96.09 173.47V306.97", aparado: true },
      ],
      apara: { cx: 159.26, cy: 159.26, r: 159.26 },
    },
  },

  mapa: {
    // O país inteiro, como o cliente 1 — decisão do cliente em 2026-08-30.
    centro: [-52.5, -14.5],
    zoomInicial: 3.5,
  },

  chat: {
    habilitado: true,
    // A cidade da primeira sugestão é decisão do Gui em 2026-08-30. Ela é o que
    // a pessoa lê antes de saber o que perguntar, então não é enfeite.
    sugestoes: [
      "Qual a renda média por setor censitário de São Caetano do Sul?",
      "Quais bairros têm maior renda média?",
      "Quantos domicílios tem este município?",
    ],
  },

  // As camadas do cliente 1 menos as antenas de telefonia, que não dizem nada
  // sobre imóvel. Rodovias e ferrovias ficam: acesso e ruído são argumento de
  // venda. Nenhuma nasce ligada — quem usa escolhe o nível ao entrar.
  camadas: [
    CATALOGO.uf,
    CATALOGO.municipio,
    CATALOGO.distrito,
    CATALOGO.bairro,
    com(CATALOGO.setor, { cor: "#1f6f8b" }),
    CATALOGO.rodovias,
    CATALOGO.ferrovias,
  ],
};
