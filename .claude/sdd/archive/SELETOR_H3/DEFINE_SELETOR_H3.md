# DEFINE: Seletor de variável na tela H3

> A camada H3 passa a pintar qualquer uma das três variáveis que já viajam no tile,
> escolhida na linha dela no painel, sem mover o mapa e com cor e escala próprias de
> cada uma.

## Metadados

| Atributo | Valor |
|---|---|
| **Feature** | `SELETOR_H3` |
| **Data** | 2026-09-13 |
| **Autor** | Claude Code, a partir de `BRAINSTORM_SELETOR_H3.md` |
| **Status** | ✅ Arquivada em 2026-09-13 — construída e **não publicada** (ver `SHIPPED_2026-09-13.md`) |
| **Clareza** | 14/15 |
| **Entrada** | `.claude/sdd/features/BRAINSTORM_SELETOR_H3.md` |

---

## Problema

A malha H3 estreou em 2026-09-07 com um tema só — domicílios em apartamento. As outras
duas variáveis do tile, **domicílios em casa** e **domicílios particulares**, já estão no
navegador de quem abre o mapa e não têm caminho nenhum na tela: a única forma de chegar
a elas é perguntar ao agente, que consulta o banco direto. O produto mostra menos do que
já entregou, e quem usa não tem como saber que o dado está ali.

---

## Quem sente

| Pessoa | Papel | Dor |
|---|---|---|
| Cliente que lê densidade no mapa | Uso diário | Vê apartamentos e não consegue comparar com casas, que é a leitura que separa bairro vertical de bairro horizontal |
| Guilherme, demonstrando | Produto/venda | Tem de responder "isso só no chat" quando perguntam pelo total de domicílios |
| Quem vai escolher a etapa 2 | Produto | Sem o seletor, não há onde encaixar variável nova — a decisão de regerar o tile fica sem destino na tela |

---

## Objetivos

| Prioridade | Objetivo |
|---|---|
| **MUST** | Escolher, na linha da camada, qual das três variáveis o H3 pinta |
| **MUST** | Trocar sem mover o mapa: mesmo centro, zoom e inclinação |
| **MUST** | Cada variável com a sua cor e o seu limite, e a legenda acompanhando a escolha |
| **MUST** | O controle e a declaração aguentarem 10–20 variáveis sem redesenho (etapa 2) |
| **SHOULD** | A escolha sobreviver a recolher e reabrir o painel |
| **COULD** | Agrupar a lista por bloco (`tipo_edificacao`, `especie`), como o banco já agrupa |

---

## Critérios de sucesso

- [ ] As **3** variáveis do tile são escolhíveis: `DOM_APARTAMENTO`, `DOM_CASA`, `DOMICILIOS_PARTICULARES`
- [ ] O painel continua com **1** linha para o H3 e o style do mapa com **1** camada `h3_domicilios` — antes e depois da troca
- [ ] Cada variável usa o seu p99 como topo da rampa: **820**, **925** e **1.223**
- [ ] Cada variável usa a sua cor final: `#1d4ed8` (apartamento), `#047857` (casa), `#6d28d9` (particulares)
- [ ] Trocar de variável não dispara recarga de fonte: o mapa não pisca e a posição não muda
- [ ] A tela nasce em **domicílios em apartamento**, que é o publicado hoje
- [ ] O popup de clique continua mostrando as mesmas informações de antes
- [ ] Tema claro e escuro, nos dois clientes (o painel é da casca)

---

## Testes de aceitação

| ID | Cenário | Dado | Quando | Então |
|---|---|---|---|---|
| AT-001 | Escolha | H3 ligada, pintando apartamento | Escolho "domicílios em casa" | O mapa repinta em esmeralda com topo 925, e a legenda passa a dizer "domicílios em casa" |
| AT-002 | Mapa parado | Mapa em zoom 13 sobre a Vila Olímpia | Troco de variável | Centro, zoom e inclinação idênticos; nenhum `fitBounds`, nenhuma recarga de fonte |
| AT-003 | Estado inicial | Sessão nova | Abro o painel e ligo a camada H3 | A variável ativa é "domicílios em apartamento", com topo 820 em azul |
| AT-004 | Camada desligada | H3 desligada | Escolho outra variável | A escolha é guardada e nada é pintado; ao ligar, pinta a escolhida |
| AT-005 | Painel recolhido | H3 ligada em "casa" | Recolho e reabro o painel | Continua em "casa", e a legenda mostra a escala de casa |
| AT-006 | Célula sem endereço | Célula das 32.056 com zero nas três | Troco de variável | A célula pinta a cor inicial da nova rampa — o fundo muda de matiz, não de valor |
| AT-007 | Uma camada só | Style carregado | Conto as camadas de id `h3_domicilios*` | Uma, e nenhuma camada nova por variável |
| AT-008 | Outras camadas | Setor e zoneamento ligados junto | Troco o H3 para casa | Nenhuma outra camada muda de cor ou visibilidade |

