import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Bot, Layers, PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { MapView, type MapFocus, type SelectedFeature, type Viewport } from "@/map/MapView";
import type { SearchHit } from "@/search";
import { LayerPanel } from "@/panels/LayerPanel";
import { ChatPanel, type PerguntaExterna } from "@/chat/ChatPanel";
import { camadas } from "@/configuracao";
import type { Destaques } from "@/map/highlight";
import type { ContextoMapa } from "@/chat/api";
import { useTheme } from "@/hooks/use-theme";
import { PainelMedicao } from "@/components/PainelMedicao";
import { criarEstadoMedicao, type Coordenada, type ModoMedicao } from "@/map/medicao";
import { BarraDoDesenho } from "@/desenho/BarraFerramentas";
import { FormularioDesenho, type DadosDoFormulario } from "@/desenho/FormularioDesenho";
import { useAcervo } from "@/desenho/useAcervo";
import { itensDoAcervo, type ItemDoAcervo } from "@/desenho/camadas";
import { Redimensionador } from "@/components/Redimensionador";
import { areaFormatada, bboxDe, type ModoDesenho } from "@/desenho/geometria";
import {
  comVertice,
  criarEstadoDesenho,
  geometriaParaSalvar,
  semUltimoVertice,
} from "@/desenho/estado";
import { ErroDoAcervo } from "@/desenho/api";

/**
 * Toda sessão começa com TUDO desligado — decidido em 2026-09-02, e é regra da casca,
 * não escolha de cliente. Quem entra escolhe o nível que quer, em vez de achar o mapa
 * já com município desenhado por cima do que veio ver.
 */
const visibilidadeInicial = Object.fromEntries(camadas.map((c) => [c.id, false])) as Record<
  string,
  boolean
>;

/** Larguras iniciais das colunas, e para onde o duplo clique na alça volta. */
const LARGURA_PADRAO = 268;
const LARGURA_CHAT_PADRAO = 340;
/** A coluna do chat recolhida: só a aba com o ícone, o resto vira mapa. */
const LARGURA_ABA = 44;

