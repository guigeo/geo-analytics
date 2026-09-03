import {
  Globe2,
  Maximize2,
  Minimize2,
  Moon,
  Pentagon,
  Route,
  Ruler,
  Satellite,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Novidades } from "@/components/Novidades";
import { FerramentasDeDesenho } from "@/desenho/BarraFerramentas";
import type { ModoDesenho } from "@/desenho/geometria";
import { SearchBox } from "@/components/SearchBox";
import type { SearchHit } from "@/search";
import type { Theme } from "@/hooks/use-theme";
import { identidade, tema } from "@/configuracao";
import { Simbolo } from "@/components/Simbolo";
import { cn } from "@/lib/utils";
import type { ModoMedicao } from "@/map/medicao";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  satellite: boolean;
  onToggleSatellite: () => void;
  satelliteOverlay: boolean;
  onToggleSatelliteOverlay: () => void;
  onSearchSelect: (hit: SearchHit) => void;
  /** Uma novidade pediu para ser demonstrada: vai virar pergunta no chat. */
  onPerguntar: (texto: string) => void;
  /** Medição ativa, ou `null`. Clicar no modo ativo desliga. */
  modoMedicao: ModoMedicao | null;
  onAlternarMedicao: (modo: ModoMedicao) => void;
  /** Desenho ativo, ou `null`. Mesmo gesto da medição — e por isso ficam lado a lado. */
  modoDesenho: ModoDesenho | null;
  onAlternarDesenho: (modo: ModoDesenho) => void;
  /** Mapa ocupando tudo: os dois painéis somem, o cabeçalho fica. */
  mapaCheio: boolean;
  onAlternarMapaCheio: () => void;
}

export function Header({
  theme,
  onToggleTheme,
  satellite,
  onToggleSatellite,
  satelliteOverlay,
  onToggleSatelliteOverlay,
  onSearchSelect,
  onPerguntar,
  modoMedicao,
  onAlternarMedicao,
  modoDesenho,
  onAlternarDesenho,
  mapaCheio,
  onAlternarMapaCheio,
}: Props) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-8 place-items-center bg-primary text-primary-foreground shadow-sm",
            tema.forma === "circulo" ? "rounded-full" : "rounded-lg",
          )}
        >
          {tema.simbolo ? (
            <Simbolo simbolo={tema.simbolo} className="size-5" />
          ) : (
            <Globe2 className="size-5" />
          )}
        </span>
        <div className="leading-tight">
          <p className="fonte-titulo text-sm font-semibold tracking-tight">{identidade.nome}</p>
          <p className="text-[11px] text-muted-foreground">{identidade.subtitulo}</p>
        </div>
      </div>

      <SearchBox onSelect={onSearchSelect} />

      {/* Os ícones em GRUPOS separados, e não numa fileira só de oito. Anotar
          (desenhar), medir e trocar o fundo do mapa são três assuntos, e sem os
          traços eles viram uma tira indistinta em que se procura pelo desenho do
          ícone. O desenho vem antes da medição porque cria; a medição só consulta. */}
      <div className="ml-auto flex items-center gap-1">
        <Novidades onPerguntar={onPerguntar} />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <FerramentasDeDesenho modo={modoDesenho} onAlternarModo={onAlternarDesenho} />

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* As duas ferramentas de medição. Ficam antes do satélite porque medir
            terreno costuma ser feito sobre a imagem, e a mão vai de uma à outra. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={modoMedicao === "distancia" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => onAlternarMedicao("distancia")}
              aria-label="Medir distância"
              aria-pressed={modoMedicao === "distancia"}
            >
              <Ruler className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {modoMedicao === "distancia" ? "Encerrar medição" : "Medir distância"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={modoMedicao === "area" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => onAlternarMedicao("area")}
              aria-label="Medir área"
              aria-pressed={modoMedicao === "area"}
            >
              <Pentagon className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {modoMedicao === "area" ? "Encerrar medição" : "Medir área"}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={satellite ? "secondary" : "ghost"}
              size="icon"
              onClick={onToggleSatellite}
              aria-label="Alternar imagem de satélite"
            >
              <Satellite className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{satellite ? "Voltar ao mapa" : "Imagem de satélite"}</TooltipContent>
        </Tooltip>

        {satellite && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={satelliteOverlay ? "secondary" : "ghost"}
                size="icon"
                onClick={onToggleSatelliteOverlay}
                aria-label="Alternar vias e rótulos sobre o satélite"
              >
                <Route className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{satelliteOverlay ? "Só imagem" : "Mostrar vias"}</TooltipContent>
          </Tooltip>
        )}

        {/* Some com os dois painéis de uma vez. Fica no grupo do fundo do mapa
            porque é disso que se trata: quanto de tela o mapa ocupa. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={mapaCheio ? "secondary" : "ghost"}
              size="icon"
              onClick={onAlternarMapaCheio}
              aria-label={mapaCheio ? "Mostrar os painéis" : "Mapa em tela cheia"}
              aria-pressed={mapaCheio}
            >
              {mapaCheio ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{mapaCheio ? "Mostrar os painéis" : "Mapa em tela cheia"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="Alternar tema">
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{theme === "dark" ? "Tema claro" : "Tema escuro"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
