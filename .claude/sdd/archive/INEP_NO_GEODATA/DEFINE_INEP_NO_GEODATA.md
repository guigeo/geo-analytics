# DEFINE: INEP_NO_GEODATA

> Carregar a cada nova edição o cadastro oficial de escolas da educação básica no `geodata`,
> com identidade Inep, geometria auditável e linhagem suficiente para servir futuras
> consultas e tiles sem depender do CNEFE.

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | INEP_NO_GEODATA |
| **Data** | 2026-09-18 |
| **Autor** | Codex + Guilherme Ramos |
| **Status** | ✅ Shipped |
| **Clarity Score** | 15/15 |
| **Origem** | [`BRAINSTORM_INEP_NO_GEODATA.md`](BRAINSTORM_INEP_NO_GEODATA.md) |
| **Repositório principal** | `../servidor-dados-gis` |

## Problema

O sistema não possui uma base persistida e reproduzível de escolas. O Raio-X atual conta
endereços classificados como ensino pelo CNEFE; esse universo contém ensino superior,
cursos livres, nomes genéricos e registros “vago”, portanto não equivale ao cadastro de
escolas da educação básica.

A antiga camada `escolas_inep` existiu apenas como fonte externa e tile, sem tabela canônica
no Postgres. Para que mapa e análise territorial possam compartilhar o mesmo número, o Censo
Escolar precisa primeiro entrar no `geodata` a partir da fonte oficial do Inep.

## Usuários

| Usuário | Papel | Dor |
|---------|-------|-----|
| Usuário do mapa | Analisa o território | Não consegue localizar escolas oficiais nem distinguir sua dependência administrativa |
| Usuário do Raio-X | Compara áreas | Vê endereços de ensino onde espera escolas identificadas |
| Operação de dados | Mantém o `geodata` | Não possui carga reexecutável, edição registrada ou atualização controlada do Censo Escolar |
| Pipeline de tiles | Publica visualização | Não tem uma tabela oficial do banco da qual derivar o PMTiles |

## Objetivos

| Prioridade | Objetivo |
|------------|----------|
| **MUST** | Baixar a edição nacional mais recente do Censo Escolar diretamente da fonte oficial do Inep |
| **MUST** | Baixar o GeoParquet espacial da mesma edição publicado pelo Ipea/geobr, preservando a procedência e a qualidade da coordenada linha a linha |
| **MUST** | Publicar no `geodata` uma tabela canônica com uma linha espacial por código Inep de escola em atividade da educação básica |
| **MUST** | Preservar ao menos identidade, nome, situação, dependência administrativa, categoria pública/privada, município, etapas/modalidades disponíveis e ano da edição |
| **MUST** | Preservar todas as escolas do escopo mesmo quando a coordenada estiver ausente ou inválida, declarando separadamente a cobertura espacial |
| **MUST** | Usar staging, validação e troca atômica; falha não altera a tabela publicada |
| **MUST** | Registrar fonte, edição, hash, contagem, script e cobertura em `meta.fonte` |
| **MUST** | Conceder somente leitura ao `geo_reader` e criar índice espacial para as linhas georreferenciadas |
| **MUST** | Ser reexecutável e agendável para detectar a nova edição anual; edição idêntica não produz nova publicação |
| **SHOULD** | Preparar um transporte atômico Mac/lab → VPS, executado separadamente da carga |
| **SHOULD** | Produzir uma consulta de comparação contra o CNEFE atual sem alterar o Raio-X |
| **COULD** | Expor uma visão enxuta pronta para o futuro pipeline PMTiles |

## Critérios de sucesso

- [ ] **100%** das escolas da fonte dentro do escopo são contabilizadas como publicadas,
      rejeitadas com motivo ou preservadas sem geometria; nenhuma linha some silenciosamente.
- [ ] **Zero** código Inep vazio e **zero** duplicidade na chave da tabela espacial servida.
- [ ] **Zero** escola fora da situação definida como ativa no contrato de consumo.
- [ ] **Zero** geometria não vazia fora do SRID 4674, inválida ou fora dos limites mundiais de
      longitude/latitude.
