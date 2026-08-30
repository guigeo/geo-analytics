/**
 * Aplica a cara do cliente sobre os tokens do `styles.css`.
 *
 * O `styles.css` define a paleta inteira em `:root` e `.dark`. O que muda de
 * cliente para cliente é um recorte dela — marca, neutros, raio e tipografia —,
 * então este módulo redefine só esses tokens numa folha injetada depois da
 * original, que por isso ganha na cascata sem `!important`.
 *
 * Por que em tempo de execução e não no CSS: o cliente é escolhido no build por
 * `VITE_CLIENTE`, e CSS não lê TypeScript. Injetar é o que mantém a cara como
 * configuração validada em vez de mais um arquivo de estilo por cliente.
 *
 * Segurança: cada valor passou pelo esquema — cor é hexadecimal ou `oklch(L C H)`,
 * raio é comprimento, fonte é chave do catálogo. Nada além disso chega aqui.
 */
import type { ConfiguracaoTema, Neutros } from "./esquema";
import { FONTES } from "./fontes";

const ID = "tema-do-cliente";

/** Token do `styles.css` que cada neutro do esquema redefine. */
const TOKENS: Record<keyof Neutros, string[]> = {
  fundo: ["--background"],
  cartao: ["--card", "--popover"],
  texto: ["--foreground", "--card-foreground", "--popover-foreground"],
  textoFraco: ["--muted-foreground"],
  borda: ["--border", "--input"],
  superficie: ["--secondary", "--muted", "--accent"],
};

function neutros(bloco: Neutros | undefined): string[] {
  if (!bloco) return [];
  return Object.entries(bloco).flatMap(([campo, cor]) =>
    cor ? TOKENS[campo as keyof Neutros].map((token) => `${token}:${cor}`) : [],
  );
}

export function aplicarTema(tema: ConfiguracaoTema, cabeca: HTMLElement = document.head): void {
  const claro = [`--primary:${tema.marca}`, `--ring:${tema.marca}`, ...neutros(tema.claros)];
  const escuro = [
    `--primary:${tema.marcaEscura}`,
    `--ring:${tema.marcaEscura}`,
    ...neutros(tema.escuros),
  ];

  if (tema.raio) claro.push(`--radius:${tema.raio}`);
  claro.push(`--fonte-titulo:${FONTES[tema.fontes.titulo]}`);
  claro.push(`--fonte-texto:${FONTES[tema.fontes.texto]}`);

  const folha = document.createElement("style");
  folha.id = ID;
  folha.textContent = [`:root{${claro.join(";")}}`, `.dark{${escuro.join(";")}}`].join("\n");

  cabeca.querySelector(`#${ID}`)?.remove();
  cabeca.appendChild(folha);
}
