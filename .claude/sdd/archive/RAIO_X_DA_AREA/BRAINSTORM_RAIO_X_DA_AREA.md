# BRAINSTORM: Raio-X da Área

> Proposta de MVP para transformar uma área desenhada em um diagnóstico territorial
> verificável. Documento de produto para debate e enriquecimento; não autoriza
> implementação, carga de dados ou publicação.

## Metadados

| Atributo | Valor |
|---|---|
| **Feature** | `RAIO_X_DA_AREA` |
| **Data** | 2026-09-07 |
| **Autor** | Codex, a partir da conversa com Guilherme Ramos |
| **Revisão** | 2026-09-07 — crítica de produto contra o relatório da InfoTerras; a tese mudou de eixo, e o Guilherme fechou classe social e as geometrias |
| **Status** | Pronto para `/define`. Execução prevista pelo Codex |
| **Decisão transversal** | Emenda de 2026-09-07 ao ADR-0001 no `webgis` |

---

## Ideia e tese de produto

O GeoIntelligence deixa de pedir que a pessoa saiba quais camadas ligar ou quais
perguntas formular. Ao desenhar, salvar ou selecionar uma área, ela recebe um
**Raio-X da Área**: uma leitura territorial curta, verificável e navegável no mapa.

O primeiro produto não promete "viabilidade comercial", "fluxo" ou "potencial de
venda". Com o dado atual, ele descreve com segurança **quem mora na área, quanto
isso varia por dentro do próprio recorte, como esses números se posicionam contra
a cidade e qual a qualidade dessa leitura**. Isso é útil por si só e cria a
superfície certa para acrescentar, depois, oferta, acessibilidade, regulação e
lentes de negócio.

### A revisão de 2026-09-07: a média não é a notícia

A primeira versão deste documento propunha quatro blocos descritivos — pessoas,
renda, saneamento, qualidade. A crítica contra o relatório rural da InfoTerras
mostrou o defeito: **aquele PDF é desejado porque avisa, não porque descreve.**
O que prende o leitor não é "13.217 ha, pastagem 47%"; é "6 processos minerários
incidem sobre 58% do imóvel", "déficit de Reserva Legal de 3.894 ha", "80% da
fazenda já queimou". São fatos com consequência, e que o leitor **não sabia**.

O equivalente urbano não pode ser a média do recorte. Quem desenha em Moema já
sabe que é rico; quem desenha na Brasilândia já sabe que não é. A média de área
urbana confirma intuição, e confirmação não gera desejo de usar de novo.

**A surpresa que já existe no dado em produção é a variação dentro do próprio
desenho.** O `cruzamento_por_geometria` calcula setor a setor e devolve só a média
ponderada — descarta exatamente a informação que surpreende. Um desenho de 500 m
toca 40 setores (medido, `query/src/geo_query/queries.py:833`) e quase nunca é
homogêneo: "renda média de R$ 4.200" pode esconder setor de R$ 1.100 e setor de
R$ 9.800 lado a lado, dentro do mesmo polígono.

Essa mudança de eixo resolve quatro coisas de uma vez:

- **É nacional.** Vale nos 468 mil setores do Censo 2022, em qualquer cidade, sem
  carga nova. Não depende de cobertura parcial nenhuma.
- **É a surpresa que o relatório rural tem.** "Há coisa dentro do seu polígono que
  você não sabia" — a versão urbana do apontamento fundiário.
- **Serve o cliente que existe.** A EB Prime é imobiliária; saber que o lado leste
  do recorte é outro mercado é a informação que ela vende.
- **É o antídoto honesto do rateio areal.** Em vez de afirmar um número único
  apoiado na hipótese fraca de população uniforme dentro do setor, mostra a
  distribuição. A ressalva vira conteúdo.

### Objetivo do MVP

Em menos de um minuto, uma pessoa autenticada desenha ou escolhe uma área salva e
entende o perfil territorial dela — e quanto esse perfil varia por dentro — sem
depender do chat. O chat passa a explicar e aprofundar um diagnóstico que já está
estruturado, não a inventar o diagnóstico.

