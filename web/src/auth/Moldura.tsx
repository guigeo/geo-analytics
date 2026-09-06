/**
 * A moldura das telas do portal: símbolo, nome e subtítulo do cliente.
 *
 * A marca sai daqui de graça, e é por isso que ela entrou no escopo. A regra 1 do
 * ADR-0001 obriga que o que difere entre clientes seja DADO — então símbolo, fontes,
 * cores e nome já vivem em `web/src/clientes/<id>.ts` desde sempre, e a tela de entrar
 * só precisa usar o que já está lá. Não há decisão de design a tomar por cliente novo:
 * ele traz o próprio arquivo, e o portal dele nasce com a cara certa.
 */
import { identidade, tema } from "@/configuracao";
import { Simbolo } from "@/components/Simbolo";

interface Props {
  children: React.ReactNode;
}

export function Moldura({ children }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
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
