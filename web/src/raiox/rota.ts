/**
 * O endereço do Raio-X: `?raio-x=<id>` sobre a própria aplicação.
 *
 * Sem biblioteca de rota. A aplicação é uma tela só com painéis, e trazer um router
 * para uma segunda vista pagaria dependência, bundle e uma reescrita do `App` para
 * resolver o que `history.pushState` resolve em vinte linhas. A mesma escolha que o
 * agente fez ao usar o SDK da OpenAI puro em vez de um framework.
 *
 * O que o endereço precisa entregar, e entrega: recarregar a página cai no mesmo
 * Raio-X, o botão de voltar do navegador fecha a página em vez de sair da aplicação, e
 * o link pode ser colado para outra pessoa do mesmo cliente — que vai passar pelo
 * portão antes de ver qualquer coisa, porque a rota está atrás da sessão.
 */
const PARAMETRO = "raio-x";

export function raioXNaUrl(busca: string = window.location.search): string | null {
  return new URLSearchParams(busca).get(PARAMETRO);
}

export function abrirRaioX(desenhoId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAMETRO, desenhoId);
  window.history.pushState({}, "", url);
}

export function fecharRaioX(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAMETRO);
  window.history.pushState({}, "", url);
}

/** Assina o `popstate` para o voltar do navegador fechar (ou trocar) o Raio-X. */
export function aoMudarRaioX(quando: (id: string | null) => void): () => void {
  const ouvir = () => quando(raioXNaUrl());
  window.addEventListener("popstate", ouvir);
  return () => window.removeEventListener("popstate", ouvir);
}