### Perguntas que o MVP responde

- Qual é a área, quantos setores ela toca e quão confiável é a agregação?
- Quantas pessoas e domicílios há no recorte?
- **O recorte é homogêneo ou há mercados diferentes dentro dele? Onde ficam?**
- **Como esses números se posicionam contra o município?**
- Qual é a renda disponível no Censo e o perfil de ocupação residencial?
- Onde há regulação carregada, o que o zoneamento permite ali?
- O que esses números descrevem e o que eles **não** permitem concluir?

### Perguntas explicitamente fora do MVP

- Há fluxo de pedestres, carros ou pessoas suficiente para um negócio?
- Quantas empresas, concorrentes ou consumidores existem no entorno?
- Esta área é boa para farmácia, posto, varejo ou incorporação?
- Há disponibilidade ou preço imobiliário favorável?

Essas perguntas exigem fontes novas e uma regra de negócio explícita. Respondê-las
com população e renda apenas produziria um "score" persuasivo, mas sem fundamento.

---

## Inventário que já existe

| Capacidade existente | Uso no Raio-X | Limite que deve aparecer ao usuário |
|---|---|---|
| Desenhos, buffers e polígonos salvos no `app_clientes` | Identidade e geometria da área analisada | É dado do cliente; não pode ir para o `geodata` |
| `cruzamento_por_geometria` no PostGIS | Agregação espacial exata dos setores cortados pelo polígono | Borda usa rateio areal e precisa declarar a fração afetada |
| As linhas por setor que esse cruzamento já calcula | **Bloco de contraste interno** — hoje são descartadas | Setor é a menor unidade; abaixo dele não há leitura |
| Censo 2022 curado | População, domicílios, densidade, renda e composição disponível | Retrato de 2022, não medição atual |
| `municipio_resumo` | Referência comparativa de toda métrica do Raio-X | Comparar com o município é uma âncora, não um juízo |
| Pintura por valor numérico e legenda na casca (`TELA_H3`, 2026-09-07) | Pintar os setores do desenho por valor, com legenda | Nasceu para tile com valor embutido; aqui os valores vêm da consulta |
| `regulacao.zoneamento` | Bloco condicional de regulação | **Só o município de São Paulo** (Lei 18.177/2024) |
| Classe social estimada | Bloco próprio: composição A/B/C/DE sob a área | Única métrica que o IBGE **não** publica; rótulo "(estimada)" e aviso junto da linha. Fora da primeira dobra |
| H3 + CNEFE | Ponderação dasimétrica para corrigir o rateio areal | Hoje a tool consulta uma célula por ponto e cobre 37 municípios |
| Chat com tools e grounding | Explicar, comparar e responder perguntas sobre a área | Não calcula nem decide alertas; consome o diagnóstico determinístico |
| Mapa, seleção e acervo | Mostrar a geometria e levar cada achado à evidência geográfica | PMTiles é entrega visual, não fonte analítica do relatório |

O MVP nasce sem carga nova. Tudo o que os blocos universais precisam já está no
`geodata` e já é calculado; o que falta é guardar, comparar e mostrar.

---

## Os blocos do MVP

### 1. Escala

Área desenhada, setores tocados, população, domicílios e densidade. Cada valor
acompanhado da referência municipal. A população vem **partida em duas**: a que
está em setores integralmente contidos e a que resulta de rateio na borda —
porque no recorte urbano típico 30 dos 40 setores entram cortados (75%, medido).

### 2. Contraste interno

O bloco que carrega o produto. A distribuição das métricas entre os setores de
dentro do desenho: onde estão os extremos, quanta população vive em cada faixa, e
o mapa pintado por valor com a legenda que a casca já tem. Responde "o seu recorte
é um mercado só, ou três?".

Não é um índice de dispersão para estatístico ver: é a leitura de que existe um
lado e outro dentro do mesmo polígono, com o mapa provando onde.

