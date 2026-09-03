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
