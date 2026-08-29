import { MousePointerClick, RadioTower, type LucideIcon } from "lucide-react";
import { camadas, type DefinicaoCamada } from "@/configuracao";
import { ANTENNA_ICON } from "@/map/icons";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
}

// Ícone da legenda por id de ícone do mapa (mantém painel e marcador em sintonia).
const ICONE_DA_LEGENDA: Record<string, LucideIcon> = {
  [ANTENNA_ICON]: RadioTower,
};

export function LayerPanel({ visible, onToggle }: Props) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-background">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Camadas
        </h2>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3">
        <ul className="flex flex-col gap-1.5 pb-3">
          {camadas.map((c) => {
            const on = !!visible[c.id];
            return (
              <li key={c.id}>
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent"
                  data-active={on}
                >
                  <Amostra camada={c} />
                  <span className="flex-1 text-sm">{c.rotulo}</span>
                  <Switch checked={on} onCheckedChange={() => onToggle(c.id)} />
                </label>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <MousePointerClick className="mt-0.5 size-3.5 shrink-0" />
          Clique numa feição para destacá-la e ver os atributos.
        </p>
      </div>
    </aside>
  );
}

// Legenda — reflete a geometria: ícone (pontos com ícone), traço (linhas),
// contorno (UF) ou área (polígonos preenchidos).
function Amostra({ camada }: { camada: DefinicaoCamada }) {
  if (camada.geometria === "ponto") {
    const Icone = camada.icone ? ICONE_DA_LEGENDA[camada.icone] : undefined;
    if (Icone) return <Icone className="size-4 shrink-0" style={{ color: camada.cor }} />;
    // Ponto sem ícone: bolinha colorida.
    return (
      <span
        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/5"
        style={{ background: camada.cor }}
      />
    );
  }
  if (camada.geometria === "linha") {
    return (
      <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ background: camada.cor }} />
    );
  }
  if (camada.opacidadePreenchimento === 0 && camada.contorno) {
    return (
      <span
        className="size-3 shrink-0 rounded-sm border-2 bg-transparent"
        style={{ borderColor: camada.contorno.cor }}
      />
    );
  }
  return (
    <span
      className="size-3 shrink-0 rounded-sm ring-1 ring-black/5"
      style={{
        background: camada.cor,
        borderColor: camada.contorno?.cor ?? camada.cor,
      }}
    />
  );
}
