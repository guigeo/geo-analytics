import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  NOVIDADES,
  deveAbrirSozinho,
  haNaoLida,
  marcarAutoAberto,
  marcarLidas,
} from "@/lib/novidades";

interface Props {
  /** Dispara a pergunta da novidade no chat — anunciar e demonstrar num clique. */
  onPerguntar: (texto: string) => void;
}

const dia = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

export function Novidades({ onPerguntar }: Props) {
  const [open, setOpen] = useState(false);
  const [naoLida, setNaoLida] = useState(haNaoLida);
  // Distingue o painel aberto pelo usuário do aberto sozinho. Fechar o que abriu
  // sozinho NÃO marca como lido: quem não olhou continua com a bolinha.
  const aberturaManual = useRef(false);

  useEffect(() => {
    if (!deveAbrirSozinho()) return;
    // Atraso curto: o mapa ainda está montando o style no primeiro frame, e um
    // painel que aparece junto com ele é lido como parte do carregamento.
    const t = setTimeout(() => {
      marcarAutoAberto();
      setOpen(true);
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  function marcarComoLida() {
    marcarLidas();
    setNaoLida(false);
  }

  // O Radix só chama isto por ação do usuário; a abertura automática mexe no
  // estado direto, e é essa diferença que o `aberturaManual` guarda.
  function mudarAbertura(aberto: boolean) {
    if (aberto) aberturaManual.current = true;
    else if (aberturaManual.current) marcarComoLida();
    setOpen(aberto);
  }

  if (NOVIDADES.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={mudarAbertura}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant={open ? "secondary" : "ghost"}
              size="icon"
              className="relative"
              aria-label="Novidades da aplicação"
            >
              <Sparkles className="size-5" />
              {naoLida && (
                <span
                  className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-card"
                  aria-hidden
                />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Novidades</TooltipContent>
      </Tooltip>

      <PopoverContent>
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold tracking-tight">Novidades</p>
          <p className="text-[11px] text-muted-foreground">
            O que entrou na aplicação recentemente
          </p>
        </div>

        <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto p-4">
          {NOVIDADES.map((n) => (
            <li key={n.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-medium leading-snug">{n.titulo}</p>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {dia(n.data)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{n.texto}</p>
              {n.pergunta && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-1 h-7 self-start text-xs"
                  onClick={() => {
                    onPerguntar(n.pergunta!);
                    marcarComoLida();
                    setOpen(false);
                  }}
                >
                  Ver no mapa
                </Button>
              )}
            </li>
          ))}
        </ul>

        {naoLida && (
          <div className="border-t border-border px-4 py-2">
            <button
              type="button"
              onClick={marcarComoLida}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Marcar como visto
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
