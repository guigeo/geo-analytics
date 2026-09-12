/**
 * Novidades da aplicação — CONTEÚDO, não código.
 *
 * Cada novidade é um dado desta lista; os componentes só sabem renderizar. Isto
 * é de propósito: a casca é derivada por cliente (ver `webgis/docs/adr/0001-*`),
 * e changelog escrito em JSX seria conteúdo de um cliente dentro de código
 * compartilhado — a regra 1 do ADR. Anunciar feature nova é uma entrada aqui.
 *
 * A ORDEM IMPORTA: o primeiro item é o mais recente, e é o `id` dele que decide
 * se existe algo não lido.
 *
 * Quando uma novidade precisar de cidade de exemplo na `pergunta`, ela vem de
 * `configuracao.cidadeExemplo` — cravar uma aqui seria pôr o conteúdo de um cliente
 * dentro do código que todos compartilham. Nenhuma das entradas atuais precisa.
 */
export interface Novidade {
  /** Estável e único. É o que fica guardado como "já lido" — nunca reaproveitar. */
  id: string;
  /** ISO (aaaa-mm-dd); exibida como dd/mm. */
  data: string;
  titulo: string;
  texto: string;
  /** A pergunta que o botão dispara no chat. Sem ela, o item é só aviso. */
  pergunta?: string;
  /** Versão curta para o chip do chat. Sem ele, a novidade não vira sugestão. */
  chip?: string;
}

export const NOVIDADES: Novidade[] = [
  {
    id: "raio-x-da-area-2026-09",
    data: "2026-09-12",
    titulo: "Raio-X da área, em uma página",
    texto:
      "Qualquer área do seu acervo agora gera um diagnóstico completo: população, " +
      "domicílios e densidade; a renda e o tamanho das famílias; a classe social " +
      "estimada; e o zoneamento que incide ali. O bloco que muda a conversa é o " +
      "Contraste interno — em vez de uma média só, ele mostra a diferença ENTRE as " +
      "partes da sua área, que é onde mora a decisão. Tudo sem IA no meio: os números " +
      "vêm do cálculo, então a mesma área dá sempre a mesma resposta, e cada bloco diz " +
      "de onde veio e o que não sabe. Dá para imprimir a página inteira e levar para a " +
      "reunião. Abra pelo seu acervo, na ação Raio-X de uma área.",
    // Sem `pergunta`: o Raio-X parte de uma área DESENHADA, e num acervo vazio o chip
    // responderia "não achei" — o mesmo motivo da novidade do acervo, mais abaixo.
  },
  {
    id: "malha-h3-2026-09",
    data: "2026-09-07",
    titulo: "O mapa em hexágonos do mesmo tamanho",
    texto:
      "Uma camada nova mostra quantos domicílios são apartamento em cada hexágono de " +
      "0,1 km² — 68 mil deles, cobrindo os 37 municípios da Grande São Paulo. A cor vai do " +
      "claro ao escuro conforme o número, a legenda diz o que cada tom vale, e clicar num " +
      "hexágono abre casas, apartamentos, total e a qualidade da localização dos endereços. " +
      "A vantagem sobre o setor censitário é a comparação: como todo hexágono tem o mesmo " +
      "tamanho, cor mais escura significa mesmo mais densidade. Fora da Grande São Paulo a " +
      "camada não tem dado, e diz isso em vez de mostrar vazio.",
    // A cidade é cravada, e não vem de `configuracao.cidadeExemplo`, de propósito: a
    // cobertura desta camada é REGIONAL (37 municípios), enquanto a cidade de exemplo é do
    // cliente — a do cliente 1 é Curitiba, que está fora, e o chip responderia "não há dado
    // aí". Cravar vale aqui porque a pergunta demonstra a COBERTURA da camada, não o
    // negócio de um cliente; numa pergunta do Censo, que funciona em todo o Brasil, a
    // cidade continua tendo de vir da configuração.
    pergunta: "Quantos apartamentos tem no centro de São Caetano do Sul?",
    chip: "Apartamentos em São Caetano",
  },
  {
    id: "zoneamento-sp-2026-09",
    data: "2026-09-06",
    titulo: "Zoneamento da cidade de São Paulo",
    texto:
      "As zonas de uso do solo da cidade de São Paulo entraram no menu de camadas, com o " +
      "nome da zona e a lei que a define. Clique numa zona para ver os detalhes, ou pergunte " +
      "ao agente qual zona vale num endereço. A cobertura é a cidade de São Paulo — outras " +
      "cidades da região, como São Caetano do Sul, têm a própria lei e não estão aqui.",
    // O NÚMERO no endereço não é enfeite. Medido em 2026-09-12: a coordenada do eixo da
    // Avenida Paulista cai em "Praça/Canteiro" — uma das 10.714 feições com `e_zona =
    // false`, sem nome de zona —, e o chip demonstraria a camada respondendo "canteiro".
    // Com número, o geocoding resolve dentro da quadra e a resposta é ZEU, Zona Eixo de
    // Estruturação da Transformação Urbana. Vale para qualquer avenida larga: demonstração
    // de zoneamento pede endereço com número.
    pergunta: "Qual é o zoneamento da Avenida Paulista, 1578, em São Paulo?",
    chip: "Zoneamento da Paulista",
  },
  {
    id: "classe-social-2026-09",
    data: "2026-09-03",
    titulo: "Classe social, agora no chat",
    texto:
      "O chat agora estima a distribuição das classes A, B, C e DE em municípios, " +
      "distritos, bairros e setores. É uma estimativa própria a partir do Censo 2022: " +
      "o IBGE não publica essa classificação.",
    pergunta: "Quais são os 10 municípios com maior porcentagem de domicílios na classe A?",
    chip: "Top 10 classe A",
  },
  {
    id: "tela-cheia-2026-09",
    data: "2026-09-03",
    titulo: "Mais mapa, quando você quiser",
    texto:
      "Cada painel lateral recolhe num clique, e o botão de tela cheia no topo some " +
      "com os dois de uma vez — fica só o mapa. As bordas dos painéis também " +
      "arrastam, se você quiser mais espaço só de um lado. Nada se perde ao voltar: " +
      "a conversa do chat e o que estava aberto continuam onde estavam.",
  },
  {
    id: "acervo-camadas-2026-09",
    data: "2026-09-03",
    titulo: "Suas áreas viram camadas do mapa",
    texto:
      "O que você desenha — e o que já estiver no seu acervo — aparece agora no " +
      "menu de camadas, num grupo com o seu nome. Cada área tem a própria chave " +
      "para mostrar ou esconder, e clicar no nome voa até ela. O agente também " +
      "responde sobre uma área: pergunte pelo nome dela e ele cruza com o Censo.",
    // Sem `pergunta`: a demonstração exigiria o nome de uma área que existe, e ele
    // muda de cliente para cliente — num acervo vazio o chip responderia "não achei",
    // que é o oposto de demonstrar. O mesmo motivo da medição, por outro caminho.
  },
  {
    id: "painel-arvore-2026-09",
    data: "2026-09-03",
    titulo: "O menu de camadas virou árvore",
    texto:
      "As camadas agora ficam agrupadas por tema, e tudo começa recolhido e " +
      "desligado: você abre só o assunto que quer, em vez de procurar numa lista " +
      "de oito interruptores apagados.",
  },
  {
    id: "mapa-livre-2026-09",
    data: "2026-09-03",
    titulo: "O mapa ficou livre",
    texto:
      "Nada mais fica pousado por cima dele. Os atributos aparecem num balão na " +
      "própria feição que você clicou, e as ferramentas de desenho — junto com o " +
      "formulário de salvar — saíram do mapa para a barra de cima e para o painel.",
  },
];

