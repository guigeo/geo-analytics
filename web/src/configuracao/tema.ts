/**
 * Aplica a cara do cliente sobre os tokens do `styles.css`.
 *
 * O `styles.css` define a paleta inteira em `:root` e `.dark`. O que muda de
 * cliente para cliente é só a marca, então este módulo redefine dois tokens —
 * `--primary` e `--ring` — numa folha injetada depois da original, que por isso
 * ganha na cascata sem `!important`.
 *
 * Por que em tempo de execução e não no CSS: o cliente é escolhido no build por
 * `VITE_CLIENTE`, e CSS não lê TypeScript. Injetar é o que mantém a cor como
 * configuração validada em vez de mais um arquivo de estilo por cliente.
 *
 * Segurança: as duas cores passaram pelo `CorTema` do esquema, que só aceita
 * hexadecimal ou `oklch(L C H)`. Nada além disso chega aqui.
 */
import type { ConfiguracaoTema } from "./esquema";

const ID = "tema-do-cliente";

export function aplicarTema(tema: ConfiguracaoTema, cabeca: HTMLElement = document.head): void {
  const folha = document.createElement("style");
  folha.id = ID;
  folha.textContent = [
    `:root{--primary:${tema.marca};--ring:${tema.marca}}`,
    `.dark{--primary:${tema.marcaEscura};--ring:${tema.marcaEscura}}`,
  ].join("\n");

  cabeca.querySelector(`#${ID}`)?.remove();
  cabeca.appendChild(folha);
}
