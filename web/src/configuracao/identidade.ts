/**
 * Escreve a identidade do cliente no `<head>`.
 *
 * A fase 4 tirou a cara do cliente do código e a pôs na configuração — mas
 * parou no `<body>`. O `index.html` continuou com o cliente 1 cravado, e isso
 * apareceu em produção em 2026-08-31, no dia em que o EB Prime subiu: a aba do
 * navegador dele dizia "Geo Intelligence", a descrição citava antenas de
 * telefonia (camada que o recorte dele não tem) e o `theme-color` era o azul da
 * casca. Nada disso é visível dentro da aplicação, que é por onde se olha ao
 * conferir uma cara nova — e foi por isso que passou.
 *
 * Por que em tempo de execução, e não gerando o HTML no build: é a mesma razão
 * do `aplicarTema` ao lado. O cliente é escolhido por `VITE_CLIENTE`, HTML não
 * lê TypeScript, e ler o módulo do cliente de dentro do `vite.config.ts` exigiria
 * transpilar e resolver o alias `@` fora do Vite — máquina demais para três
 * linhas de `<head>`. O custo é o título trocar no primeiro frame, o que ninguém
 * vê porque acontece antes do primeiro render.
 *
 * O `index.html` fica NEUTRO: sem nome de cliente. O que estava lá antes não era
 * um padrão genérico, era o cliente 1 servindo de padrão para todo mundo.
 */
import type { ConfiguracaoIdentidade, ConfiguracaoTema } from "./esquema";

/** Acha a `<meta name=…>` ou cria uma, para não depender do `index.html`. */
function meta(documento: Document, nome: string): HTMLMetaElement {
  const existente = documento.head.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`);
  if (existente) return existente;
  const nova = documento.createElement("meta");
  nova.setAttribute("name", nome);
  documento.head.appendChild(nova);
  return nova;
}

export function aplicarIdentidade(
  identidade: ConfiguracaoIdentidade,
  tema: ConfiguracaoTema,
  documento: Document = document,
): void {
  documento.title = identidade.nome;
  meta(documento, "description").setAttribute(
    "content",
    `${identidade.nome} — ${identidade.subtitulo}`,
  );

  // A cor da barra do navegador no celular. Só sobrescreve quem definiu um fundo
  // escuro próprio: sem isso, o valor do `index.html` (o fundo da casca) continua
  // valendo, que é o certo para o cliente que não pediu outro.
  //
  // Fica com o valor do esquema como está. Ele aceita hexadecimal e `oklch()`, e
  // navegador que não entender `oklch()` em `theme-color` simplesmente ignora a
  // meta — degrada para a barra padrão, não para cor errada.
  const fundoEscuro = tema.escuros?.fundo;
  if (fundoEscuro) meta(documento, "theme-color").setAttribute("content", fundoEscuro);
}
