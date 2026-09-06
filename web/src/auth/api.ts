/**
 * Cliente do portal. Espelho de `agent/src/geo_agent/rotas_auth.py`.
 *
 * Também é o lugar onde os TRÊS consumidores do `/api` avisam que a sessão caiu.
 * São três e não dois: `chat/api.ts`, `desenho/api.ts` e `search/geocode.ts` — este
 * último chama `/api/geocode` direto, sem passar por cliente compartilhado, e é o que
 * mais fácil se esquece. Um caminho esquecido não dá erro: dá tela branca no lugar da
 * tela de entrar.
 */

export interface Eu {
  email: string;
  /** Senha ainda é a provisória: o portal só deixa trocar a senha até isto virar false. */
  trocar_senha: boolean;
}

export class ErroDeAuth extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = "ErroDeAuth";
  }

  /** 503: o banco caiu. NÃO é culpa de quem digitou, e a tela não pode dizer que é. */
  get indisponivel(): boolean {
    return this.status === 503;
  }
}

// Quem quer saber que a sessão caiu. Um só assinante — o `ProvedorDeSessao` —, e por
// isso não é uma lista: dois interessados aqui significaria dois donos do mesmo estado.
let aoPerderSessao: (() => void) | null = null;

export function registrarPerdaDeSessao(fn: (() => void) | null): void {
  aoPerderSessao = fn;
}

/**
 * Chamado por qualquer cliente de API que receba 401.
 *
 * Existe para que a decisão "voltar para a tela de entrar" more num lugar só. Sem
 * isto, cada tela trataria o 401 do seu jeito e a aplicação ficaria meio dentro e
 * meio fora — com o mapa aberto e todo painel dizendo erro.
 */
export function sessaoCaiu(): void {
  aoPerderSessao?.();
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(caminho, init);
  } catch {
    throw new ErroDeAuth("Não foi possível falar com o servidor.", 503);
  }
  if (!res.ok) {
    const detalhe = await res
      .json()
      .then((b: { detail?: string }) => b.detail)
      .catch(() => undefined);
    throw new ErroDeAuth(detalhe ?? `Falha no portal (HTTP ${res.status})`, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Quem está dentro, ou `null`.
 *
 * O 401 aqui é esperado e não é erro: é a resposta normal de quem ainda não entrou, e
 * é o que decide entre mostrar o portal e mostrar o app.
 */
export async function quemSouEu(): Promise<Eu | null> {
  try {
    return await pedir<Eu>("/api/auth/eu");
  } catch (e) {
    if (e instanceof ErroDeAuth && e.status === 401) return null;
    throw e;
  }
}

export function entrar(email: string, senha: string): Promise<Eu> {
  return pedir<Eu>("/api/auth/entrar", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, senha }),
  });
}

export function sair(): Promise<void> {
  return pedir<void>("/api/auth/sair", { method: "POST" });
}

export function trocarSenha(senhaAtual: string, senhaNova: string): Promise<Eu> {
  return pedir<Eu>("/api/auth/senha", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ senha_atual: senhaAtual, senha_nova: senhaNova }),
  });
}
