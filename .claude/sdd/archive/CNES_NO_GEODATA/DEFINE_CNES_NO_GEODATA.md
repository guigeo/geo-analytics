# DEFINE: CNES_NO_GEODATA

> Carregar mensalmente o cadastro oficial de estabelecimentos de saúde no `geodata`, com
> identidade CNES, geometria auditável e linhagem suficiente para servir futuras consultas e
> tiles sem depender do CNEFE.

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | CNES_NO_GEODATA |
| **Data** | 2026-09-18 |
| **Autor** | Codex + Guilherme Ramos |
| **Status** | ✅ Shipped |
| **Clarity Score** | 15/15 |
| **Origem** | [`BRAINSTORM_CNES_NO_GEODATA.md`](BRAINSTORM_CNES_NO_GEODATA.md) |
| **Repositório principal** | `../servidor-dados-gis` |

## Problema

O sistema não possui uma base persistida e reproduzível de estabelecimentos de saúde. O
Raio-X atual conta endereços classificados como saúde pelo CNEFE; esse universo inclui
consultórios, atividades privadas, registros concentrados no mesmo edifício e possíveis
repetições, portanto não equivale a unidades identificadas.

A antiga camada `saude_cnes` existiu apenas como fonte externa e tile, sem tabela canônica
no Postgres. Para que mapa e análise territorial possam compartilhar o mesmo número, o CNES
precisa primeiro entrar no `geodata` a partir da fonte oficial.

## Usuários

| Usuário | Papel | Dor |
|---------|-------|-----|
| Usuário do mapa | Analisa o território | Não consegue localizar estabelecimentos oficiais nem inspecionar sua classificação |
| Usuário do Raio-X | Compara áreas | Vê endereços do CNEFE onde espera unidades identificadas |
| Operação de dados | Mantém o `geodata` | Não possui carga reexecutável, versão registrada ou atualização controlada do CNES |
| Pipeline de tiles | Publica visualização | Não tem uma tabela oficial do banco da qual derivar o PMTiles |

## Objetivos

| Prioridade | Objetivo |
|------------|----------|
| **MUST** | Baixar o retrato nacional mais recente do CNES diretamente de uma fonte oficial do Ministério da Saúde/DATASUS |
| **MUST** | Publicar no `geodata` uma tabela canônica com uma linha espacial por código CNES no grão escolhido |
| **MUST** | Preservar ao menos identidade, nome, situação, tipo, município, natureza jurídica, vínculo SUS e versão/competência disponível na fonte |
| **MUST** | Preservar todos os estabelecimentos do escopo mesmo quando a coordenada estiver ausente ou inválida, declarando separadamente a cobertura espacial |
| **MUST** | Usar staging, validação e troca atômica; falha não altera a tabela publicada |
| **MUST** | Registrar fonte, versão, hash, contagem, script e cobertura em `meta.fonte` |
| **MUST** | Conceder somente leitura ao `geo_reader` e criar índice espacial para as linhas georreferenciadas |
| **MUST** | Ser reexecutável e agendável mensalmente; fonte idêntica não produz nova publicação |
| **SHOULD** | Preparar um transporte atômico Mac/lab → VPS, executado separadamente da carga |
| **SHOULD** | Produzir uma consulta de comparação contra o CNEFE atual sem alterar o Raio-X |
| **COULD** | Expor uma visão enxuta pronta para o futuro pipeline PMTiles |

## Critérios de sucesso

- [ ] **100%** dos registros da fonte dentro do escopo são contabilizados como publicados,
      rejeitados com motivo ou preservados sem geometria; nenhuma linha some silenciosamente.
- [ ] **Zero** código CNES vazio e **zero** duplicidade na chave da tabela espacial servida.
- [ ] **Zero** geometria não vazia fora do SRID 4674, inválida ou fora dos limites mundiais de
      longitude/latitude.
- [ ] A soma `com_geometria + sem_geometria` fecha exatamente com o total publicado.
- [ ] A segunda execução sobre o mesmo hash deixa contagem, chaves e conteúdo idênticos.
- [ ] Uma falha forçada antes da troca mantém **100%** da versão anterior disponível.
- [ ] `geo_reader` possui `SELECT` e não possui permissão de escrita.
- [ ] `meta.fonte` registra uma única versão publicada, com hash e data/competência verificáveis.
- [ ] O modo de ensaio do transporte não toca a VPS.
- [ ] Nenhuma definição do Raio-X, catálogo web ou PMTiles existente muda nesta feature.

## Testes de aceitação

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| **AT-001** | Carga nacional válida | Artefato oficial íntegro | O job termina | A tabela publicada tem chave CNES única, linhagem e contagens fechadas |
| **AT-002** | Fonte repetida | Mesmo artefato/hash da publicação vigente | O job mensal roda novamente | Informa “sem mudança” e não troca a tabela |
| **AT-003** | Código duplicado | Duas linhas incompatíveis no grão escolhido para o mesmo CNES | A validação roda | A carga falha antes da troca e nomeia a chave |
| **AT-004** | Coordenada ausente | Estabelecimento válido sem latitude/longitude | A transformação roda | A linha permanece canônica, sem geometria, e entra na métrica de cobertura |
| **AT-005** | Coordenada inválida | Latitude/longitude fora do domínio ou não numérica | A validação roda | A geometria não é criada; o motivo é contado e declarado |
| **AT-006** | Falha no staging | Erro forçado após a importação parcial | A transação aborta | A versão publicada anterior permanece inalterada |
| **AT-007** | Permissão de leitura | Carga concluída | `geo_reader` consulta a tabela | Lê dados e não consegue inserir, alterar ou excluir |
| **AT-008** | Comparação territorial | Polígono conhecido com registros CNES e CNEFE | A consulta de diagnóstico roda | Devolve as duas contagens separadas, sem substituir nenhuma |
| **AT-009** | Ensaio de publicação | Base local válida | O transporte roda com `--ensaio` | Lista alvos e contagens sem abrir escrita remota |

