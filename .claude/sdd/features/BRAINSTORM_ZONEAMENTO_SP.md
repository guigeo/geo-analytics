# BRAINSTORM: ZONEAMENTO_SP

> Sessão exploratória para trazer o zoneamento urbano do município de São Paulo
> como camada temática do dado universal

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | ZONEAMENTO_SP |
| **Data** | 2026-09-03 |
| **Autor** | brainstorm (sessão Claude Code) |
| **Status** | Ready for Define |

---

## Ideia inicial

**Entrada bruta:** o cliente 2 (EB Prime) já usa uma camada de zoneamento de São Paulo
tematizada no Google Earth, e ela não existe na aplicação. O Guilherme quer trazê-la
**como core** — dado universal que serve cliente 1, cliente 2 e os próximos —, e não como
entrega pontual para um cliente.

**Contexto levantado:**

- A casca hoje pinta **camada monocromática**: o esquema Zod aceita uma `cor` por camada,
  e nenhuma das 8 camadas atuais é categórica. UF, município, setor, bairro e distrito são
  recortes, não categorias. O zoneamento é o **primeiro dado categórico** do sistema.
- O `servidor-dados-gis` tem 9 cargas re-executáveis, `_comum.sh` com download, staging e
  linhagem, e schemas `ibge`, `ibge_tabular`, `infraestrutura`, `indicadores`, `meta`,
  `staging`. A casa mistura critério de origem (`ibge`) e de natureza (`infraestrutura`,
  `indicadores`) — o schema mais novo, `indicadores`, é por natureza.
- O `datasets.yaml` é registry declarativo: camada nova é entrada nova, sem refactor.
- Já existe cruzamento de área desenhada × Censo por rateio areal
  (`query/queries.py:cruzamento_por_geometria`), consumido por `tools.py:info_area_desenhada`.

**Contexto técnico observado (para o /define):**

| Aspecto | Observação | Implicação |
|---------|-----------|------------|
| Local provável | `servidor-dados-gis/cargas/`, `pipeline/datasets.yaml`, `web/src/configuracao/`, `web/src/map/` | Feature atravessa 3 repositórios |
| KBs relevantes | `maplibre`, `pmtiles-tippecanoe`, `geospatial-etl` | Tematização categórica no MapLibre; tunning de tile |
| Emenda de ADR | Regra 1 (§6) e cobertura parcial | Pintura categórica é casca, não chave por cliente |

---

## Levantamento da fonte (feito nesta sessão, contra o servidor)

Tudo abaixo foi verificado por requisição real ao GeoSampa, não por documentação.

| # | Achado | Consequência |
|---|--------|--------------|
| 1 | **Existe WFS**: `wfs.geosampa.prefeitura.sp.gov.br/geoserver/ows`, 478 camadas, saída GeoJSON/GeoPackage/Shape-ZIP | A carga cabe em um `ogr2ogr`, como as outras 9. **Não precisa de pipeline de download nem do padrão manual do Teleco.** |
| 2 | A camada é `geoportal:perimetro_zona_lei_18177_24` — "Perímetro de Zonas – Lei 18.177 (mapa 1)" | **Armadilha:** o servidor também publica `zoneamento_2016_map1` e duas revogadas da Lei 13.885/04. Escolher errado é silencioso. |
| 3 | **61.784 feições**, EPSG:31983 (UTM 23S) | Reprojetar para 4674, como toda carga da casa |
| 4 | A descrição **já viaja com a linha**: `cd_zoneamento_perimetro='ZEPAM'` + `tx_zoneamento_perimetro='Zona Especial de Preservação Ambiental'` | A regra 8 do ADR já está satisfeita na origem. **Não há tabela de-para para construir**, e o glossário sai de graça — inclusive para o agente. |
| 5 | A lei e a data também vêm na linha: `cd_numero_legislacao_zoneamento=18177`, `an_legislacao_zoneamento=2024`, `dt_atualizacao=2025-03-28` | `meta.fonte` ganha versão **medida**, não declarada — que é a regra da casa |
| 6 | **38 códigos distintos**, que colapsam em ~14 famílias por sufixo | Olho humano separa ~10 cores. Tematização precisa de hierarquia. |
| 7 | **36% das feições têm código `Praça/Canteiro`** — não é zona, e é o único código sem descrição | Tematização ingênua pinta um terço do mapa com uma não-zona, **sem erro visível**. É o achado que mais mudou o desenho. |

**Tentado e indisponível:** estilo oficial da Prefeitura. `GetStyles` e `GetLegendGraphic`
respondem `ServiceUnavailable` — o host expõe só WFS. A paleta terá de sair de critério
cartográfico.

---

## Perguntas de descoberta

