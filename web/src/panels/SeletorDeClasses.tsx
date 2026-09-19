import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DefinicaoCamada } from "@/configuracao";

export function SeletorDeClasses({
  camada,
  ocultas,
  onAlternar,
}: {
  camada: DefinicaoCamada;
  ocultas: readonly string[];
  onAlternar: (valor: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (!camada.filtros) return null;
  const { rotulo, classes } = camada.filtros;

  return (
    <Collapsible open={aberto} onOpenChange={setAberto} className="ml-9 pb-1">
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent"
        aria-label={rotulo}
      >
        <span className="min-w-0 flex-1 truncate">{rotulo}</span>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-150",
            aberto && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-0.5" role="group" aria-label={rotulo}>
          {classes.map((classe) => {
            const ligada = !ocultas.includes(classe.valor);
            return (
              <li key={classe.valor}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-accent">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={ligada}
                    onChange={() => onAlternar(classe.valor)}
                  />
                  <span className={cn(ligada ? "text-foreground" : "text-muted-foreground")}>
                    {classe.rotulo}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