---

## Fora de escopo

- **As outras 54 variáveis** (40 do Censo, 14 do CNEFE). Exigem novo SQL em
  `pipeline/datasets.yaml`, `make tiles` e `make ship-tiles` — é a etapa 2, decidida de
  uma vez só, com a lista fechada e o peso do tile medido antes de publicar.
- **Tirar do tile as 32.056 células zeradas.** Mexe no tile, mesmo motivo acima.
- Seletor flutuante sobre o mapa.
- Mudança no popup de clique.
- Escala por classes ou quantis; segue a rampa contínua com corte no p99.
- Lembrar a variável entre sessões (regra de 2026-09-02: a sessão nasce no estado neutro).
- Opacidade por camada e busca de camada no painel.
- Qualquer mudança no agente, inclusive `h3_no_ponto` — é o item 3 da fila.

---

## Restrições

| Tipo | Restrição | Efeito |
|---|---|---|
| Dado | Só existe no tile o que o SQL projeta hoje: 3 variáveis temáticas + 6 campos de qualidade | O seletor nasce com 3 opções, e o desenho tem de aguentar crescer sem refazer |
| Produto | O painel é da casca compartilhada | A feature vale para os dois clientes; não há como entregar a um só sem chave por cliente |
| Arquitetura | Cor e limite são configuração, não código (fronteira de cliente do `AGENTS.md`) | Os temas se declaram no catálogo, ao lado da camada |
| Visual | Painel de 308 px, tema claro e escuro | O controle precisa caber com "Domicílios particulares" escrito por extenso |
| Publicação | Publicar é publicar o `HEAD` da `main` (§10 do ADR-0001) | Sobe junto com o que já estiver pronto na `main` |

---

## Contexto técnico

| Aspecto | Valor | Observação |
|---|---|---|
| **Onde o código mora** | `web/src/configuracao/` (esquema e catálogo), `web/src/panels/LayerPanel.tsx`, `web/src/map/` | A declaração é configuração; a troca de pintura é do mapa; o controle é do painel |
| **O que já existe para reusar** | `pinturaPorNumero`, `LegendaNumerica`, a linha de camada redesenhada em 2026-09-13, `Select` do shadcn/ui | Nada de componente novo de base |
| **Impacto de infra** | Nenhum | Sem ETL, sem tile novo, sem tocar a VPS além do deploy normal do front |
| **Dado** | Nenhuma carga; o tile publicado já tem tudo | A medição dos limites foi feita no `geodata` e vira constante no catálogo |

---

## Suposições

| ID | Suposição | Se estiver errada | Validada? |
|---|---|---|---|
| A-001 | `setPaintProperty` repinta as 68.454 células sem engasgo perceptível | Seria preciso pré-declarar as três expressões e alternar por `visibility`, o que reabre o caminho B | [ ] — medir no `/build`, com o mapa em zoom baixo (pior caso) |
| A-002 | Os p99 medidos hoje (820 / 925 / 1.223) continuam válidos enquanto o tile for o mesmo | Rampa saturando cedo ou tarde demais; corrige-se no catálogo | [x] medido em 2026-09-13 no `geodata`, com a união que o tile usa |
| A-003 | 47% de células zeradas é aceitável como fundo em qualquer variável | Se incomodar na tela, a saída é tirar as células do tile — etapa 2, não esta | [x] decidido: aceita nesta etapa |
| A-004 | Três matizes distintas bastam para a pessoa perceber que a leitura mudou | Precisaria de aviso explícito na troca | [ ] — confirmar olhando, no `/build` |

---

## Clareza

| Elemento | Nota | Por quê |
|---|---|---|
| Problema | 3 | Específico e medido: 3 variáveis no tile, 1 na tela |
| Usuários | 3 | Três papéis, com a dor de cada um |
| Objetivos | 3 | MUST/SHOULD separados, com o crescimento futuro declarado |
| Sucesso | 3 | Números: 3 variáveis, 1 camada, três limites e três cores |
| Escopo | 2 | O limite entre etapa 1 e etapa 2 está claro; o gatilho da etapa 2 (quais variáveis, e quando) ainda não tem dono |
| **Total** | **14/15** | |

---

## Perguntas em aberto

Nenhuma que trave o `/design`. Fica registrada uma decisão adiada de propósito: **quais
variáveis entram na etapa 2 e o que isso pesa no tile** — hoje 12,8 MB, numa VPS com
4,2 GB livres. A resposta não muda nada nesta etapa, desde que a declaração dos temas
seja uma lista.

---

## Histórico

| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 1.0 | 2026-09-13 | Claude Code | Primeira versão, a partir do BRAINSTORM |

---

## Próximo passo

`/design .claude/sdd/features/DEFINE_SELETOR_H3.md`