| # | Pergunta | Resposta | Impacto |
|---|----------|----------|---------|
| 1 | Como o cliente 2 usa o zoneamento hoje? | Consulta pontual **+** prospecção por tipo **+** cruzar com o acervo dele. **Não** é pano de fundo. | É camada de trabalho, não decorativa: pode ter cor forte, precisa de popup no clique, e abre caminho para tool do agente |
| 2 | O que fazer com as feições `Praça/Canteiro`? | Carregar, **mas separar** — não é zona | Segue o princípio do `servidor-dados-gis` ("preserve todos os dados da fonte, separando exceções"); no mapa fica neutra, sem cor de zona |
| 3 | Como pintar 38 códigos? | **Matiz por família, tom por sufixo** | ZEIS é azul; ZEIS-1 escuro, ZEIS-5 claro. 38 preenchimentos que leem como ~14 grupos. A distinção é legal, não cosmética: ZEIS-1 é favela ocupada, ZEIS-3 é área central subutilizada |
| 4 | Há amostra para ancorar (KMZ do cliente, print, paleta oficial)? | Nenhuma | Paleta sai de critério cartográfico e será validada com o cliente depois |
| 5 | Em que schema do `geodata` entra? | **`regulacao`** | Por natureza, não por origem. Cabe zoneamento hoje e operação urbana, tombamento/ZEPEC e APA amanhã |

---

## Inventário de amostras

| Tipo | Local | Quantidade | Notas |
|------|-------|-----------|-------|
| Dado real da fonte | WFS GeoSampa | 60.000 de 61.784 feições lidas | Censo completo de categorias e distribuição já feito nesta sessão |
| Ground truth de categorias | apurado do WFS | 38 códigos + contagem | Base para montar a paleta e para teste de carga |
| Código de referência | `cargas/ibge_bairro.sh` | 1 | Anatomia de carga de polígono: download, staging, tabela publicada, linhagem |
| Código de referência | `query/queries.py:cruzamento_por_geometria` | 1 | Mecânica de cruzamento, para a feature seguinte (não esta) |
| Estilo oficial | — | 0 | Indisponível: host expõe só WFS |