## Fora de escopo

- Substituir agora o cartão de saúde do Raio-X.
- Publicar tile, camada no catálogo ou frontend.
- Remover ou alterar `h3_equipamentos` e os derivados do CNEFE.
- Publicar banco, tile, frontend ou agente em produção.
- Manter série histórica completa do CNES.
- Importar profissionais, equipes, leitos, habilitações ou demais módulos relacionais do
  CNES além do necessário para caracterizar o estabelecimento.
- Criar atualização diária.

## Restrições

| Tipo | Restrição | Impacto no desenho |
|------|-----------|--------------------|
| Fonte | A carga deve partir do Ministério da Saúde/DATASUS | `geobr`, scraping de mapa e cópias de terceiros não podem ser dependência |
| Arquitetura | Dado universal e reexecutável pertence ao `servidor-dados-gis` | Código de ingestão não entra no `geo-analytics` |
| Integridade | O código CNES deve ser preservado como identificador, sem coerção destrutiva | Tipos e normalização só são fixados após inspecionar o schema real |
| Espacial | O sistema usa EPSG:4674 | Coordenada de origem precisa ser validada e transformada explicitamente se necessário |
| Operação | Carga não autoriza produção | Transporte/publicação é comando separado e exige aceite explícito |
| Atualização | Uma execução mensal, na primeira semana | O job precisa detectar versão/hash e ser idempotente |
| Runtime | O produto não pode depender do portal oficial estar disponível | Banco e tile servem cópia local versionada |

## Contexto técnico

| Aspecto | Valor | Observações |
|---------|-------|-------------|
| **Local do código** | `../servidor-dados-gis/cargas/`, `scripts/`, `docs/` | Carga, publicação controlada e documentação da fonte |
| **Consumidores futuros** | `query/` e `pipeline/datasets.yaml` neste repositório | Fora desta feature, mas o contrato deve atendê-los |
| **KBs relevantes** | `geospatial-etl` | Inspecionar schema, preservar strings e medir linhas sem ponto |
| **Impacto de IaC** | Modificação operacional, sem recurso novo | Tornar o job agendável; mecanismo exato fica para o DESIGN |
| **Banco** | PostGIS existente, réplica de leitura na VPS | Sem banco ou serviço novo |
| **Decisão transversal** | Já prevista em `webgis/docs/HERANCA.md` | O gatilho foi atendido; registrar a aplicação, não redecidir a arquitetura |

## Premissas

| ID | Premissa | Se estiver errada | Validada? |
|----|----------|-------------------|-----------|
| **A-001** | A fonte oficial oferece código CNES, situação cadastral e atributos básicos em artefato nacional reproduzível | O contrato da tabela ou o método de extração muda | Validada: CSV nacional oficial com 36 campos e 636.342 registros em 2026-09-18 |
| **A-002** | A fonte fornece coordenadas para parte relevante dos estabelecimentos | Pode ser necessário geocodificador ou outra fonte espacial, fora desta rodada | Validada: 497.596 de 497.614 registros ativos têm coordenada numérica dentro do Brasil; os 18 restantes serão preservados sem geometria |
| **A-003** | Um retrato mensal é suficiente para o produto | Seria necessário reduzir a cadência | Validada pelo Guilherme em 2026-09-18 |
| **A-004** | O retrato nacional cabe no home lab e no Postgres existente | O job precisaria particionar por UF ou mudar o ambiente de execução | Validada: ZIP de 56,2 MB, CSV de 230,4 MB e 636.342 registros |
| **A-005** | Série histórica não é requisito inicial | Seria preciso manter partições por competência | Validada no brainstorm por YAGNI |

## Clarity Score

| Elemento | Nota | Por quê |
|----------|------|---------|
| Problema | **3** | O erro semântico do CNEFE e a ausência do CNES no banco foram medidos |
| Usuários | **3** | Mapa, Raio-X, operação e pipeline têm dores distintas |
| Objetivos | **3** | Oito MUST cobrem fonte, contrato, espacialização, integridade e cadência |
| Sucesso | **3** | Critérios fecham linhas, chaves, geometria, idempotência e atomicidade |
| Escopo | **3** | Esta rodada termina no dado persistido; UI, tile e substituição estão explicitamente fora |
| **Total** | **15/15** | Pronto para desenho técnico |

## Questões em aberto

Nenhuma decisão de produto bloqueia o DESIGN. O artefato oficial foi inspecionado; o
DESIGN deve fixar o contrato medido, a regra de ativo e a validação espacial sem descartar
os registros que não formarem ponto.

## Histórico de revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-18 | Codex | Versão inicial a partir do brainstorm aprovado |
| 1.1 | 2026-09-18 | Codex | Premissas validadas contra o CSV nacional oficial do CNES |
| 1.2 | 2026-09-18 | Cursor | Shipped and archived |

## Próximo passo

**✅ SHIPPED**
