import { Globe2, Moon, Route, Satellite, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Novidades } from "@/components/Novidades";
import { SearchBox } from "@/components/SearchBox";
import type { SearchHit } from "@/search";
import type { Theme } from "@/hooks/use-theme";

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
}: Props) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Globe2 className="size-5" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">Geo Intelligence</p>
          <p className="text-[11px] text-muted-foreground">Mapa interativo · Brasil</p>
        </div>
      </div>

      <SearchBox onSelect={onSearchSelect} />

      <div className="ml-auto flex items-center gap-1">
        <Novidades onPerguntar={onPerguntar} />

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
