/**
 * Catálogo de fontes da casca.
 *
 * Mesma ideia do `catalogo.ts` das camadas: o repertório é da casca, a escolha é
 * do cliente. Aqui as famílias já vêm empacotadas e servidas pela própria
 * aplicação (`@fontsource`) — nada de `fonts.googleapis.com`. São duas razões:
 * o site do cliente não passa a depender de um terceiro para ter tipografia, e
 * a CSP do gateway em produção não precisa abrir origem nova.
 *
 * Fonte nova aqui é decisão de casca: entra o pacote, entra a entrada, e aí
 * qualquer cliente pode escolher. O cliente não nomeia arquivo de fonte.
 */
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/raleway/400.css";
import "@fontsource/raleway/500.css";
import "@fontsource/raleway/600.css";

const SISTEMA = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const IDS_DE_FONTE = ["sistema", "montserrat", "raleway"] as const;

export type IdDeFonte = (typeof IDS_DE_FONTE)[number];

export const FONTES: Record<IdDeFonte, string> = {
  /** O que a aplicação sempre usou. Nada é baixado. */
  sistema: SISTEMA,
  /** Geométrica, de título. Veio do template do EB Prime. */
  montserrat: `Montserrat, ${SISTEMA}`,
  /** Humanista, de texto corrido. Veio do template do EB Prime. */
  raleway: `Raleway, ${SISTEMA}`,
};
