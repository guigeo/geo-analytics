/**
 * A casca comum dos quatro painéis laterais.
 *
 * Existe porque a bagunça não estava em nenhum painel: estava entre eles. Os quatro
 * tinham cabeçalho quase igual e nenhum idêntico — `pt-4` contra `pt-3`, `px-3` contra
 * `px-4`, `aside` contra `section`, um com contagem e outro sem. Quatro variações da
 * mesma coisa não leem como quatro decisões; leem como nenhuma decisão.
 *
 * Aqui a decisão é uma só e mora num lugar só: quem quiser mudar o ritmo dos painéis
 * muda este arquivo, e os quatro andam juntos. É o que faz a coluna da esquerda e a da
 * direita parecerem o mesmo produto — os cabeçalhos passam a se alinhar entre colunas,
 * que é a diferença que o olho lê como acabamento.
 */
import type { LucideIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** Um painel: cabeçalho fixo, corpo que rola. Nunca rola por fora. */
export function Secao({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("flex h-full min-h-0 flex-col", className)}>{children}</section>;
}

/**
 * O cabeçalho. Título à esquerda, e à direita o que aquele painel tiver a dizer de si
 * — uma contagem, um botão. `acao` fica depois de `contagem` porque o número é leitura
 * e o botão é ação: ler antes de agir é a ordem em que a mão vai.
 */
export function SecaoCabecalho({
  titulo,
  icone: Icone,
  contagem,
  acao,
}: {
  titulo: string;
  icone?: LucideIcon;
  contagem?: number;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      {Icone && (
        <span className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground">
          <Icone className="size-3.5" />
        </span>
      )}
      <h2 className="min-w-0 flex-1 truncate text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h2>
      {contagem !== undefined && contagem > 0 && (
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium tabular-nums text-muted-foreground">
          {contagem}
        </span>
      )}
      {acao}
    </div>
  );
}

/** O corpo rolável. O padding é do corpo, não de cada filho — era daí a metade do desalinho. */
export function SecaoCorpo({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <ScrollArea className={cn("min-h-0 flex-1 px-3 py-2", className)}>{children}</ScrollArea>;
}

/**
 * O estado vazio, igual nos quatro.
 *
 * Um só porque a instrução é uma só: antes disto, "clique numa feição" aparecia no
 * rodapé do painel de camadas E no vazio do painel de atributos — dois lugares dizendo
 * a mesma coisa, e o de cima falando de um painel que não era o dele.
 */
export function EstadoVazio({
  icone: Icone,
  children,
}: {
  icone?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
      {Icone && <Icone className="size-5 text-muted-foreground" />}
      <p className="text-xs leading-5 text-muted-foreground">{children}</p>
    </div>
  );
}
