# BRAINSTORM: CNES_NO_GEODATA

> Rodada independente para tornar o CNES dado persistido, espacial e consumível pelo mapa e pelo Raio-X.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | CNES_NO_GEODATA |
| **Date** | 2026-09-18 |
| **Author** | Codex + Guilherme Ramos |
| **Status** | ✅ Shipped |

## Initial Idea

**Raw Input:** Criar um job próprio para saúde que busque o CNES na fonte oficial, grave o
dado espacializado no Postgres e permita derivar dali tanto o tile do mapa quanto a contagem
territorial do Raio-X.

**Context Gathered:**

- O Raio-X atual conta endereços de espécie saúde do CNEFE, não unidades de saúde.
- A auditoria local encontrou 18.365 registros, com consultórios privados, concentração em
  edifícios e possíveis repetições; a consulta espacial não multiplica linhas.
- A antiga camada `saude_cnes` tinha 615.376 pontos e cinco atributos no tile, mas vinha do
  `geobr`; saiu do pipeline, do catálogo e do host de tiles em 2026-08-20.
- Não há tabela ou coluna de CNES no `geodata` local. A definição antiga continua recuperável
  no histórico do Git.
- O `webgis/docs/HERANCA.md` já fixou o gatilho para o retorno: necessidade de contar
  estabelecimentos por território. Esse gatilho agora existe.

**Technical Context Observed:**

| Aspect | Observation | Implication |
|--------|-------------|-------------|
| Data owner | `servidor-dados-gis` | A carga reexecutável e a tabela canônica nascem lá |
| Consumers | `geo-analytics` | Query/Raio-X lê Postgres; pipeline gera PMTiles do mesmo dado |
| Decision owner | `webgis` | Registrar que o gatilho previsto foi atendido; não redesenhar a arquitetura |
| KB domains | `geospatial-etl` | Inspecionar schema real, preservar códigos como texto e medir coordenadas descartadas |
| Infrastructure | PostGIS local + réplica de leitura na VPS | Publicação atômica e controlada, sem deploy automático |

## Discovery Questions & Answers

| # | Question | Answer | Impact |
|---|----------|--------|--------|
| 1 | O número desejado é endereço do CNEFE ou estabelecimento cadastrado? | Estabelecimento do CNES | O código CNES passa a ser a identidade da unidade |
| 2 | O dado deve existir só como tile? | Não; deve persistir no Postgres | Tile vira derivado, nunca fonte analítica |
| 3 | Qual consumidor precisa do dado? | Mapa e cruzamento territorial/Raio-X | A mesma tabela atende visualização e consulta |
| 4 | Qual cadência faz sentido? | Mensal, na primeira semana | Evita carga diária sem valor de produto |
| 5 | A mudança já substitui o CNEFE? | Não | O bloco atual fica intacto até comparação e aceite visual |
| 6 | A publicação acompanha automaticamente o job? | Não | Carga/validação e publicação continuam separadas |

## Sample Data Inventory

| Type | Location | Count | Notes |
|------|----------|-------|-------|
| Contrato histórico | Git `3ed9bd3:pipeline/datasets.yaml` | 1 camada | `co_cnes`, nome, tipo, município e UF |
| Referência de remoção | Git `ad17f67` e `3625b21` | 2 commits | Documenta procedência antiga e tamanho |
| Dado atual comparável | `indicadores.cnefe_equipamento` | 18.365 saúde | Serve só para comparação, não como fonte do CNES |
| Fonte primária | Portal de Dados Abertos do SUS | A inspecionar | Schema e qualidade serão medidos antes do DESIGN |

## Approaches Explored

### Approach A: CNES oficial no Postgres, consumidores derivados — recomendada

Carga reexecutável da fonte oficial para uma tabela canônica no `geodata`, com identidade
CNES, versão/competência, atributos de classificação e geometria. O Raio-X consulta a tabela;
o pipeline gera PMTiles dela.

**Pros:** uma fonte de verdade, contagem por unidade, linhagem, atualização controlada e
coerência entre mapa e relatório.

**Cons:** atravessa três repositórios e exige validar schema, situação cadastral e cobertura
das coordenadas.

### Approach B: Restaurar somente o tile histórico

Recuperar a definição antiga e publicar novamente um PMTiles.

**Pros:** visualização rápida.

**Cons:** não atende consultas, revive a dependência `geobr` e volta a deixar o tile como
única cópia operacional.

