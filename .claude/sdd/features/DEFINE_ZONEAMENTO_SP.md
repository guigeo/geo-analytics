# DEFINE: ZONEAMENTO_SP

> O zoneamento urbano de São Paulo entra como camada categórica do dado universal — e
> com ele o sistema aprende a pintar por categoria e a declarar o que uma camada NÃO cobre

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | ZONEAMENTO_SP |
| **Data** | 2026-09-03 |
| **Autor** | define (sessão Claude Code) |
| **Status** | Ready for Design |
| **Clarity Score** | 15/15 |
| **Origem** | [BRAINSTORM_ZONEAMENTO_SP.md](BRAINSTORM_ZONEAMENTO_SP.md) |
| **Pré-requisito** | ✅ Emenda ao ADR-0001 feita (`webgis`, `de24896`) |

---

## Problema

O zoneamento urbano de São Paulo — informação que o cliente 2 usa diariamente **fora** da
aplicação, no Google Earth — não existe no sistema. A aplicação não responde "o que dá pra
fazer neste lote?" nem mostra onde estão as zonas de um tipo, que são as duas perguntas do
negócio dele.

**Um segundo problema apareceu ao investigar, e é mais grave porque já está no ar:**
camada de cobertura parcial mente por omissão. O `ibge.bairro` existe em 895 dos 5.571
municípios, e **São Paulo tem zero**. Hoje o cliente 2 liga "Bairro", vê um mapa vazio, e
nada explica. O zoneamento seria o segundo caso — e por isso a emenda de 2026-09-03 à
regra 8 do ADR nomeou os dois como dívida desta feature.

---

## Usuários

| Usuário | Papel | Dor |
|---------|-------|-----|
| **Cliente 2 (EB Prime)** | Incorporação e prospecção em São Paulo | Sai da aplicação para consultar zoneamento; clica em cada polígono para descobrir o que a sigla significa |
| **Cliente 1 e próximos** | Análise territorial | Não têm a informação |
| **Agente de IA** | Responde no chat | Recusaria pergunta sobre uma camada visível na tela — a assimetria que a regra 7 do ADR chama de defeito |
| **Qualquer usuário fora da cobertura** | Uso geral | Liga uma camada parcial e vê nada, sem saber se o dado não existe ou se algo quebrou |

---

## Objetivos

| Prioridade | Objetivo |
|------------|----------|
| **MUST** | Zoneamento de SP no `geodata`, por script re-executável, no schema `regulacao` |
| **MUST** | O mapa pinta por categoria: matiz por família, tom por sufixo |
| **MUST** | Legenda agrupada por família — sem ela, 38 cores não significam nada |
| **MUST** | Clique mostra sigla, descrição por extenso e lei, tudo vindo da row |
| **MUST** | Tool `zoneamento_no_ponto` no agente — exigência da **regra 7** do ADR |
| **MUST** | A camada declara sua cobertura — exigência da **emenda à regra 8** |
| **MUST** | `ibge.bairro` ganha a mesma declaração — dívida nomeada na emenda |
| **SHOULD** | Paleta validada com o cliente 2 depois de pronta (não há âncora oficial) |
| **COULD** | Ajuste de `tippecanoe` se a tilagem dos 61.784 polígonos pesar |

---

## Critérios de sucesso

- [ ] **61.784 feições** carregadas, conferidas contra a contagem do WFS (`resultType=hits`)
- [ ] **38 códigos distintos** preservados; nenhum vira nulo ou "outros" por conveniência
- [ ] `meta.fonte` registra **lei 18.177/2024** e **`dt_atualizacao` 2025-03-28**, lidas do dado e não declaradas
- [ ] As **10.696+ feições `Praça/Canteiro` (36%)** carregam e são distinguíveis de zona no banco e no mapa
- [ ] **Zero tabelas de-para novas**: a descrição da sigla vem da row, não de um dicionário no código
- [ ] O agente responde "qual o zoneamento deste ponto" para ponto dentro de São Paulo, e diz que não há dado para ponto fora
- [ ] **Duas camadas parciais declaram cobertura**: zoneamento e `bairro`
- [ ] Portão do frontend verde: `format:check`, `lint`, `typecheck`, `test`, `build`
- [ ] **Nenhum `.tsx` cita cliente**; os dois clientes veem a camada

