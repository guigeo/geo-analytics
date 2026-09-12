# BRAINSTORM: Seletor de variável na tela H3

> A malha H3 estreou com um tema só — domicílios em apartamento. Este documento fecha
> como a pessoa passa a escolher o que a camada pinta, e para onde isso cresce. Não
> autoriza implementação nem regeração de tile.

## Metadados

| Atributo | Valor |
|---|---|
| **Feature** | `SELETOR_H3` |
| **Data** | 2026-09-13 |
| **Autor** | Claude Code, a partir da conversa com Guilherme Ramos |
| **Status** | Pronto para `/define` |
| **Antecessora** | `TELA_H3` (2026-09-07) — a casca que pinta por valor e desenha legenda |
| **Posição na fila** | Item 2 das oito frentes ordenadas em 2026-09-12 (`docs/DECISOES.md`) |

---

## A ideia, e a premissa que caiu na primeira medição

A fila dizia que este item **não exigia dado novo**: "são 40 variáveis do Censo em
`indicadores.censo_h3_r9` e 17 do CNEFE em `cnefe_h3_r9`". Isso é verdade no banco e
falso no produto. O tile publicado é montado por um SQL que projeta **três** colunas
temáticas (`pipeline/datasets.yaml:162`):

```text
DOM_APARTAMENTO · DOM_CASA · DOMICILIOS_PARTICULARES
```

mais as seis `COORD_*` de qualidade da coordenada. As outras 54 variáveis **não estão
no tile**, e a tela só lê o tile. Alcançá-las é ETL: mexer no SQL, `make tiles`, e
republicar com `make ship-tiles` no `webgis` — com o tile hoje em 12,8 MB e a VPS com
4,2 GB livres de 38 GB.

Daí o recorte que o Guilherme fechou: **a feature é o seletor sobre o que já viajou**,
e a lista maior vira uma segunda etapa, decidida de uma vez só, porque regerar tile é
caro de repetir. É também o que separa esta frente da de número 3 da fila: o agente
(`h3_no_ponto`) consulta o PostGIS direto e por isso já alcança mais variáveis do que a
tela — a lacuna entre os dois é de tile, não de código.

---

## Medições desta sessão

Rodadas no `geodata` local com a MESMA união que o tile usa (malha do Censo ∪ células
CNEFE, ausência preenchida com zero), para os números serem os que a tela vê:

| Variável | Células com valor > 0 | p99 | Máximo |
|---|---|---|---|
| `dom_apartamento` | 11.485 | **820** | 5.524 |
| `dom_casa` | 35.918 | **925** | 3.263 |
| `end_dom_particular` | 36.398 | **1.223** | 5.587 |

Total de células no tile: **68.454**. O p99 de apartamento bate com o 820 registrado na
`TELA_H3` em 2026-09-07, o que confirma que o método de corte é o mesmo.

**O número que muda o desenho: 32.056 células (47%) valem zero nas três variáveis.** São
as células do Censo sem nenhum endereço CNEFE dentro. Na rampa contínua a partir de
zero elas já pintam a cor inicial, quase branca — o comportamento de hoje —, e trocar de
variável não muda esse fundo. É a metade do recorte que nunca vai reagir ao seletor, e a
`/define` precisa dizer se isso é aceitável ou se essas células saem do tile.

Os nomes legíveis também já existem no banco, em `indicadores.cnefe_variavel`:
"domicilios em apartamento", "domicilios em casa", "domicilios particulares", com a
coluna `bloco` agrupando as duas primeiras em `tipo_edificacao` e a terceira em
`especie`. Esse agrupamento é o que a lista suspensa usa quando a etapa 2 chegar.

---

## Perguntas e respostas

| # | Pergunta | Resposta | O que decide |
|---|---|---|---|
| 1 | Trocar de variável mantém zoom e posição? | Sim | Troca é repintura da mesma camada, não recarga de fonte nem `fitBounds` |
| 2 | A escala é a mesma rampa com outros limites, ou muda por variável? | **Muda por variável** | Cada variável carrega cor e limites próprios; a legenda passa a ser função da escolha |
| 3 | Onde fica o seletor? | **Na linha da camada, no painel** | Um lugar só para ligar, escolher e ler a escala; nenhum pixel de mapa gasto; não dá para trocar com o painel recolhido, e isso foi aceito |
| 4 | Que forma tem o controle? | **Lista suspensa** | É o único que cabe em 308 px com "Domicílios particulares" e que sobrevive à etapa 2 com 10 ou 20 variáveis agrupadas por bloco |
| 5 | Que cor cada variável ganha? | **Azul, esmeralda, violeta** | Apartamento fica no `#1d4ed8` de hoje; casa vai para `#047857`; particulares para `#6d28d9`. Âmbar foi recusado por lembrar o laranja do setor censitário, que é justamente a camada que se liga por baixo |

---

## Amostras e fontes de verdade

| Tipo | Onde | Uso |
|---|---|---|
| Dado publicado | tile `h3_domicilios` (host compartilhado) | As três variáveis e os seis campos de qualidade que a tela lê hoje |
| Rótulos | `indicadores.cnefe_variavel` (`nome`, `bloco`) | Nome visível e agrupamento da lista |
| Limites | medição acima | p99 por variável, que vira o topo de cada rampa |
| Código a reusar | `web/src/configuracao/catalogo.ts`, `web/src/map/layers.ts`, `web/src/panels/LayerPanel.tsx` | `pinturaPorNumero`, a legenda numérica e a linha de camada redesenhada em 2026-09-13 |

Não há amostra de LLM a coletar: a feature não passa pelo agente.