### 3. Perfil

Renda média (**nunca mediana**), média de moradores por domicílio e composição por
sexo, sempre com a posição relativa ao município.

### 4. Classe social estimada

Bloco próprio, decidido pelo Guilherme em 2026-09-07. A composição
`pct_classe_a/b/c/de` — quatro classes, não cinco —, com a mesma comparação
municipal dos demais blocos e a distribuição entre os setores de dentro, que aqui
é especialmente reveladora: é comum um desenho ter setor majoritariamente A ao
lado de setor majoritariamente DE.

Três guardas não negociáveis, porque já são regra da casa e não escolha desta
feature: o rótulo diz **"(estimada)"**; o aviso do `_avisos_classe_social()` viaja
**junto da linha**, não no prompt (regra 8 do ADR-0001); e o texto diz "na mesma
régua do Critério Brasil", nunca "segundo a ABEP" — o método é outro, aqui é renda
domiciliar estimada. É a única métrica do produto que o IBGE não publica, e a tela
tem de deixar isso óbvio sem que ninguém precise passar o mouse em nada.

A **média de `classe_social_score` fica fora**: média ponderada de um ordinal não
significa nada. O bloco é a composição, que é defensável.

### 5. Qualidade da leitura

Fração de rateio, setores parciais, ano do Censo, cobertura de cada fonte e o que
a leitura não permite concluir. **É bloco, não rodapé.** É a página de Encerramento
do relatório rural: metodologia, fonte, data de extração e ressalva.

### 6. Regulação — condicional