---

## Testes de aceitação

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| AT-001 | Carga completa | `geodata` vazio de `regulacao` | roda `cargas/geosampa_zoneamento.sh` | `regulacao.zoneamento` com 61.784 linhas, 38 códigos, geometria válida em 4674, linha em `meta.fonte` |
| AT-002 | Carga é idempotente | tabela já carregada | roda o script de novo | mesma contagem, sem duplicata, sem erro |
| AT-003 | **Camada certa** | — | inspeciona a URL do WFS no script | aponta para `perimetro_zona_lei_18177_24`, **não** para `zoneamento_2016_map1` nem para as revogadas da Lei 13.885/04 |
| AT-004 | Pintura por família | camada ligada, viewport em SP | observa o mapa | ZEIS-1..5 em tons do mesmo matiz; ZEPAM em matiz distinto; famílias distinguíveis entre si |
| AT-005 | `Praça/Canteiro` não é zona | camada ligada | observa uma praça | preenchimento neutro, sem cor de zona, e a legenda não a lista como zona |
| AT-006 | Clique informa sem tabela externa | camada ligada | clica num polígono ZEIS-1 | popup com `ZEIS-1`, "Zona Especial de Interesse Social 1" e a lei — valores vindos da feição |
| AT-007 | Agente responde (regra 7) | agente de pé | pergunta "qual o zoneamento da Av. Paulista 1000?" | responde a zona daquele ponto, com destaque no mapa |
| AT-008 | Agente fora da cobertura | agente de pé | pergunta o zoneamento de um ponto em Salvador | diz que não há zoneamento carregado para lá — **não** inventa e **não** responde vazio |
| AT-009 | Camada declara cobertura | painel de camadas | olha o zoneamento | declara "São Paulo (capital) · Lei 18.177/2024 · atualizado em 28/03/2025" |
| AT-010 | **A dívida do bairro** | painel de camadas | olha o `bairro` | declara que existe em 895 de 5.571 municípios e que São Paulo não tem nenhum |
| AT-011 | Fronteira de cliente | build dos dois clientes | `grep` por nome de cliente nos `.tsx` | nenhuma ocorrência; os dois bundles trazem a camada |

---

## Fora de escopo

- **Cruzamento área desenhada × zoneamento** — mecânica diferente: o cruzamento existente soma número por rateio areal, e zoneamento é categórico ("60% ZEIS-1, 40% ZC"). É a feature seguinte natural.
- **Tool de prospecção** ("onde estão as ZEIS-3") — a prospecção funciona visualmente com a cor nesta entrega
- **Filtro por categoria** no painel
- **Tratamento geral de cobertura parcial** — selo, aviso por viewport, glossário. Só a declaração mínima entra; a forma tem gatilho próprio no ADR (terceira camada parcial ou reclamação de cliente)
- **Zoneamento de outras cidades** — a coluna `cod_municipio` deixa a porta aberta, mas uma cidade primeiro
- **Camadas revogadas** (Lei 13.885/04) e a versão de 2016
- **Paleta oficial da Prefeitura** — indisponível (`ServiceUnavailable`; o host expõe só WFS)

---

## Restrições

| Tipo | Restrição | Impacto |
|------|-----------|---------|
| Arquitetural | Atravessa 3 repositórios | Carga no `servidor-dados-gis`, registry e front no `geo-analytics`, decisão no `webgis` (já feita) |
| Arquitetural | Pintura categórica é **casca**, não chave por cliente | Regra 1 do ADR, 2ª aplicação do critério de 2026-08-31. Entra no esquema como capacidade |
| Arquitetural | Camada nova entra **com** tool, ou não entra | Regra 7. Fixa `zoneamento_no_ponto` como MUST |
| Técnica | Fonte em EPSG:31983 (UTM 23S) | Reprojetar para 4674 na carga, como toda camada da casa |
| Técnica | 61.784 polígonos | Atenção à tilagem — longe dos 473k do setor, mas não trivial |
| Técnica | Sem âncora de paleta | Critério cartográfico, validado com o cliente depois |
| Processo | Publicar é passo do Guilherme | `make ship*` e `restart` do systemd não rodam pelo agente |