**Como as amostras serão usadas:** a distribuição das 38 categorias define a paleta e as
famílias; a contagem por categoria vira asserção de teste na carga (a validação que o
`AGENTS.md` do `servidor-dados-gis` exige: "contagens esperadas, ausência de órfãos,
validade das geometrias").

---

## Abordagens exploradas

### Abordagem A: camada completa, com pintura categórica na casca ⭐ Recomendada

**Descrição:** carga WFS → `regulacao.zoneamento` → `datasets.yaml` → PMTiles. No frontend,
o esquema Zod ganha pintura por categoria (matiz por família, tom por sufixo), o clique
abre popup com sigla, descrição e lei, e a legenda agrupa por família.

**Prós:**
- Entrega inteiros o uso 1 (consulta pontual) e o uso 2 (prospecção)
- A capacidade nova da casca — pintar por categoria — serve toda camada categórica futura
- Aproveita o dado como ele vem: descrição e lei já estão na linha

**Contras:**
- Mexe na casca, então exige emenda no ADR antes de codar
- 61.784 polígonos exigem atenção na tilagem

**Por que recomendada:** é o menor recorte que entrega o que o cliente já tem hoje no
Google Earth, sem entregar menos que isso.

---

### Abordagem B: fatiado — dado primeiro, cor depois

**Descrição:** fase 1 põe a camada no ar monocromática, como as 8 atuais, só com popup;
fase 2 traz a pintura categórica.

**Prós:**
- Dado no ar em dias
- Separa a mudança de casca numa entrega própria, mais fácil de revisar

**Contras:**
- **A fase 1 entrega exatamente a camada que não serve.** A cor *é* a feature: o cliente já
  tem a versão colorida, e uma camada cinza é regressão para ele

---

### Abordagem C: A + filtro por categoria + tool do agente

**Descrição:** entrega os três usos de uma vez, incluindo "qual o zoneamento da área que
eu desenhei".

**Prós:**
- Fecha o uso 3 (cruzar com o acervo) na mesma feature

**Contras:**
- **O cruzamento existente soma número com rateio areal; zoneamento é categórico.** A
  resposta certa não é uma soma, é "sua área é 60% ZEIS-1 e 40% ZC" — mecânica diferente
  na mesma fachada, e merece rodada própria

---

## Abordagem escolhida

| Atributo | Valor |
|----------|-------|
| **Escolhida** | Abordagem A, com os cortes de YAGNI abaixo |
| **Confirmação** | 2026-09-03, na sessão |
| **Razão** | Menor recorte que iguala o que o cliente já tem, sem entregar menos |

---

## Decisões tomadas

| # | Decisão | Razão | Alternativa rejeitada |
|---|---------|-------|----------------------|
| 1 | Carga por **WFS**, re-executável | O WFS torna a carga um `ogr2ogr`; o caminho barato aqui também é o reprodutível, e mantém o 1º invariante do `servidor-dados-gis` sem custo extra | Download manual no padrão Teleco — desnecessário aqui |
| 2 | Schema **`regulacao`** | Por natureza, como o `indicadores`. Cabe operação urbana, tombamento e APA depois | `geosampa`/`prefeitura_sp` (parte o mesmo tipo de dado por fonte; e linhagem já mora no `meta.fonte`); `municipal` (recusado); `infraestrutura` (zona é norma, não coisa construída) |
| 3 | Tabela `zoneamento` com coluna `cod_municipio`, **não** `zoneamento_sp` | Faz a cobertura virar consulta em vez de convenção. Cidade nova é linha, não tabela | Tabela por município |
| 4 | `Praça/Canteiro` **carrega e separa** | Princípio da casa: preservar o dado da fonte, separando exceções. O usuário vê que ali não há zoneamento, em vez de um vazio inexplicado | Filtrar na carga (joga fora dado da fonte); tratar como 39ª categoria (a maior fatia competiria com o zoneamento real) |
| 5 | Pintura **matiz por família, tom por sufixo** | Lê como ~14 grupos de longe e distingue 38 de perto. A distinção ZEIS-1/ZEIS-3 é jurídica, não cosmética | 14 cores chapadas (perde o que importa na prospecção); 38 cores independentes (confete) |
| 6 | Pintura categórica entra como **casca**, não chave por cliente | Regra 1 do ADR, emenda de 2026-08-31: o que serve a todo cliente é casca, e virar chave só cria chave para errar | Ligar por cliente |
| 7 | A camada **declara-se**: "São Paulo (capital) · Lei 18.177/2024 · atualizado em 28/03/2025" | Uma frase, com dado que já vem na linha. Resolve o mínimo do problema de cobertura parcial sem construir glossário | Sistema de glossário (adiado) |

---

## Cortado por YAGNI

| Cortado | Razão | Volta depois? |
|---------|-------|---------------|
| Filtro por categoria | A prospecção funciona visualmente com a cor; filtro é refinamento | Sim |
| Tool do agente: área desenhada × zoneamento | Resposta categórica, não somável — mecânica diferente do rateio areal existente | **Sim, é a feature seguinte natural** |
| Glossário e tratamento geral de cobertura parcial | Dono pediu explicitamente para não construir agora; fica só a frase mínima | Sim, quando chegar a 2ª camada parcial |
| Paleta oficial da Prefeitura | Indisponível no servidor (`ServiceUnavailable`); transcrever à mão é trabalho sem garantia | Sim, se a Prefeitura publicar |
| Zoneamento de outras cidades | Uma cidade primeiro. A coluna `cod_municipio` já deixa a porta aberta | Sim |

---

## Validações incrementais

| Seção | Apresentada | Retorno | Ajustou? |
|-------|-------------|---------|----------|
| Abordagens + cortes de YAGNI | ✅ | "fecha em A com esses cortes" | Não |
| Forma técnica: onde cada peça mora, nome da tabela, schema | ✅ | Schema `regulacao` escolhido | Não |

---

## Requisitos sugeridos para o /define

### Problema (rascunho)

O zoneamento urbano de São Paulo — informação que o cliente 2 já usa diariamente fora da
aplicação, no Google Earth — não existe no sistema, e por isso a aplicação não responde a
"o que dá pra fazer neste lote?" nem mostra onde estão as zonas de um tipo.

### Usuários (rascunho)

| Usuário | Dor |
|---------|-----|
| Cliente 2 (EB Prime) | Precisa sair da aplicação para consultar zoneamento, e clicar para descobrir o que cada sigla significa |
| Cliente 1 e próximos | Não têm a informação |
| Agente de IA | Não sabe responder sobre uso do solo |

### Critérios de sucesso (rascunho)

- [ ] A camada carrega no `geodata` por script re-executável, com as 61.784 feições conferidas
- [ ] `meta.fonte` registra lei (18.177/2024) e data de atualização vindas do dado, não declaradas
- [ ] O mapa pinta as zonas com matiz por família e tom por sufixo; `Praça/Canteiro` sai neutra
- [ ] O clique mostra sigla, descrição por extenso e lei — sem consulta a tabela externa
- [ ] A legenda agrupa por família e cabe na tela
- [ ] A camada declara cobertura e vigência numa frase
- [ ] Os dois clientes veem a camada; nenhum arquivo `.tsx` cita cliente

### Restrições identificadas

- Feature atravessa 3 repositórios: **a emenda no ADR-0001 vem antes do código**
- A casca não sabe pintar por categoria hoje — é capacidade nova, e é casca (regra 1)
- 61.784 polígonos: atenção à tilagem, ainda que longe dos 473k do setor
- Paleta sem âncora oficial; validar com o cliente 2 depois de pronta

### Fora de escopo (confirmado)

- Filtro por categoria
- Tool do agente para área desenhada × zoneamento
- Glossário e tratamento geral de cobertura parcial
- Zoneamento de outras cidades
- Camadas revogadas (Lei 13.885/04) e a versão de 2016

---

## Resumo da sessão

| Métrica | Valor |
|---------|-------|
| Perguntas feitas | 5 |
| Abordagens exploradas | 3 |
| Cortes por YAGNI | 5 |
| Validações | 2 |
| Requisições reais à fonte | 8 |

---

## Próximo passo

**Pronto para:** `/define .claude/sdd/features/BRAINSTORM_ZONEAMENTO_SP.md`

**Antes do `/build`, e fora do SDD:** a emenda no ADR-0001 do `webgis` — pintura categórica
como casca (regra 1) e o primeiro dado de cobertura parcial. Decisão que muda outro
repositório não se resolve na sessão da feature.