// Duas chaves, não uma: "já vi" e "já abriu sozinho" são fatos diferentes. Com
// uma só, quem ignora a abertura automática perde o aviso para sempre.
const CHAVE_LIDA = "geo:novidades:lida";
const CHAVE_AUTO = "geo:novidades:auto";

// Em janela anônima — ou com dados de site bloqueados — o acesso LANÇA, não
// devolve null. Sem o try, um aviso de novidade derruba a aplicação inteira.
function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function escrever(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Segue sem lembrar: reabrir o aviso é bem menos grave do que quebrar.
  }
}

export const maisRecente = (): Novidade | undefined => NOVIDADES[0];

/** Há novidade que o usuário ainda não marcou como vista? */
export function haNaoLida(): boolean {
  const nova = maisRecente();
  return nova !== undefined && ler(CHAVE_LIDA) !== nova.id;
}

export function marcarLidas(): void {
  const nova = maisRecente();
  if (nova) escrever(CHAVE_LIDA, nova.id);
}

/**
 * O painel deve se abrir sozinho agora?
 *
 * Só na primeira vez que esta novidade aparece para este navegador. Abrir a cada
 * refresh vira ruído, e ruído se aprende a ignorar — que é exatamente o que o
 * aviso existe para evitar.
 */
export function deveAbrirSozinho(): boolean {
  const nova = maisRecente();
  return nova !== undefined && ler(CHAVE_AUTO) !== nova.id && haNaoLida();
}

export function marcarAutoAberto(): void {
  const nova = maisRecente();
  if (nova) escrever(CHAVE_AUTO, nova.id);
}