### Approach C: Manter a saúde do CNEFE

Continuar contando endereços classificados como saúde.

**Pros:** nenhuma carga nova.

**Cons:** responde outra pergunta e não identifica unidades.

## Selected Approach

| Attribute | Value |
|-----------|-------|
| **Chosen** | Approach A |
| **User Confirmation** | 2026-09-18 |
| **Reasoning** | O Postgres deve guardar o dado persistido; mapa e Raio-X devem derivar da mesma base oficial |

## Key Decisions Made

| # | Decision | Rationale | Alternative Rejected |
|---|----------|-----------|----------------------|
| 1 | Um registro canônico por código CNES | Unidade precisa de identidade oficial | Deduplicação por nome/endereço |
| 2 | Fonte oficial do DATASUS | O dono do dado deve ser a procedência | `geobr` como intermediário |
| 3 | Postgres é fonte de verdade | Tile não responde análise territorial | Tile-only |
| 4 | Carga mensal com detecção de versão/hash | Mudança lenta; execução diária só cria ruído | Carga diária |
| 5 | Publicação continua manual/controlada | Carga bem-sucedida não autoriza produção | Deploy automático |
| 6 | CNEFE não é removido nesta rodada inicial | Comparação e aceite vêm antes da troca | Substituição imediata |

## Features Removed (YAGNI)

| Feature Suggested | Reason Removed | Can Add Later? |
|-------------------|----------------|----------------|
| Histórico temporal completo do CNES | O primeiro consumidor precisa do retrato atual | Sim |
| Atualização diária | Não muda a decisão territorial na mesma velocidade | Sim |
| Publicação automática de banco/tile/app | Produção exige aceite explícito | Não nesta fase |
| Redesenho do cartão do Raio-X | Primeiro provar o contrato do dado | Sim |
| Unificar CNES e Inep num único job | Fontes, cadências e contratos são diferentes | Não |

## Incremental Validations

| Section | Presented | User Feedback | Adjusted? |
|---------|-----------|---------------|-----------|
| Postgres como fonte, tile como derivado | ✅ | Confirmado | Não |
| Jobs separados por fonte | ✅ | Confirmado | Sim, duas rodadas SDD |
| Cadência | ✅ | CNES mensal | Não |
| Substituição do dado atual | ✅ | Ir com calma; não substituir ainda | Sim |

## Suggested Requirements for /define

### Problem Statement (Draft)

O produto não possui uma base oficial e persistida de estabelecimentos de saúde; o CNEFE
atual conta endereços e não unidades identificáveis.

### Target Users (Draft)

| User | Pain Point |
|------|------------|
| Usuário do mapa | Não consegue localizar e inspecionar unidades oficiais |
| Usuário do Raio-X | Recebe endereços de saúde como se fossem unidades |
| Operação de dados | Não tem carga reproduzível nem versão registrada do CNES |

### Success Criteria (Draft)

- [ ] Carga reexecutável a partir da fonte oficial, sem etapa manual de QGIS.
- [ ] Uma linha canônica por código CNES, com situação, tipo, vínculo SUS, município e versão.
- [ ] Coordenadas válidas em SRID 4674; ausências e descartes medidos, nunca silenciosos.
- [ ] Tabela com índice espacial, leitura por `geo_reader` e linhagem em `meta.fonte`.
- [ ] Mesma versão alimenta consulta territorial e futuro PMTiles.
- [ ] Segunda execução sem mudança da fonte não altera o dado publicado.
- [ ] Nenhuma publicação em produção ou substituição do CNEFE nesta fase.

### Constraints Identified

- Preservar códigos com zeros à esquerda e inspecionar o schema real antes de fixar colunas.
- Usar staging, validação e troca atômica.
- O job prepara e valida; publicação na VPS continua explícita.
- A tabela servida não pode depender do host da fonte estar disponível em runtime.

### Out of Scope (Confirmed)

- Alterar agora o cartão de saúde do Raio-X.
- Publicar a nova camada ou remover `h3_equipamentos`.
- Criar série histórica ou painel operacional do CNES.

## Session Summary

| Metric | Value |
|--------|-------|
| Questions Answered | 6 |
| Approaches Explored | 3 |
| Features Removed | 5 |
| Validations Completed | 4 |

## Next Step

**✅ SHIPPED** — ver [SHIPPED_2026-09-18.md](SHIPPED_2026-09-18.md)
