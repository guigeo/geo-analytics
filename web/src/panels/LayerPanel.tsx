import { useMemo, useState } from "react";
import { ChevronRight, Layers, RadioTower, type LucideIcon } from "lucide-react";
import { camadas, configuracaoAcervo, type DefinicaoCamada } from "@/configuracao";
import type { CamadaDoAcervo } from "@/desenho/camadas";
import { ANTENNA_ICON } from "@/map/icons";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Secao, SecaoCabecalho, SecaoCorpo } from "@/components/PainelSecao";
import { cn } from "@/lib/utils";
import { agruparCamadas, ligadasNoGrupo } from "./grupos";

interface Props {
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
  /**
   * As camadas do acervo — uma por categoria, derivadas do dado (`desenho/camadas.ts`).
   *
   * Chegam prontas em vez de serem calculadas aqui porque a mesma coleção alimenta o
   * mapa, e duas derivações da mesma lista divergiriam no dia em que uma mudasse.
   */
  camadasDoAcervo: readonly CamadaDoAcervo[];
  categoriasOcultas: readonly string[];
  onAlternarCategoria: (categoria: string) => void;
}

// Ícone da legenda por id de ícone do mapa (mantém painel e marcador em sintonia).
const ICONE_DA_LEGENDA: Record<string, LucideIcon> = {
  [ANTENNA_ICON]: RadioTower,
};

/**
 * O painel de camadas: um combo por tema, e o acervo do cliente no último.
 *
 * Antes era uma lista corrida de oito interruptores, todos desligados, mais um rodapé
 * explicando o painel do lado. Combo por tema resolve as duas coisas de uma vez: o
 * painel nasce curto e cada assunto vira um lugar. O rodapé saiu porque a instrução
 * que ele dava já mora no estado vazio dos Atributos — que é o painel de que ela fala.
 *
 * O aberto/fechado é do componente e não da configuração: é preferência de quem está
 * usando naquele momento, não decisão de produto, e não sobrevive à sessão de
 * propósito — combo que "lembra" de fechado esconde camada de quem não a fechou.
 */
export function LayerPanel({
  visible,
  onToggle,
  camadasDoAcervo,
  categoriasOcultas,
  onAlternarCategoria,
}: Props) {
  const grupos = useMemo(() => agruparCamadas(camadas), []);
  const [fechados, setFechados] = useState<readonly string[]>(() =>
    grupos.filter((g) => !g.abertoPorPadrao).map((g) => g.id),
  );
  const alternar = (id: string) =>
    setFechados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  const acervoLigadas = camadasDoAcervo.filter((c) => !categoriasOcultas.includes(c.id)).length;
  const noMapa = camadas.filter((c) => visible[c.id]).length + acervoLigadas;

  return (
    <Secao className="border-r border-border bg-background">
      <SecaoCabecalho titulo="Camadas" icone={Layers} contagem={noMapa} />

      <SecaoCorpo>
        <div className="flex flex-col gap-1">
          {grupos.map((grupo) => (
            <Combo
              key={grupo.id}
              rotulo={grupo.rotulo}
              ligadas={ligadasNoGrupo(grupo, visible)}
              total={grupo.camadas.length}
              aberto={!fechados.includes(grupo.id)}
              onAlternar={() => alternar(grupo.id)}
            >
              {grupo.camadas.map((c) => (
                <Linha
                  key={c.id}
                  rotulo={c.rotulo}
                  amostra={<Amostra camada={c} />}
                  ligada={!!visible[c.id]}
                  onAlternar={() => onToggle(c.id)}
                />
              ))}
            </Combo>
          ))}

          {/* O acervo do cliente, no último combo e com o nome que ele dá a ele.
              Some inteiro quando não há nada: combo vazio sugere que algo não
              carregou, e o painel de baixo já conta essa história direito. */}
          {camadasDoAcervo.length > 0 && (
            <Combo
              rotulo={configuracaoAcervo.rotulo}
              ligadas={acervoLigadas}
              total={camadasDoAcervo.length}
              aberto={!fechados.includes(CHAVE_DO_ACERVO)}
              onAlternar={() => alternar(CHAVE_DO_ACERVO)}
            >
              {camadasDoAcervo.map((c) => (
                <Linha
                  key={c.id}
                  rotulo={c.rotulo}
                  sufixo={c.quantidade}
                  amostra={
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-sm ring-1 ring-black/5"
                      style={{ background: c.cor }}
                    />
                  }
                  ligada={!categoriasOcultas.includes(c.id)}
                  onAlternar={() => onAlternarCategoria(c.id)}
                />
              ))}
            </Combo>
          )}
        </div>
      </SecaoCorpo>
    </Secao>
  );
}

/** O acervo não é um `IdDeGrupo`; a chave é daqui, e o prefixo evita colidir com um. */
const CHAVE_DO_ACERVO = "@acervo";

/**
 * Um combo. Fechado, ele precisa dizer o que esconde — daí a contagem no cabeçalho:
 * sem ela, gaveta fechada vira camada esquecida.
 */
function Combo({
  rotulo,
  ligadas,
  total,
  aberto,
  onAlternar,
  children,
}: {
  rotulo: string;
  ligadas: number;
  total: number;
  aberto: boolean;
  onAlternar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={aberto} onOpenChange={onAlternar}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent">
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            aberto && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{rotulo}</span>
        <span
          className={cn(
            "shrink-0 text-[0.625rem] tabular-nums",
            ligadas > 0 ? "font-medium text-primary" : "text-muted-foreground",
          )}
        >
          {ligadas > 0 ? `${ligadas}/${total}` : total}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 pb-1 pl-2 pt-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Uma camada. O rótulo trunca e o interruptor não encolhe: é ele que se procura. */
function Linha({
  rotulo,
  amostra,
  sufixo,
  ligada,
  onAlternar,
}: {
  rotulo: string;
  amostra: React.ReactNode;
  sufixo?: number;
  ligada: boolean;
  onAlternar: () => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
      data-active={ligada}
    >
      {amostra}
      <span className="min-w-0 flex-1 truncate text-sm">{rotulo}</span>
      {sufixo !== undefined && (
        <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
          {sufixo}
        </span>
      )}
      <Switch className="shrink-0" checked={ligada} onCheckedChange={onAlternar} />
    </label>
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
