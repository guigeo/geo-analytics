/**
 * O contexto da sessão, separado do componente que o provê.
 *
 * A separação não é gosto: o `react-refresh` exige que um arquivo exporte só
 * componentes para conseguir recarregar a tela sem perder estado, e `sessao.tsx`
 * exportava o provedor e o hook juntos. Com o portão sendo a raiz da aplicação, perder
 * o recarregamento rápido ali custaria um login a cada salvamento em desenvolvimento.
 */
import { createContext, useContext } from "react";
import type { Eu } from "./api";

export interface Sessao {
  eu: Eu;
  sair: () => Promise<void>;
  /** Chamado pela troca voluntária de senha, para o contexto acompanhar. */
  atualizar: (eu: Eu) => void;
}

export const ContextoDeSessao = createContext<Sessao | null>(null);

export function useSessao(): Sessao {
  const s = useContext(ContextoDeSessao);
  if (!s) throw new Error("useSessao fora do ProvedorDeSessao");
  return s;
}
