import { useMemo, useState } from "react";
import {
  ChevronRight,
  CloudOff,
  Layers,
  PanelLeftClose,
  RadioTower,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { camadas, configuracaoAcervo, type DefinicaoCamada } from "@/configuracao";
import type { ItemDoAcervo } from "@/desenho/camadas";
import type { ErroDoAcervo } from "@/desenho/api";
import { Button } from "@/components/ui/button";
import { ANTENNA_ICON } from "@/map/icons";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Secao, SecaoCabecalho, SecaoCorpo, EstadoVazio } from "@/components/PainelSecao";
import { cn } from "@/lib/utils";
import { agruparCamadas } from "./grupos";
import { LegendaCategorica } from "./LegendaCategorica";

interface Props {
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
  /**
   * Os desenhos do cliente, folhas do último combo. Vêm da mesma coleção que o mapa
   * consome — se viessem de uma lista própria, painel e mapa poderiam discordar.
   */
  itens: readonly ItemDoAcervo[];
  ocultos: readonly string[];
  onAlternarItem: (id: string) => void;
  /** Voa até o desenho. É o que o nome faz quando clicado. */
  onFocalizar: (item: ItemDoAcervo) => void;
  onApagar: (item: ItemDoAcervo) => void;
  /** Acervo fora do ar não é acervo vazio (AT-012): são estados diferentes na tela. */
  erroDoAcervo: ErroDoAcervo | null;
  onRecarregar: () => void;
  /** Recolhe a coluna para a aba fina, devolvendo a largura ao mapa. */
  onRecolher: () => void;
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
 * Toda sessão começa com TUDO recolhido e nenhuma camada ligada (decidido em
 * 2026-09-02). O aberto/fechado é do componente e não da configuração: é preferência
 * de quem está usando naquele momento, não decisão de produto, e não sobrevive à
 * sessão de propósito — combo que "lembra" de aberto entrega a tela de ontem a quem
 * abriu hoje.
 */
export function LayerPanel({
  visible,
  onToggle,
  itens,
  ocultos,
  onAlternarItem,
  onFocalizar,
  onApagar,
  erroDoAcervo,
  onRecarregar,
  onRecolher,
}: Props) {
  const grupos = useMemo(() => agruparCamadas(camadas), []);
  // Guarda os ABERTOS, e começa vazio: toda sessão nasce com tudo recolhido. Guardar
  // os fechados daria o mesmo desenho hoje e erraria no dia em que um combo novo
  // aparecesse — ele nasceria aberto por não estar na lista.
  const [abertos, setAbertos] = useState<readonly string[]>([]);
  const alternar = (id: string) =>
    setAbertos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  return (
    <Secao className="border-r border-border bg-background">
      <SecaoCabecalho
        titulo="Camadas"
        icone={Layers}
        acao={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Recolher o painel de camadas"
            aria-expanded
            onClick={onRecolher}
          >
            <PanelLeftClose aria-hidden="true" />
          </Button>
        }
      />

      <SecaoCorpo>
        <div className="flex flex-col gap-1">
          {grupos.map((grupo) => (
            <Combo
              key={grupo.id}
              rotulo={grupo.rotulo}
              aberto={abertos.includes(grupo.id)}
              onAlternar={() => alternar(grupo.id)}
            >
              {grupo.camadas.map((c) => (
                <div key={c.id}>
                  <Linha
                    rotulo={c.rotulo}
                    amostra={<Amostra camada={c} />}
                    ligada={!!visible[c.id]}
                    onAlternar={() => onToggle(c.id)}
                  />
                  {c.cobertura && (
                    <p className="ml-7 pb-1 text-xs text-muted-foreground">{c.cobertura}</p>
                  )}
                  {c.pinturaPorCategoria && <LegendaCategorica pintura={c.pinturaPorCategoria} />}
                </div>
              ))}
            </Combo>
          ))}

          {/* O acervo do cliente, no último combo e com o nome que ele dá a ele.
              Os desenhos são as FOLHAS: com uma categoria só, um degrau "categoria"
              no meio era um clique a mais para chegar no mesmo lugar.

              Aparece também quando o acervo FALHOU, e é por isso que a condição não
              é só `itens.length`: sumir calado faria "não deu para perguntar" parecer
              "não há nada", que é a única diferença capaz de decidir se vale tentar
              de novo. */}
          {(itens.length > 0 || erroDoAcervo) && (
            <Combo
              rotulo={configuracaoAcervo.rotulo}
              aberto={abertos.includes(CHAVE_DO_ACERVO)}
              onAlternar={() => alternar(CHAVE_DO_ACERVO)}
            >
              {erroDoAcervo ? (
                <EstadoVazio icone={CloudOff}>
                  {erroDoAcervo.indisponivel
                    ? "Não foi possível carregar agora. O mapa continua funcionando."
                    : erroDoAcervo.message}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={onRecarregar}
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    Tentar de novo
                  </Button>
                </EstadoVazio>
              ) : (
                itens.map((item) => (
                  <LinhaDoAcervo
                    key={item.id}
                    item={item}
                    ligada={!ocultos.includes(item.id)}
                    onAlternar={() => onAlternarItem(item.id)}
                    onFocalizar={() => onFocalizar(item)}
                    onApagar={() => onApagar(item)}
                  />
                ))
              )}
            </Combo>
          )}
        </div>
      </SecaoCorpo>
    </Secao>
  );
}

/** O acervo não é um `IdDeGrupo`; a chave é daqui, e o prefixo evita colidir com um. */
const CHAVE_DO_ACERVO = "@acervo";

/** Um combo: o título, a seta e o que ele guarda. */
function Combo({
  rotulo,
  aberto,
  onAlternar,
  children,
}: {
  rotulo: string;
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
        {/* Mesma tipografia das camadas de dentro: um combo com letra menor lia como
            legenda de outra coisa, e não como o primeiro nível da mesma árvore. Quem
            marca a hierarquia é a seta e o recuo das linhas, não o tamanho da fonte. */}
        <span className="min-w-0 flex-1 truncate text-sm">{rotulo}</span>
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
  ligada,
  onAlternar,
}: {
  rotulo: string;
  amostra: React.ReactNode;
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
      <Switch className="shrink-0" checked={ligada} onCheckedChange={onAlternar} />
    </label>
  );
}

/**
 * Um desenho do cliente. Tem mais coisa que uma camada porque ele é dado do cliente:
 * dá para ir até ele, escondê-lo e apagá-lo.
 *
 * A lixeira só aparece no hover (e ao receber foco pelo teclado, senão ela sumiria
 * para quem não usa mouse). Numa lista de dado insubstituível, botão de apagar sempre
 * visível em toda linha é convite; escondido atrás do gesto de mirar a linha, não.
 */
function LinhaDoAcervo({
  item,
  ligada,
  onAlternar,
  onFocalizar,
  onApagar,
}: {
  item: ItemDoAcervo;
  ligada: boolean;
  onAlternar: () => void;
  onFocalizar: () => void;
  onApagar: () => void;
}) {
  // Um booleano por linha, e não um id no pai: a confirmação é estado da linha, e
  // guardá-la em cima faria abrir numa linha abrir em todas.
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent">
      <span
        aria-hidden="true"
        className={cn(
          "size-3 shrink-0 ring-1 ring-black/10",
          item.tipo === "ponto" ? "rounded-full" : "rounded-sm",
        )}
        style={{ background: item.cor }}
      />
      <button
        type="button"
        onClick={onFocalizar}
        className="min-w-0 flex-1 truncate text-left text-sm"
        title={item.nome}
      >
        {item.nome}
      </button>

      {confirmando ? (
        // Confirmar na própria linha, e não num diálogo: quem apaga precisa continuar
        // vendo QUAL desenho está apagando.
        <span className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="destructive"
            size="xs"
            onClick={() => {
              setConfirmando(false);
              onApagar();
            }}
          >
            Apagar
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => setConfirmando(false)}>
            Não
          </Button>
        </span>
      ) : (
        <>
          <Switch
            className="shrink-0"
            checked={ligada}
            onCheckedChange={onAlternar}
            aria-label={`Mostrar ${item.nome} no mapa`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Apagar ${item.nome}`}
            className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            onClick={() => setConfirmando(true)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
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