- [ ] A soma `com_geometria + sem_geometria` fecha exatamente com o total publicado.
- [ ] A segunda execução sobre a mesma edição/hash deixa contagem, chaves e conteúdo idênticos.
- [ ] Uma falha forçada antes da troca mantém **100%** da versão anterior disponível.
- [ ] `geo_reader` possui `SELECT` e não possui permissão de escrita.
- [ ] `meta.fonte` registra uma única edição publicada, com hash e ano verificáveis.
- [ ] Nenhuma definição do Raio-X, catálogo web ou PMTiles existente muda nesta feature.

## Testes de aceitação

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| **AT-001** | Carga nacional válida | Edição oficial íntegra | O job termina | A tabela publicada tem chave Inep única, linhagem e contagens fechadas |
| **AT-002** | Edição repetida | Mesmo artefato/hash da publicação vigente | O verificador anual roda novamente | Informa “sem mudança” e não troca a tabela |
| **AT-003** | Código duplicado | Duas linhas incompatíveis no grão escolhido para a mesma escola | A validação roda | A carga falha antes da troca e nomeia a chave |
| **AT-004** | Escola sem coordenada | Escola ativa e válida sem latitude/longitude | A transformação roda | A linha permanece canônica, sem geometria, e entra na métrica de cobertura |
| **AT-005** | Coordenada inválida | Latitude/longitude fora do domínio ou não numérica | A validação roda | A geometria não é criada; o motivo é contado e declarado |
| **AT-006** | Escola inativa | Registro fora da situação ativa definida pela fonte | A visão/tabela de consumo é montada | O registro não aparece no universo espacial ativo e sua exclusão é contabilizada |
| **AT-007** | Falha no staging | Erro forçado após a importação parcial | A transação aborta | A edição publicada anterior permanece inalterada |
| **AT-008** | Classificação administrativa | Amostra com federal, estadual, municipal e privada | A carga termina | As quatro categorias permanecem distinguíveis e fecham com o total da amostra |
| **AT-009** | Comparação territorial | Polígono conhecido com registros Inep e CNEFE | A consulta de diagnóstico roda | Devolve as duas contagens separadas, sem substituir nenhuma |
| **AT-010** | Ensaio de publicação | Base local válida | O transporte roda com `--ensaio` | Lista alvos e contagens sem abrir escrita remota |

## Fora de escopo

- Substituir agora o cartão de ensino do Raio-X.
- Publicar tile, camada no catálogo ou frontend.
- Remover ou alterar `h3_equipamentos` e os derivados do CNEFE.
- Publicar banco, tile, frontend ou agente em produção.
- Importar ensino superior; uma futura base e-MEC exige rodada própria.
- Manter série histórica completa do Censo Escolar.
- Importar matrículas, turmas, docentes ou alunos além do necessário para caracterizar a
  oferta da escola.

## Restrições

| Tipo | Restrição | Impacto no desenho |
|------|-----------|--------------------|
| Fonte | Cadastro e classificação devem partir do Inep; a geometria pode vir do Ipea/geobr | O microdado oficial atual não publica endereço nem coordenadas. O GeoParquet do Ipea é a distribuição espacial já usada pela camada histórica, combina coordenada do Inep com `geocodebr` e declara `coords_source` e precisão por linha. Tile nunca é fonte |
| Arquitetura | Dado universal e reexecutável pertence ao `servidor-dados-gis` | Código de ingestão não entra no `geo-analytics` |
| Integridade | O código Inep deve ser preservado como identificador | Tipos e normalização só são fixados após inspecionar a edição real |
| Escopo | Apenas escolas em atividade da educação básica | Ensino superior e cursos livres ficam fora por contrato, não por filtro textual |
| Espacial | O sistema usa EPSG:4674 | Coordenada de origem precisa ser validada e transformada explicitamente se necessário |
| Operação | Carga não autoriza produção | Transporte/publicação é comando separado e exige aceite explícito |
| Atualização | Uma carga por nova edição anual | O job precisa detectar edição/hash e ser idempotente |
| Runtime | O produto não pode depender do portal do Inep estar disponível | Banco e tile servem cópia local versionada |

