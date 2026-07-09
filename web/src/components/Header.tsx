import { Globe2, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchBox } from "@/components/SearchBox";
import type { SearchHit } from "@/search";
import type { Theme } from "@/hooks/use-theme";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onSearchSelect: (hit: SearchHit) => void;
}

export function Header({ theme, onToggleTheme, onSearchSelect }: Props) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Globe2 className="size-5" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">Geo Intelligence</p>
          <p className="text-[11px] text-muted-foreground">
            Mapa interativo · Brasil
          </p>
        </div>
      </div>

      <SearchBox onSelect={onSearchSelect} />

      <div className="ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleTheme}
              aria-label="Alternar tema"
            >
              {theme === "dark" ? (
                <Sun className="size-5" />
              ) : (
                <Moon className="size-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {theme === "dark" ? "Tema claro" : "Tema escuro"}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