export function App() {
  const { theme, toggle } = useTheme();
  const [satellite, setSatellite] = useState(false);
  const [satelliteOverlay, setSatelliteOverlay] = useState(true);
  const [visible, setVisible] = useState<Record<string, boolean>>(visibilidadeInicial);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const [destaques, setDestaques] = useState<Destaques | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Pergunta disparada de fora do chat (hoje, pelo painel de novidades). A `key`
  // existe para a MESMA pergunta poder ser pedida duas vezes — sem ela, o efeito
  // do ChatPanel não veria mudança nenhuma na segunda.
  const [pergunta, setPergunta] = useState<PerguntaExterna | null>(null);
  // Medição: o modo e os vértices são o estado; a medida em si é derivada deles
  // por `criarEstadoMedicao`, que é função pura. Guardar o valor calculado daria
  // duas fontes para o mesmo número.
  const [modoMedicao, setModoMedicao] = useState<ModoMedicao | null>(null);
  const [verticesMedicao, setVerticesMedicao] = useState<Coordenada[]>([]);
  // Desenho: mesmo arranjo da medição — modo e vértices são o estado, e tudo o que
  // a barra mostra (o que falta, o impedimento, a área) sai de `criarEstadoDesenho`.
  const [modoDesenho, setModoDesenho] = useState<ModoDesenho | null>(null);
  const [verticesDesenho, setVerticesDesenho] = useState<Coordenada[]>([]);
  const [raioDesenho, setRaioDesenho] = useState<number | null>(null);
  // Quem está ESCONDIDO, e não quem está visível: desenho novo nasce visível, e uma
  // lista de visíveis obrigaria a lembrar de acrescentar cada um que chega.
  const [desenhosOcultos, setDesenhosOcultos] = useState<string[]>([]);
  // Largura do painel esquerdo. Mora aqui e não no painel porque quem a aplica é a
  // grade das três colunas — o painel não tem como se alargar sozinho.
  const [larguraEsquerda, setLarguraEsquerda] = useState(LARGURA_PADRAO);
  const [larguraChat, setLarguraChat] = useState(LARGURA_CHAT_PADRAO);
  // O chat nasce aberto: é o que a aplicação tem de diferente, e escondê-lo por
  // padrão obrigaria a descobri-lo. Recolher é um clique, e devolve a largura ao mapa.
  const [chatRecolhido, setChatRecolhido] = useState(false);
  const [camadasRecolhidas, setCamadasRecolhidas] = useState(false);
  // Tela cheia do mapa: os dois painéis SOMEM (não recolhem para aba). O cabeçalho
  // fica, e é por ele que se volta — sem ele, a única saída seria adivinhar uma tecla.
  const [mapaCheio, setMapaCheio] = useState(false);
  const [preenchendo, setPreenchendo] = useState(false);
  const [salvandoDesenho, setSalvandoDesenho] = useState(false);
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  // Viewport em ref: muda a cada pan/zoom sem re-renderizar; lido só no envio do chat.
  const viewportRef = useRef<Viewport | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const acervo = useAcervo();
  // Os desenhos do cliente saem da MESMA coleção que o mapa consome. Memoizado porque
  // ela só muda quando alguém grava ou apaga, e o painel repinta a cada clique no mapa.
  const itens = useMemo(() => itensDoAcervo(acervo.desenhos), [acervo.desenhos]);
  // O formulário de salvar manda na coluna: um salvamento pela metade que some atrás
  // de uma aba é armadilha — a pessoa não fica sabendo que ainda deve algo.
  const esquerdaAberta = !camadasRecolhidas || (preenchendo && modoDesenho !== null);

  // Em tela cheia as faixas vão a zero e os painéis ganham `hidden` — e não são
  // DESMONTADOS. Desmontar o chat jogaria a conversa fora, porque as mensagens vivem
  // no estado dele; `display:none` esconde sem perder nada.
  const colunaEsquerda = mapaCheio ? "0px" : `${esquerdaAberta ? larguraEsquerda : LARGURA_ABA}px`;
  const colunaDireita = mapaCheio ? "0px" : `${chatRecolhido ? LARGURA_ABA : larguraChat}px`;

  const toggleLayer = (id: string) => setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  const medicao = criarEstadoMedicao(modoMedicao, verticesMedicao);
  const desenho = criarEstadoDesenho(modoDesenho, verticesDesenho, raioDesenho);

  const encerrarMedicao = () => {
    setModoMedicao(null);
    setVerticesMedicao([]);
  };

  const cancelarDesenho = () => {
    setModoDesenho(null);
    setVerticesDesenho([]);
    setRaioDesenho(null);
    setPreenchendo(false);
    setErroAoSalvar(null);
  };

  /**
   * Duplo clique ou Enter: encerra o traçado e abre o formulário.
   *
   * `duplicouUltimo` vem do duplo clique — o MapLibre dispara `click` nas duas batidas
   * antes do `dblclick`, então o último vértice entrou repetido. Deixá-lo criaria dois
   * pontos idênticos em sequência, que é justamente o que `validar` recusa como anel
   * degenerado: a pessoa faria o gesto certo e receberia "há pontos repetidos".
   */
  const encerrarDesenho = (duplicouUltimo: boolean) => {
    const limpo = duplicouUltimo ? semUltimoVertice(desenho) : desenho;
    setVerticesDesenho(limpo.coordenadas);
    if (limpo.completo) setPreenchendo(true);
  };

  // Clicar no modo já ativo desliga; trocar de modo zera os vértices, porque uma
  // linha de dois pontos não vira área nem o contrário.
  const alternarMedicao = (modo: ModoMedicao) => {
    setVerticesMedicao([]);
    setModoMedicao((atual) => (atual === modo ? null : modo));
    // Medir e inspecionar disputam o clique: ao entrar na ferramenta, o painel de
    // atributos larga o que estava selecionado em vez de mostrar feição antiga.
    setSelected(null);
    // Medir e desenhar disputam o mesmo clique. Uma ferramenta por vez, e a que
    // sai leva o traçado junto — deixá-lo pela metade na tela prometeria que ele
    // continua editável, e o próximo clique já seria da outra ferramenta.
    cancelarDesenho();
  };

  const alternarDesenho = (modo: ModoDesenho) => {
    setVerticesDesenho([]);
    setRaioDesenho(null);
    setPreenchendo(false);
    setErroAoSalvar(null);
    setModoDesenho((atual) => (atual === modo ? null : modo));
    setSelected(null);
    encerrarMedicao();
  };

  const salvarDesenho = async (dados: DadosDoFormulario) => {
    const geometria = geometriaParaSalvar(desenho);
    if (!geometria || !modoDesenho) return;
    setSalvandoDesenho(true);
    setErroAoSalvar(null);
    try {
      await acervo.salvar({
        tipo: modoDesenho,
        geometria,
        // No buffer a geometria enviada é o CENTRO; quem gera o círculo definitivo é
        // o PostGIS, com ST_Buffer sobre geography (Decisão 2 do DESIGN).
        ...(modoDesenho === "buffer" ? { raio_m: raioDesenho } : {}),
        ...dados,
      });
      cancelarDesenho();
    } catch (e) {
      setErroAoSalvar(
        e instanceof ErroDoAcervo ? e.message : "Não foi possível salvar. Tente de novo.",
      );
    } finally {
      setSalvandoDesenho(false);
    }
  };

  const focalizarDesenho = (d: ItemDoAcervo) => {
    const bbox = bboxDe(d.geometria);
    // Um ponto tem caixa degenerada, e o `maxZoom` é quem decide o enquadramento;
    // numa área, o `fitBounds` já faz o trabalho.
    if (bbox) setFocus({ bbox, key: Date.now(), maxZoom: d.tipo === "ponto" ? 16 : 14 });
  };

  // Busca do header: voa até o alvo; município também ganha o destaque azul
  // (mesma linguagem visual do chat — um "slot" só de destaque por vez).
  const onSearchSelect = (hit: SearchHit) => {
    const maxZoom = hit.tipo === "endereco" ? 17 : 12;
    setFocus({ bbox: hit.bbox, key: Date.now(), maxZoom });
    if (hit.cdMun) setDestaques({ camada: "municipio", codigos: [hit.cdMun] });
  };

  const getContexto = (): ContextoMapa | null => {
    const v = viewportRef.current;
    const camadas_ativas = camadas.filter((c) => visibleRef.current[c.id]).map((c) => c.id);
    if (!v) return { camadas_ativas };
    return { bbox: v.bbox, zoom: v.zoom, centro: v.centro, camadas_ativas };
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Header
          theme={theme}
          onToggleTheme={toggle}
          satellite={satellite}
          onToggleSatellite={() => setSatellite((s) => !s)}
          satelliteOverlay={satelliteOverlay}
          onToggleSatelliteOverlay={() => setSatelliteOverlay((s) => !s)}
          onSearchSelect={onSearchSelect}
          onPerguntar={(texto) => setPergunta({ texto, key: Date.now() })}
          modoMedicao={modoMedicao}
          onAlternarMedicao={alternarMedicao}
          modoDesenho={modoDesenho}
          onAlternarDesenho={alternarDesenho}
          mapaCheio={mapaCheio}
          onAlternarMapaCheio={() => setMapaCheio((m) => !m)}
        />

        {/* A faixa do traçado nasce SOB o cabeçalho e empurra o mapa, em vez de
            cobri-lo. Enquanto ela não existe, não ocupa altura nenhuma. */}
        <BarraDoDesenho
          estado={desenho}
          onDesfazer={() => setVerticesDesenho(semUltimoVertice(desenho).coordenadas)}
          onCancelar={cancelarDesenho}
          onSalvar={() => setPreenchendo(true)}
          onMudarRaio={setRaioDesenho}
          acervoIndisponivel={acervo.erro?.indisponivel ?? false}
        />
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateColumns: `${colunaEsquerda} 1fr ${colunaDireita}` }}
        >
          {/* Uma coluna, um painel. Eram dois — camadas em cima, desenhos embaixo —,
              e os dois tinham o mesmo título, porque respondiam à mesma pergunta: o
              que está no mapa. Dois cabeçalhos para uma pergunta é o que fazia a
              coluna parecer cheia estando quase vazia. */}
          {/* A esquerda mostra a árvore OU o formulário de salvar — nunca os dois.
              O formulário era a última peça a pousar sobre o mapa, e pousava bem em
              cima do que se acabou de desenhar, que é o que se quer olhar ao decidir
              como chamá-lo.

              Recolhida, vira a mesma aba de 44px do chat. O formulário ABERTO manda
              na coluna e ignora o recolhimento: salvamento pela metade que some atrás
              de uma aba é armadilha — a pessoa não sabe que ainda deve algo. */}
          {!esquerdaAberta ? (
            <button
              type="button"
              onClick={() => setCamadasRecolhidas(false)}
              aria-label="Abrir o painel de camadas"
              aria-expanded={false}
              className="flex flex-col items-center gap-2 border-r border-border bg-background py-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen aria-hidden="true" className="size-4" />
              <Layers aria-hidden="true" className="size-5 text-primary" />
            </button>
          ) : (
            <div className="relative min-h-0">
              {preenchendo && modoDesenho ? (
                <FormularioDesenho
                  tipo={modoDesenho}
                  area={areaFormatada(modoDesenho, verticesDesenho, raioDesenho)}
                  categorias={acervo.categorias}
                  salvando={salvandoDesenho}
                  erro={erroAoSalvar}
                  onSalvar={(dados) => {
                    void salvarDesenho(dados);
                  }}
                  onCancelar={() => setPreenchendo(false)}
                />
              ) : (
                <LayerPanel
                  visible={visible}
                  onToggle={toggleLayer}
                  itens={itens}
                  ocultos={desenhosOcultos}
                  onAlternarItem={(id) =>
                    setDesenhosOcultos((atual) =>
                      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
                    )
                  }
                  onFocalizar={focalizarDesenho}
                  onApagar={(item) => {
                    void acervo.apagar(item.id);
                  }}
                  erroDoAcervo={acervo.erro}
                  onRecarregar={acervo.recarregar}
                  onRecolher={() => setCamadasRecolhidas(true)}
                />
              )}
              <Redimensionador
                largura={larguraEsquerda}
                onLargura={setLarguraEsquerda}
                minima={200}
                maxima={560}
                padrao={LARGURA_PADRAO}
                rotulo="Redimensionar o painel de camadas"
              />
            </div>
          )}
          {/* O mapa "acende" no centro: leve elevação em volta da célula. */}
          <div className="relative overflow-hidden">
            <MapView
              visible={visible}
              theme={theme}
              satellite={satellite}
              satelliteOverlay={satelliteOverlay}
              onSelect={setSelected}
              selected={selected}
              highlights={destaques}
              focus={focus}
              onViewportChange={(v) => {
                viewportRef.current = v;
              }}
              medicao={medicao}
              onVerticeMedicao={(c) => setVerticesMedicao((prev) => [...prev, c])}
              onEncerrarMedicao={encerrarMedicao}
              desenho={desenho}
              onVerticeDesenho={(c) => {
                setVerticesDesenho(comVertice(desenho, c).coordenadas);
              }}
              onCancelarDesenho={cancelarDesenho}
              onEncerrarDesenho={encerrarDesenho}
              desenhos={acervo.desenhos}
              desenhosOcultos={desenhosOcultos}
            />
            <PainelMedicao
              medicao={medicao}
              onEncerrar={encerrarMedicao}
              onRecomecar={() => setVerticesMedicao([])}
            />
          </div>
          {/* A direita é só o chat, e ele vai do topo ao rodapé. Os atributos, que
              cobravam metade desta coluna para passar a sessão dizendo "clique numa
              feição", viraram popup ancorado na feição — `map/PopupAtributos.tsx`.

              Recolhida, a coluna vira uma aba de 44px e o resto vira mapa: barra
              estática é área cobrada o tempo todo por algo que nem sempre se usa. */}
          <div className={cn("relative min-h-0", mapaCheio && "hidden")}>
            {chatRecolhido ? (
              <button
                type="button"
                onClick={() => setChatRecolhido(false)}
                aria-label="Abrir o chat"
                aria-expanded={false}
                className="flex size-full flex-col items-center gap-2 border-l border-border bg-background py-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <PanelRightOpen aria-hidden="true" className="size-4" />
                <Bot aria-hidden="true" className="size-5 text-primary" />
              </button>
            ) : (
              <div className="relative size-full border-l border-border bg-background">
                <ChatPanel
                  onDestaques={setDestaques}
                  getContexto={getContexto}
                  pergunta={pergunta}
                  onRecolher={() => setChatRecolhido(true)}
                />
                <Redimensionador
                  largura={larguraChat}
                  onLargura={setLarguraChat}
                  minima={280}
                  maxima={640}
                  padrao={LARGURA_CHAT_PADRAO}
                  rotulo="Redimensionar o chat"
                  lado="esquerda"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