## Contexto técnico

| Aspecto | Valor | Observações |
|---------|-------|-------------|
| **Local do código** | `../servidor-dados-gis/cargas/`, `scripts/`, `docs/` | Carga, publicação controlada e documentação da fonte |
| **Consumidores futuros** | `query/` e `pipeline/datasets.yaml` neste repositório | Fora desta feature, mas o contrato deve atendê-los |
| **KBs relevantes** | `geospatial-etl` | Inspecionar schema, preservar strings e medir linhas sem ponto |
| **Impacto de IaC** | Modificação operacional, sem recurso novo | Tornar a detecção de edição agendável; mecanismo exato fica para o DESIGN |
| **Banco** | PostGIS existente, réplica de leitura na VPS | Sem banco ou serviço novo |
| **Decisão transversal** | Já prevista em `webgis/docs/HERANCA.md` | O gatilho foi atendido; registrar a aplicação, não redecidir a arquitetura |

## Premissas

| ID | Premissa | Se estiver errada | Validada? |
|----|----------|-------------------|-----------|
| **A-001** | A edição oficial oferece código, situação, dependência e atributos básicos por escola | O contrato da tabela ou o método de extração muda | Validada: `Tabela_Escola_2025_V2.csv`, 290 campos e 214.192 códigos únicos |
| **A-002** | Existe fonte pública reproduzível de coordenadas para a mesma edição | Sem ela a rodada só poderia persistir cadastro não espacial | Validada no Ipea/geobr: 214.192 códigos, conjunto idêntico ao microdado oficial; 214.179 pontos válidos, sendo 180.534 das 180.540 escolas ativas |
| **A-003** | Uma carga por nova edição anual é suficiente | Seria necessário acompanhar retificações dentro do ano | Validada pelo Guilherme em 2026-09-18; hash ainda deve capturar republicações |
| **A-004** | O retrato nacional cabe no home lab e no Postgres existente | O job precisaria particionar por UF ou mudar o ambiente de execução | Validada: ZIP oficial de 537,2 MB, CSV de escolas de 141,4 MB e GeoParquet espacial de 18,6 MB |
| **A-005** | Educação básica é o universo desejado nesta rodada | Seria preciso acrescentar e-MEC e novo contrato | Validada no brainstorm |

## Clarity Score

| Elemento | Nota | Por quê |
|----------|------|---------|
| Problema | **3** | O erro semântico do CNEFE e a ausência do Inep no banco foram medidos |
| Usuários | **3** | Mapa, Raio-X, operação e pipeline têm dores distintas |
| Objetivos | **3** | Nove MUST cobrem fonte, contrato, espacialização, integridade e cadência |
| Sucesso | **3** | Critérios fecham linhas, chaves, geometria, idempotência e atomicidade |
| Escopo | **3** | Esta rodada termina no dado persistido; UI, tile e substituição estão explicitamente fora |
| **Total** | **15/15** | Pronto para desenho técnico |

## Questões em aberto

Nenhuma decisão de produto bloqueia o DESIGN. A inspeção confirmou que o microdado oficial
atual não traz endereço ou coordenadas; o desenho deve usar o Inep como autoridade cadastral
e o Ipea/geobr como complemento espacial, sem esconder a qualidade da coordenada.

## Histórico de revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-18 | Codex | Versão inicial a partir do brainstorm aprovado |
| 1.1 | 2026-09-18 | Codex | Fonte espacial corrigida após inspeção: microdado Inep + complemento Ipea/geobr com cobertura medida |
| 1.2 | 2026-09-18 | Cursor | Shipped and archived |

## Próximo passo

**✅ SHIPPED**