---

## Contexto técnico

| Aspecto | Valor | Notas |
|---------|-------|-------|
| **Local de deploy** | `servidor-dados-gis/cargas/` · `pipeline/datasets.yaml` · `web/src/configuracao/` · `web/src/map/` · `query/` · `agent/` | Feature atravessa 3 repositórios |
| **Domínios de KB** | `maplibre`, `pmtiles-tippecanoe`, `geospatial-etl` | Tematização categórica no MapLibre; tuning de tile; padrão de carga |
| **Impacto de IaC** | Nenhum recurso novo | Schema novo no `geodata` (`regulacao`) e tile novo no host compartilhado |

---

## Premissas

| ID | Premissa | Se errada | Validada? |
|----|----------|-----------|-----------|
| A-001 | O WFS do GeoSampa segue disponível e estável na hora da carga | Cai no padrão manual do Teleco: arquivo em `dados/`, script falha com instrução se faltar | [x] respondeu em 2026-09-03, 8 requisições |
| A-002 | `tx_zoneamento_perimetro` está preenchido para todos os códigos, exceto `Praça/Canteiro` | Popup e legenda ficariam com buraco; precisaria de fallback pelo código | [ ] **verificado em amostra de 30.000 das 61.784** — confirmar no total durante a carga |
| A-003 | 14 famílias × tons dão cores distinguíveis nos temas claro e escuro | Reduzir famílias ou mudar o eixo de variação (saturação em vez de luminosidade) | [ ] |
| A-004 | 61.784 polígonos tilam em tamanho aceitável sem tuning especial | Ajuste no `tippecanoe`, como já se fez com setor | [ ] |
| A-005 | `perimetro_zona_lei_18177_24` é a camada vigente, e não há uma mais nova | Zoneamento errado no ar, silenciosamente — o pior desfecho possível | [x] é a única com lei de 2024; as outras são 2016 e revogadas de 2004 |

---

## Clarity Score

| Elemento | Nota | Motivo |
|----------|------|--------|
| Problema | 3 | Dois problemas nomeados, um deles medido em produção (bairro, 895 de 5.571) |
| Usuários | 3 | Quatro perfis com dor específica, incluindo o agente |
| Objetivos | 3 | 7 MUST, 1 SHOULD, 1 COULD, todos derivados de regra do ADR ou de uso declarado |
| Sucesso | 3 | Nove critérios, sete com número medido contra a fonte |
| Escopo | 3 | Seis exclusões explícitas, cada uma com o motivo e o gatilho de volta |
| **Total** | **15/15** | |

---

## Questões em aberto

**Nenhuma que bloqueie o design.** Duas premissas seguem por validar e viram tarefa da fase
de build, não pergunta ao dono:

- **A-002** — completude da descrição no total das 61.784 (verificada em 30.000)
- **A-003** — distinguibilidade da paleta nos dois temas, que só se resolve desenhando

---

## Correções ao brainstorm

| O que mudou | Por quê |
|-------------|---------|
| **A tool do agente voltou ao escopo** como MUST (`zoneamento_no_ponto`) | O brainstorm a cortou por YAGNI. A regra 7 do ADR é literal: *"camada nova entra com a tool correspondente, ou não entra"* — e nomeia exatamente o defeito que ocorreria: a camada na tela, clicável, e o chat recusando a pergunta |
| **A dívida do `ibge.bairro` entrou como MUST** | A emenda ao ADR nomeou esta feature como dona dela. Gatilho não é lembrete |
| A pintura categórica **não** virou emenda de ADR | A emenda de 2026-08-31 à regra 1 já decide, por critério: não existe cliente plausível que queira não distinguir ZEIS de ZEPAM |

---

## Histórico de revisão

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-03 | define | Versão inicial, a partir do BRAINSTORM e da emenda ao ADR-0001 |

---

## Próximo passo

**Pronto para:** `/design .claude/sdd/features/DEFINE_ZONEAMENTO_SP.md`