Percentual do polígono em cada zona de uso, onde houver zoneamento carregado.
Quando não houver, **o bloco afirma a ausência** ("regulação de uso do solo não
carregada para São Caetano do Sul") em vez de sumir da tela. Cobertura parcial que
some por omissão é a mentira silenciosa que a emenda de 2026-09-03 à regra 8 já
proíbe para camadas do mapa; aqui vale igual.

### O que saiu, e por quê

| Saiu | Motivo |
|---|---|
| Saneamento como bloco fixo | `pct_agua_rede`, `pct_esgoto_rede` e `pct_lixo_coletado` saturam perto de 99% no urbano. Um bloco que lê 99/98/100 em nove de cada dez áreas gasta uma dobra para não ensinar nada. Vira exceção: aparece só quando desvia do município |
| `renda_mediana` da síntese | `_SEM_AGREGACAO` recusa a métrica com a justificativa correta — mediana de medianas não é mediana (`queries.py:93`). O exemplo da primeira versão era inimplementável |
| Média de `classe_social_score` | Média ponderada de um ordinal. A composição `pct_classe_a/b/c/de` é defensável; a média do score é menos |
| Raio-X para desenho de **ponto** | Ponto não tem área, e todo o diagnóstico é agregação sob geometria. A ação não aparece para ele (decidido em 2026-09-07) |
| Zoneamento como bloco central | Cobre só o município de São Paulo. O `cidadeExemplo` da EB Prime é São Caetano do Sul (`web/src/clientes/eb-prime.ts:26`): o bloco nasceria vazio na cidade de demonstração do cliente 2 |
| LLM na síntese | Custo e não-determinismo por visualização, para reescrever um texto que o template já entrega. A síntese da InfoTerras é template e lê bem |

---

## Experiência proposta

1. A pessoa desenha, escolhe ou abre uma área já salva — **polígono ou buffer**.
   Desenho de ponto não gera Raio-X, e a ação não aparece para ele.
2. O painel de atributos exibe a ação **Gerar Raio-X**.
3. A aplicação abre uma página de diagnóstico para aquela área, com endereço
   próprio, composta por dados estruturados e não por uma mensagem de chat.
4. A primeira dobra traz a síntese: dimensão, população, domicílios, densidade,
   a posição contra o município e o principal aviso de qualidade.
5. Os blocos seguem na ordem Escala → Contraste interno → Perfil → Classe social →
   Qualidade, com Regulação quando houver cobertura.
6. Cada bloco tem fonte, ano, método e uma ação para localizar o dado no mapa.
   Perguntas curadas levam o contexto ao chat.
7. A página sai bem no papel e pode ser revisitada pelo mesmo endereço. O MVP não
   gera PDF nem cria snapshot imutável do resultado.

### Forma da síntese

A síntese é **template**, montada dos números do contrato. Exemplo de forma, não
de texto fixo:

> Área de X ha, com Y habitantes e Z domicílios segundo o Censo 2022 — densidade
> de N hab/km², acima da média do município. A leitura usa K setores, e a renda
> média entre eles vai de R$ A a R$ B. P% da população vem de setores cortados
> parcialmente pelo polígono.

Números, avisos, fonte e data vêm do objeto de diagnóstico. Não há semáforo, nota
ou "oportunidade" no núcleo universal.

---

## Abordagens consideradas

### A. Raio-X determinístico na tela, com contraste interno como bloco central — **recomendada**

Uma API de análise de área devolve um contrato estruturado com agregado,
distribuição por setor e referência municipal; a UI compõe o diagnóstico; o chat
recebe esse mesmo contexto.

**Por que escolher:** prova valor com o dado existente, mantém todos os números
auditáveis, entrega uma informação que o usuário não tinha, e permite descobrir
quais blocos são realmente usados antes de investir em máquina de PDF, novos dados
ou scores.

**Custo:** não entrega imediatamente um artefato para encaminhar por e-mail — só a
página impressa.

### B. Gerar primeiro um PDF extenso

**Rejeitada para o MVP:** congela conteúdo antes de saber o que importa, cria dois
produtos (tela e PDF), requer fila/worker/armazenamento e pode dar aparência de
laudo a um retrato ainda limitado de Censo.

### C. Abrir primeiro dezenas de novas camadas e um score de oportunidade

**Rejeitada para o MVP:** demora a primeira demonstração, mistura hipóteses de
negócio com dado universal e esconde qual fonte realmente mudou a decisão.

### D. Apostar o MVP no zoneamento

Foi a recomendação inicial da crítica, e **caiu na conferência da cobertura**:
`regulacao.zoneamento` só tem o município de São Paulo, e a cidade-exemplo do
cliente 2 não está nela. Vira bloco condicional; expandir é assunto de piloto, não
de lançamento.

---

## Plano de execução proposto

A Fase 0 "sem código" da primeira versão foi absorvida pelo `/define`: para um dev
sozinho com cliente real, uma fase que não produz nada rodando é a fase que morre.

### Fase 1 — Núcleo determinístico de diagnóstico

**Resultado:** `raio_x_por_geometria` no `query/`, ao lado do
`cruzamento_por_geometria` — **sem substituí-lo**, porque o chat livre continua
usando aquele.

- Devolver, num payload só: o agregado que já existe; as linhas por setor com
  valor, fração de corte e `cod_setor`; as mesmas métricas para o município de
  referência; `versao_calculo` e `gerado_em`.
- Fixar as métricas do MVP; a API não aceita campo arbitrário do navegador.
- **População partida em contida e rateada é requisito, não refinamento** — decorre
  de buffer estar dentro do escopo, que é o pior caso do rateio.
- Recusar geometria de ponto com mensagem, não com erro genérico.
- Preservar como dado os avisos de rateio, extensão e estimativa, e o
  `_avisos_classe_social()` junto da linha de classe.
- Teto de área e teto de setores devolvidos: o município de São Paulo são 27.719
  setores em 1,32 s (medido, `queries.py:837`), e essa lista não vai ao navegador.
- Cobrir em testes uma área interna a um setor, uma área que corta setores, uma
  área acima do teto, desenho inexistente e acervo indisponível.

**Não entra:** H3 agregado, PDF, scores, nova carga ou mudança no `geodata`.

### Fase 2 — Rota de diagnóstico

**Resultado:** `GET /api/raio-x/{desenho_id}` em `agent/src/geo_agent/rotas_raio_x.py`,
router novo no mesmo molde do `rotas_desenhos.py`, atrás da mesma sessão.

- Ler a geometria no `app_clientes`, chamar o `query`, devolver o contrato.
- **Sem LLM no caminho:** a rota responde com o agente de chat fora do ar, e é isso
  que mantém a promessa da §9 do ADR.
- Toda falha vira 503 ou 422, como no `rotas_desenhos.py`.

### Fase 3 — Tela e chat contextual

**Resultado:** uma pessoa vê o diagnóstico de uma área salva e consegue aprofundar
um achado no chat.

- Rota de interface com endereço próprio por desenho, e a ação no acervo.
- Renderizar os blocos, com números, unidades, comparação municipal e avisos.
- Pintar os setores do desenho por valor, reaproveitando a pintura e a legenda que
  a `TELA_H3` deixou na casca. Aqui os valores vêm da consulta, não do tile.
- `obter_raio_x` como tool do chat **nesse contexto**: quem está olhando um Raio-X
  não pode ter o LLM reagregando por conta e produzindo número diferente do da tela.
- Folha de estilo de impressão.
- Validar em desktop e celular; validar a degradação com o agente fora do ar.

**Não entra:** snapshot, persistência do resultado, PDF.

### Fase 4 — Produção e piloto

**Resultado:** o Raio-X no ar nos dois clientes, e evidência para decidir a próxima
camada.

- Subir pelo fluxo que já existe: `make preview`, `make ship-ia` com restart do
  systemd pelo Guilherme, `make ship-app`. `GRANT` ao `geo_reader` se a Fase 1
  tocar objeto novo — é o passo que sempre escapa.
- Usar o Raio-X em áreas reais com convidados de teste.
- Registrar quais blocos foram abertos, quantas vezes alguém clicou num setor do
  contraste interno, e o que faltou para a pessoa decidir.
- Classificar as perguntas não respondidas em oferta, acessibilidade, regulação,
  dinâmica ou dado específico do cliente.

**Critério de saída:** escolher uma única lente adicional por evidência de uso.

### Fase 5 — Zoneamento por área, e uma segunda cidade

- Converter a consulta de ponto para interseção com fração, devolvendo o percentual
  do desenho em cada zona — mesma forma do rateio que já existe.
- **Spike de uma cidade a mais: São Caetano do Sul**, por ser a cidade-exemplo do
  cliente 2. A coluna `cod_municipio` já deixou a porta aberta
  (`.claude/sdd/archive/ZONEAMENTO_SP/SHIPPED_2026-09-06.md:118`).
- O objetivo do spike é medir o custo real por cidade. Zoneamento não é pipeline:
  cada município é outra lei, outro portal e outros códigos de zona. Só depois de
  duas cidades dá para dizer se isso escala ou se é ingestão avulsa para sempre.

### Fase 6 — Ambiente construído: corrigir o rateio

**A justificativa mudou.** Não é "casas versus apartamentos" — isso é consequência.
O ganho é substituir o rateio areal por **ponderação dasimétrica** com os endereços
do CNEFE: em vez de espalhar a população do setor por área, distribuí-la por onde
há endereço. Isso conserta o número de manchete do produto.

- Implementar agregação H3 por geometria, sem tratar célula fora de cobertura como
  zero.
- Declarar o recorte de 37 municípios e o caráter medido/estimado de cada métrica.
- **Antes de qualquer exposição:** regra de contagem mínima por célula e proibição
  de expor endereço. O CNEFE é dado quase pessoal.

### Fase 7 — Página compartilhável e PDF

**Gatilho:** pessoas demonstram que precisam encaminhar o diagnóstico e a tela já
tem blocos estáveis.

- Persistir um *snapshot* imutável dos dados, fontes, versão de cálculo e geometria.
- Gerar PDF a partir do mesmo contrato visual, por job assíncrono.
- Armazenar metadados no `app_clientes` e o arquivo em armazenamento de objetos;
  binário de relatório não vai para o `geodata` reconstruível.
- Definir retenção, acesso, marca do cliente e limite de geração.

Essa fase exige desenho de infraestrutura e emenda adicional do ADR.

---

## Arquitetura-alvo de longo prazo

```text
geometria salva (app_clientes)
            ↓
motor de diagnóstico espacial (geodata, somente leitura)
            ↓
contrato estruturado: agregado + distribuição + referência + avisos + proveniência
       ┌────┼────┐
       ↓    ↓    ↓
     mapa  chat  página/PDF
```

O motor universal não conhece "farmácia", "posto" ou outro negócio. Ele expõe
lentes territoriais verificáveis. Uma lente de negócio é uma configuração e regras
explícitas do cliente sobre esse núcleo — e só entra depois de haver a fonte que a
sustente.

### Próximas famílias de dado, condicionadas a pergunta validada

| Família | Perguntas que pode responder | Estado |
|---|---|---|
| Regulação local | Uso permitido, restrições e risco urbano | Carregada só no município de São Paulo; expansão é ingestão avulsa por cidade |
| Ambiente construído (H3/CNEFE) | Corrigir o rateio; casas, apartamentos e domicílios | Tabela por célula no `geodata`; falta agregação por área |
| POIs e estabelecimentos | Oferta, concorrência e equipamentos próximos | Não carregada. O `empresas_cnpj_brasil` já baixa da Receita, mas não geocodifica nem publica |
| Acessibilidade e transporte | Proximidade, rede, tempo e acesso a polos | Não carregada; o eixo de ruas nacional esbarra no espaço da VPS |
| Dinâmica/mobilidade | Fluxos e mudança no tempo | Não carregada; não inferir do Censo |
| Dados próprios do cliente | Cobertura, unidades, resultado e carteira | Fica no `app_clientes`, nunca no banco central |

---

## Decisões já tomadas nesta exploração

| Decisão | Motivo |
|---|---|
| O bloco que carrega o MVP é o contraste interno | Média de área urbana confirma intuição; variação dentro do desenho é o que o usuário não sabia |
| Toda métrica sai com referência municipal | Número urbano isolado não significa nada. A âncora é parte do dado, não pergunta de chat |
| População sai partida: contida e rateada | 75% dos setores entram cortados no recorte típico; um número único esconde a hipótese mais fraca do produto |
| Zoneamento é bloco condicional, não central | Cobre só o município de SP, e não cobre a cidade-exemplo do cliente 2 |
| Cobertura ausente é afirmada, não omitida | Emenda de 2026-09-03 à regra 8: camada parcial mente por omissão |
| Síntese é template, sem LLM | Custo zero, renderiza instantâneo, funciona com o agente fora do ar e não inventa adjetivo na manchete |
| Começar pela tela, não pelo PDF | Validar conteúdo e experiência antes de criar infraestrutura de documento |
| Mas a página tem endereço próprio e sai no papel | Encaminhar é o que transforma demonstração em venda, e custa quase nada quando o diagnóstico é determinístico |
| Diagnóstico é determinístico; chat o explica | Números, fontes e ressalvas não podem depender de prompt |
| `obter_raio_x` é a tool do contexto de Raio-X | Se o chat reagregar por conta, o número dele diverge do da tela justamente quando a pessoa vai conferir |
| MVP usa Censo + área desenhada existentes | Cria demonstração real agora e reduz escopo |
| Não produzir score ou recomendação de negócio universal | Oportunidade depende de tese e dado que ainda não existe |
| **Classe social é bloco próprio** (Guilherme, 2026-09-07) | É leitura de negócio, não nota de rodapé: a composição por classe é o que uma imobiliária lê primeiro. Entra com rótulo "(estimada)", aviso junto da linha e a régua declarada — a estimativa é sinalizada pelo texto, não escondida pelo tamanho |
| **Buffer e polígono geram Raio-X; ponto não** (Guilherme, 2026-09-07) | Ponto não tem área. E como buffer é o desenho mais provável e o pior caso do rateio, a população partida em contida/rateada deixa de ser refinamento e vira requisito da Fase 1 |
| Dados do cliente continuam separados | Preserva o `geodata` reconstruível e o isolamento entre clientes |

## Fora de escopo confirmado para o MVP

- PDF, download, snapshot, compartilhamento público e white-label.
- Empresas, CNPJ, POIs, concorrência, mobilidade e preço de imóvel.
- Score, semáforo ou recomendação de negócio.
- Novo pipeline nacional de dados e expansão da VPS.
- H3 agregado por área.
- Saneamento como bloco fixo.
- Raio-X para desenho de ponto.

---

## Riscos conhecidos

| Risco | Tratamento no MVP |
|---|---|
| **Área contida num setor só** — é a primeira interação provável (uma esquina, um quarteirão), e o Raio-X sairia idêntico ao do quarteirão vizinho | Política explícita: dizer na primeira dobra que o recorte está inteiro dentro de 1 setor de X ha, desenhar a fronteira do setor no mapa, e não exibir o bloco de contraste interno |
| **Rateio areal** pressupõe população uniforme dentro do setor — falso ao lado de parque, borda de favela, lote industrial | População partida em contida/rateada; faixa em vez de ponto quando o rateio domina; correção dasimétrica na Fase 6 |
| **Redlining** — classificar áreas por classe social estimada para orientar decisão comercial. O bloco entra por decisão de produto, e o risco não some com a decisão | Rótulo "(estimada)" e régua declarada em toda superfície; composição em vez de nota única, para não haver um selo "área classe DE"; e o bloco descreve quem mora, nunca recomenda o que fazer. Fora da primeira dobra |
| **Privacidade do cliente** — a área salva é a intenção de prospecção dele, e vai junto ao payload se o chat mandar o contexto para a API do LLM | Decisão explícita no `/define`, não silêncio |
| **Privacidade do CNEFE** — endereço é dado quase pessoal | Regra de contagem mínima por célula escrita antes da Fase 6, não durante |
| **Performance** — polígono grande sem teto | Teto de área, timeout com mensagem, teto de geometria devolvida ao mapa |
| **Custo de LLM** | Síntese em template; LLM só depois da pergunta |
| **Casca comum × cliente = dado** | Os blocos saem das camadas que aquele cliente tem; bloco sem fonte afirma a ausência |

## Métricas de aprendizagem do piloto

- Percentual de áreas salvas que geram Raio-X.
- Tempo entre desenho e primeira leitura útil.
- **Cliques em setor dentro do bloco de contraste interno** — é o indicador de que
  a tese desta revisão está certa.
- Blocos abertos e perguntas curadas acionadas.
- Perguntas que o produto não responde, classificadas por família de dado.
- Diagnósticos impressos ou solicitados em formato de documento.
- Relato qualitativo: qual decisão a pessoa conseguiu adiantar ou o que faltou.

## Questões para decidir no `/define`

Duas já foram respondidas pelo Guilherme em 2026-09-07 e estão na tabela de
decisões: **classe social entra como bloco próprio**, e **buffer e polígono geram
Raio-X, ponto não**. Restam:

1. Qual é a decisão concreta do primeiro usuário — ponto de loja, terreno para
   incorporação, dimensionamento de carteira? Isso ordena a primeira dobra.
2. Que métricas do contraste interno vão à tela: extremos e faixas de população,
   ou também a comparação entre os setores e a mediana municipal?
3. O payload e o nome da área podem sair para a API do LLM?
4. Zoneamento por área entra já no MVP ou fica para a Fase 5? É barato, mas é a
   primeira coisa a cortar se a entrega atrasar.

## Próximo passo

**Pronto para:** `/define .claude/sdd/features/BRAINSTORM_RAIO_X_DA_AREA.md`

Antes do `/design`, qualquer decisão que acrescente armazenamento de relatório,
fila/worker ou fonte universal nova deve virar emenda do ADR-0001 no `webgis`.