---

## Caminhos considerados

### A — Uma camada, várias pinturas ⭐ escolhido

A camada `h3_domicilios` passa a declarar uma **lista** de temas (`campo`, nome, cor
inicial e final, limites), e o seletor troca qual deles está ativo. No mapa, a troca é
`setPaintProperty` na mesma camada — a fonte não recarrega, e por isso zoom e posição
ficam onde estavam, sem nenhum código para preservá-los.

**A favor:** uma fonte, um tile, uma camada no style; a troca é instantânea porque o
dado já está no navegador; a legenda vira função do tema ativo e já existe.
**Contra:** o catálogo deixa de descrever "uma camada = uma pintura", que é a forma
atual do `pinturaPorNumero`; o esquema precisa aceitar as duas coisas sem quebrar as
outras camadas.

### B — Uma camada por variável

Três camadas (`h3_apartamento`, `h3_casa`, `h3_particulares`) sobre a mesma fonte, e o
seletor alterna a visibilidade.

**A favor:** zero mudança no esquema — cada camada já sabe se pintar; o painel já
alterna visibilidade.
**Contra:** três linhas no painel para o mesmo dado, e o usuário pode ligar duas ao
mesmo tempo e ver uma cobrindo a outra; na etapa 2, com 20 variáveis, viram 20 camadas
no style e 20 linhas na árvore. Escala mal exatamente onde a feature quer crescer.

### C — Filtro por expressão no MapLibre

Uma camada, e a variável entra como expressão `["get", campoAtivo]` montada em runtime.

**A favor:** o mais enxuto no style.
**Contra:** é a mesma coisa que A na prática, sem a declaração no catálogo — a escolha
de cor e limite viveria em código, e não em configuração, que é o contrário da regra de
fronteira de cliente do `AGENTS.md`.

---

## O que ficou de fora (YAGNI)

| Sugestão | Por que sai agora | Volta? |
|---|---|---|
| As outras 54 variáveis | Exigem regerar e republicar o tile; decisão de lista inteira, de uma vez | Sim — é a etapa 2, e a `/define` deve registrar o gatilho |
| Seletor flutuante sobre o mapa | Segundo lugar de controle da mesma camada, e ocupa área útil | Sim, se o painel recolhido virar queixa real |
| Mudar o popup de clique | Ele já mostra casas, total e qualidade — ou seja, as três variáveis de uma vez; trocar o tema não muda o que a célula É | Não |
| Escala por quantis ou classes | A rampa contínua com corte no p99 é o que está publicado e entendido; classes são outra discussão de cartografia | Sim |
| Lembrar a variável escolhida entre sessões | Mesma regra dos combos: a sessão nasce no estado neutro (decisão de 2026-09-02) | Não |
| Opacidade por variável | Não é o problema; a lista de camadas nem tem opacidade ainda | Sim |

---

## Validações com o Guilherme

| Momento | O que foi apresentado | Resposta | Mudou? |
|---|---|---|---|
| 1 | A premissa da fila estava errada: o tile tem 3 variáveis, não 57; proposta de partir em duas etapas | Aceito — etapa 1 é o seletor sobre as três | Sim: o escopo encolheu antes de começar |
| 2 | Comportamento da troca (zoom/posição) e natureza da escala | Mantém zoom e posição; escala muda por variável | Sim: a escala virou parte do tema, não da camada |
| 3 | Lugar e forma do controle | Painel, na linha da camada; lista suspensa | Confirma A |
| 4 | Paleta das três rampas | Azul, esmeralda, violeta | Confirma; âmbar recusado pela colisão com o setor |

---

## Rascunho para o `/define`

**Problema:** a camada H3 mostra uma variável de três que já estão no navegador, e não
há como escolher — quem quer ver casas ou o total de domicílios não tem caminho nenhum
na tela, embora o agente responda sobre eles.

**Quem sente:** o cliente que usa o mapa para ler densidade, e o Guilherme ao demonstrar
a malha — hoje a resposta é "isso só no chat".

**Critérios de sucesso (rascunho):**

- [ ] A camada H3 pinta qualquer uma das três variáveis do tile, escolhida na linha dela
- [ ] Trocar de variável não move o mapa: mesmo centro, mesmo zoom, mesma inclinação
- [ ] A legenda mostra o nome, a cor e os limites da variável ativa, e muda com ela
- [ ] Cada variável usa o seu p99 como topo: 820 / 925 / 1.223
- [ ] A cor da rampa é a da variável: azul, esmeralda, violeta
- [ ] Com o painel recolhido e reaberto, a variável escolhida continua a mesma
- [ ] A tela nasce em "domicílios em apartamento", que é o que está publicado hoje
- [ ] O popup de clique não muda

**Restrições:**

- Só as três variáveis do tile; qualquer outra é etapa 2, com ETL e republicação
- O painel é da casca compartilhada: vale para os dois clientes
- Tem de funcionar no tema claro e no escuro
- 47% das células valem zero nas três variáveis, e isso aparece igual em qualquer tema

**Fora de escopo (confirmado):** as 54 variáveis restantes, o seletor sobre o mapa,
mudança no popup, classes/quantis, memória entre sessões, opacidade.

---

## Resumo da sessão

| Métrica | Valor |
|---|---|
| Perguntas | 5 |
| Caminhos explorados | 3 |
| Cortes por YAGNI | 6 |
| Validações | 4 |
| Medições novas | 2 consultas ao `geodata` (limites por variável e rótulos) |

---

## Próximo passo

`/define .claude/sdd/features/BRAINSTORM_SELETOR_H3.md`
