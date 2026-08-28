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
    id: "classe-social-2026-08",
    data: "2026-08-27",
    titulo: "Classe social por bairro, distrito e setor",
    // "Estimativa" não é modéstia, é a mesma ressalva que a tool devolve em toda
    // resposta (`agent/.../tools.py`, `_avisos_classe_social`). Anunciar sem ela
    // é preparar o desmentido de quem comparar com a ABEP.
    texto:
      "Pergunte quanto de cada classe (A, B, C e D/E) existe num recorte. É " +
      "estimativa nossa a partir do Censo 2022, calibrada pela PNAD — não é " +
      "número publicado pelo IBGE, e o agente repete essa ressalva na resposta.",
    // A pergunta é PRECISA de propósito ("porcentagem", "top 10"). Medido em
    // 2026-08-27: sem isso o agente devolve uma pergunta de esclarecimento
    // ("absoluto ou percentual? quantos itens?") em vez do mapa — e um chip de
    // demonstração que responde com interrogatório não demonstra nada.
    pergunta: "Top 10 bairros de Curitiba por porcentagem de domicílios na classe A",
    chip: "Top 10 bairros de Curitiba por classe A",
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
