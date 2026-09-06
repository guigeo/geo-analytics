/**
 * A moldura das telas do portal: símbolo, nome e subtítulo do cliente.
 *
 * A marca sai daqui de graça, e é por isso que ela entrou no escopo. A regra 1 do
 * ADR-0001 obriga que o que difere entre clientes seja DADO — então símbolo, fontes,
 * cores e nome já vivem em `web/src/clientes/<id>.ts` desde sempre, e a tela de entrar
 * só precisa usar o que já está lá. Não há decisão de design a tomar por cliente novo:
 * ele traz o próprio arquivo, e o portal dele nasce com a cara certa.
 *
 * `fixed inset-0`, e não `min-h-screen`, porque esta moldura tem DOIS pontos de uso e
 * eles são estruturalmente diferentes:
 *
 * - entrar e a troca obrigatória são a raiz — não há nada atrás, e fluxo normal bastaria;
 * - a troca VOLUNTÁRIA é aberta pelo menu da conta, e portanto renderiza de dentro do
 *   `<header>`, que tem altura fixa e é uma linha flex.
 *
 * No segundo caso o fluxo normal prendia a tela dentro do cabeçalho e o mapa passava por
 * cima — foi o que aconteceu no primeiro teste em 2026-09-06. Tirar do fluxo resolve os
 * dois de uma vez, sem a moldura precisar saber de onde foi chamada. O `z-[60]` fica
 * acima do `z-50` que o tooltip e o popover usam.
 */
import { identidade, tema } from "@/configuracao";
import { Simbolo } from "@/components/Simbolo";

interface Props {
  children: React.ReactNode;
}

export function Moldura({ children }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {tema.simbolo ? (
            <span className="flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Simbolo simbolo={tema.simbolo} className="size-7" />
            </span>
          ) : null}
          <div>
            <h1 className="fonte-titulo text-lg font-semibold tracking-tight">{identidade.nome}</h1>
            <p className="text-xs text-muted-foreground">{identidade.subtitulo}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
