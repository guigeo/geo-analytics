import { Layers, Map, MessageCircle, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";

type Painel = "camadas" | "chat" | "mais" | null;

interface Props {
  mapa: ReactNode;
  camadas: (fechar: () => void) => ReactNode;
  chat: (fechar: () => void) => ReactNode;
  mais: ReactNode;
}

/**
 * No telefone o mapa é a superfície principal. Os outros assuntos ocupam uma gaveta
 * sobre ele: abrir o chat não desloca nem desmonta o canvas do MapLibre.
 */
export function MobileLayout({ mapa, camadas, chat, mais }: Props) {
  const [painel, setPainel] = useState<Painel>(null);
  const fechar = () => setPainel(null);

  const titulos: Record<Exclude<Painel, null>, string> = {
    camadas: "Camadas",
    chat: "Chat",
    mais: "Mais opções",
  };

  return (
    <main className="relative min-h-0 flex-1 overflow-hidden" aria-label="Mapa">
      <div className="absolute inset-0">{mapa}</div>

      {painel && (
        <section
          className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 h-[min(72dvh,38rem)] overflow-hidden rounded-t-xl border border-b-0 border-border bg-background shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label={titulos[painel]}
        >
          {painel === "mais" && (
            <div className="flex h-11 items-center justify-between border-b border-border px-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Mais opções
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={fechar}
                aria-label="Fechar"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          )}
          <div className={cn("h-full", painel === "mais" && "h-[calc(100%-2.75rem)] p-3")}>
            {painel === "camadas" ? camadas(fechar) : painel === "chat" ? chat(fechar) : mais}
          </div>
        </section>
      )}

      <nav
        className="absolute inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
        aria-label="Navegação do mapa"
      >
        <Aba ativa={painel === null} icone={Map} rotulo="Mapa" onClick={fechar} />
        <Aba
          ativa={painel === "camadas"}
          icone={Layers}
          rotulo="Camadas"
          onClick={() => setPainel((atual) => (atual === "camadas" ? null : "camadas"))}
        />
        <Aba
          ativa={painel === "chat"}
          icone={MessageCircle}
          rotulo="Chat"
          onClick={() => setPainel((atual) => (atual === "chat" ? null : "chat"))}
        />
        <Aba
          ativa={painel === "mais"}
          icone={MoreHorizontal}
          rotulo="Mais"
          onClick={() => setPainel((atual) => (atual === "mais" ? null : "mais"))}
        />
      </nav>
    </main>
  );
}

function Aba({
  ativa,
  icone: Icone,
  rotulo,
  onClick,
}: {
  ativa: boolean;
  icone: typeof Map;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] text-muted-foreground",
        ativa && "font-semibold text-primary",
      )}
      aria-current={ativa ? "page" : undefined}
      onClick={onClick}
    >
      <Icone aria-hidden="true" className="size-5" />
      <span>{rotulo}</span>
    </button>
  );
}
