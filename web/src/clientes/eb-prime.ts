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
    subtitulo: "Inteligência Geográfica",
  },

  cidadeExemplo: "São Caetano do Sul",

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
    // Selo redondo: a marca dele é circular — o logo e os doze ícones de ficha
    // de imóvel são todos anel fino. Selo quadrado brigaria com ela.
    forma: "circulo",
    // As duas fontes do template que o cliente mandou (TEJ, ThemeForest): o
    // código de lá não serve — Vue 2 e Bootstrap 3 —, mas a direção serve, e é
    // ela que faz esta aplicação parecer irmã do site dele.
    fontes: { titulo: "montserrat", texto: "raleway" },
    // Canto mais duro que o da casca (0.625rem). O template dele é anguloso, e
    // canto duro lê como corporativo — que é o registro de uma imobiliária.
    raio: "0.375rem",
    // Neutros do template: preto, branco e cinza puros, sem viés de matiz. O
    // acento menta de lá (#00d1b2) ficou de fora — briga com o navy da marca.
    claros: {
      fundo: "#F2F2F2",
      cartao: "#FFFFFF",
      texto: "#2B2B2B",
      textoFraco: "#888888",
      borda: "#DDDDDD",
      superficie: "#EDEDED",
    },
    // No escuro entra o segundo azul do material dele, o `#001F33` dos ícones:
    // escuro demais para ser acento, exato como chão.
    escuros: {
      fundo: "#001F33",
      cartao: "#06293F",
      texto: "#E4ECF2",
      textoFraco: "#93A7B5",
      borda: "#103A56",
      superficie: "#0B3149",
    },
  },

  mapa: {
    // O país inteiro, como o cliente 1 — decisão do cliente em 2026-08-30.
    centro: [-52.5, -14.5],
    zoomInicial: 3.5,
  },

  // As áreas do cliente vieram por carga de KMZ, e para ele não são "desenhos": são
  // o acervo dele. Cada categoria dentro dele vira uma camada no painel, e essa lista
  // sai do dado — não há o que declarar aqui.
  acervo: { rotulo: "Áreas EB Prime" },

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
    CATALOGO.zoneamento_sp,
  ],
};
