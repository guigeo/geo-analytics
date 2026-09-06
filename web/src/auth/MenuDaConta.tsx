/**
 * A conta no cabeçalho: quem está dentro, trocar senha e sair.
 *
 * As duas ações são tudo o que o portal oferece, e a lista curta é o escopo, não uma
 * primeira versão: não há perfil, preferência nem papel, porque a emenda de 2026-09-05
 * à §8 do ADR-0001 não distingue pessoas dentro do cliente. Um item a mais aqui seria a
 * primeira rachadura nisso.
 */
import { useState } from "react";
import { KeyRound, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrocarSenha } from "./TrocarSenha";
import { useSessao } from "./contexto";

export function MenuDaConta() {
  const { eu, sair, atualizar } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(false);

  if (trocando) {
    return (
      <TrocarSenha
        eu={eu}
        aoTrocar={(novo) => {
          atualizar(novo);
          setTrocando(false);
        }}
        aoCancelar={() => setTrocando(false)}
      />
    );
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Conta">
              <UserRound className="size-5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Conta</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-60 p-2">
        <p className="truncate px-2 py-1.5 text-xs text-muted-foreground" title={eu.email}>
          {eu.email}
        </p>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            setAberto(false);
            setTrocando(true);
          }}
        >
          <KeyRound className="size-4" />
          Trocar senha
        </Button>
        <Button variant="ghost" className="w-full justify-start" onClick={sair}>
          <LogOut className="size-4" />
          Sair
        </Button>
      </PopoverContent>
    </Popover>
  );
}
