import { Globe2, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Theme } from "@/hooks/use-theme";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
}

export function Header({ theme, onToggleTheme }: Props) {
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

      {/* Busca (placeholder — habilita junto com o chat na Fase 2). */}
      <div className="relative ml-2 hidden max-w-sm flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          disabled
          placeholder="Buscar lugar ou perguntar… (em breve)"
          className="pl-9"
        />
      </div>

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
