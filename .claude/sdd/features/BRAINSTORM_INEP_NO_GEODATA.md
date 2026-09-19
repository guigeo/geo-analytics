# BRAINSTORM: INEP_NO_GEODATA

> Rodada independente para tornar o cadastro de escolas da educação básica dado persistido,
> espacial e consumível pelo mapa e pelo Raio-X.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | INEP_NO_GEODATA |
| **Date** | 2026-09-18 |
| **Author** | Codex + Guilherme Ramos |
| **Status** | Ready for Define |

## Initial Idea

**Raw Input:** Criar um job próprio para escolas que busque o Censo Escolar do Inep na fonte
oficial, grave o dado espacializado no Postgres e permita derivar dali tanto o tile do mapa
quanto a contagem territorial do Raio-X.

**Context Gathered:**

- O Raio-X atual conta endereços de espécie ensino do CNEFE, não escolas identificadas.
- A auditoria local encontrou 17.337 registros, incluindo ensino superior, cursos livres,
  nomes genéricos e registros “vago”; há 70 possíveis repetições exatas.
- A antiga camada `escolas_inep` tinha 217.625 pontos e quatro atributos no tile, mas vinha
  do `geobr`; saiu do pipeline, do catálogo e do host de tiles em 2026-08-20.
- Não há tabela ou coluna do Inep no `geodata` local. A definição antiga continua
  recuperável no histórico do Git.
- O `webgis/docs/HERANCA.md` já fixou o gatilho para o retorno: necessidade de contar escolas
  por território. Esse gatilho agora existe.

**Technical Context Observed:**

| Aspect | Observation | Implication |
|--------|-------------|-------------|
| Data owner | `servidor-dados-gis` | A carga reexecutável e a tabela canônica nascem lá |
| Consumers | `geo-analytics` | Query/Raio-X lê Postgres; pipeline gera PMTiles do mesmo dado |
| Decision owner | `webgis` | Registrar que o gatilho previsto foi atendido; não redesenhar a arquitetura |
| KB domains | `geospatial-etl` | Inspecionar schema real, preservar o código Inep e medir cobertura espacial |
| Infrastructure | PostGIS local + réplica de leitura na VPS | Publicação atômica e controlada, sem deploy automático |

## Discovery Questions & Answers

| # | Question | Answer | Impact |
|---|----------|--------|--------|
| 1 | O número desejado é endereço de ensino ou escola cadastrada? | Escola do Inep | O código Inep passa a ser a identidade da unidade |
| 2 | O dado deve existir só como tile? | Não; deve persistir no Postgres | Tile vira derivado, nunca fonte analítica |
| 3 | Qual consumidor precisa do dado? | Mapa e cruzamento territorial/Raio-X | A mesma tabela atende visualização e consulta |
| 4 | Qual cadência faz sentido? | Anual, a cada novo Censo Escolar | Evita reprocessamento sem publicação nova |
| 5 | A mudança já substitui o CNEFE? | Não | O bloco atual fica intacto até comparação e aceite visual |
| 6 | A publicação acompanha automaticamente o job? | Não | Carga/validação e publicação continuam separadas |

## Sample Data Inventory

| Type | Location | Count | Notes |
|------|----------|-------|-------|
| Contrato histórico | Git `3ed9bd3:pipeline/datasets.yaml` | 1 camada | Nome, dependência, município e UF; faltava identidade no tile |
| Referência de remoção | Git `ad17f67` e `3625b21` | 2 commits | Documenta procedência antiga e tamanho |
| Dado atual comparável | `indicadores.cnefe_equipamento` | 17.337 ensino | Serve só para comparação, não como fonte do Inep |
| Fonte primária | Microdados do Censo Escolar/Inep | A inspecionar | Schema, situação e cobertura das coordenadas serão medidos antes do DESIGN |

## Approaches Explored

### Approach A: Censo Escolar oficial no Postgres, consumidores derivados — recomendada

Carga reexecutável da fonte oficial para uma tabela canônica no `geodata`, com código Inep,
ano, situação, dependência administrativa, etapas e geometria. O Raio-X consulta a tabela;
o pipeline gera PMTiles dela.

**Pros:** uma fonte de verdade, contagem por escola, classificação pública/privada, linhagem
e coerência entre mapa e relatório.

**Cons:** exige validar o schema anual e declarar separadamente linhas sem coordenada.

### Approach B: Restaurar somente o tile histórico

Recuperar a definição antiga e publicar novamente um PMTiles.

**Pros:** visualização rápida.

**Cons:** não atende consultas, revive a dependência `geobr` e volta a deixar o tile como
única cópia operacional.

### Approach C: Manter o ensino do CNEFE

Continuar contando endereços classificados como ensino.

**Pros:** nenhuma carga nova.

**Cons:** mistura categorias e não identifica escola, situação nem dependência.

## Selected Approach

| Attribute | Value |
|-----------|-------|
| **Chosen** | Approach A |
| **User Confirmation** | 2026-09-18 |
| **Reasoning** | O Postgres deve guardar o dado persistido; mapa e Raio-X devem derivar da mesma base oficial |

## Key Decisions Made

| # | Decision | Rationale | Alternative Rejected |
|---|----------|-----------|----------------------|
| 1 | Um registro canônico por código Inep | Escola precisa de identidade oficial | Deduplicação por nome/endereço |
| 2 | Fonte oficial do Censo Escolar | O dono do dado deve ser a procedência | `geobr` como intermediário |
| 3 | Escopo inicial é educação básica | É o universo definido pelo Censo Escolar | Misturar ensino superior |
| 4 | Postgres é fonte de verdade | Tile não responde análise territorial | Tile-only |
| 5 | Carga anual com detecção de versão/hash | A publicação é anual | Agendamento frequente |
| 6 | CNEFE não é removido nesta rodada inicial | Comparação e aceite vêm antes da troca | Substituição imediata |

## Features Removed (YAGNI)

| Feature Suggested | Reason Removed | Can Add Later? |
|-------------------|----------------|----------------|
| Ensino superior/e-MEC | Outra fonte e outro contrato | Sim, em rodada própria |
| Histórico temporal completo das escolas | O primeiro consumidor precisa do retrato atual | Sim |
| Publicação automática de banco/tile/app | Produção exige aceite explícito | Não nesta fase |
| Redesenho do cartão do Raio-X | Primeiro provar o contrato do dado | Sim |
| Unificar Inep e CNES num único job | Fontes, cadências e contratos são diferentes | Não |

## Incremental Validations

| Section | Presented | User Feedback | Adjusted? |
|---------|-----------|---------------|-----------|
| Postgres como fonte, tile como derivado | ✅ | Confirmado | Não |
| Jobs separados por fonte | ✅ | Confirmado | Sim, duas rodadas SDD |
| Cadência | ✅ | Inep anual | Não |
| Substituição do dado atual | ✅ | Ir com calma; não substituir ainda | Sim |

## Suggested Requirements for /define

### Problem Statement (Draft)

O produto não possui uma base oficial e persistida de escolas; o CNEFE atual conta
endereços classificados como ensino e mistura universos diferentes.

### Target Users (Draft)

| User | Pain Point |
|------|------------|
| Usuário do mapa | Não consegue localizar e inspecionar escolas oficiais |
| Usuário do Raio-X | Recebe endereços de ensino como se fossem escolas |
| Operação de dados | Não tem carga reproduzível nem ano registrado do Censo Escolar |

### Success Criteria (Draft)

- [ ] Carga reexecutável a partir da fonte oficial, sem etapa manual de QGIS.
- [ ] Uma linha canônica por código Inep para cada escola em atividade da educação básica.
- [ ] Dependência administrativa, etapas, município e ano da fonte preservados.
- [ ] Coordenadas válidas em SRID 4674; ausências e descartes medidos, nunca silenciosos.
- [ ] Tabela com índice espacial, leitura por `geo_reader` e linhagem em `meta.fonte`.
- [ ] Mesma versão alimenta consulta territorial e futuro PMTiles.
- [ ] Segunda execução da mesma edição não altera o dado publicado.
- [ ] Nenhuma publicação em produção ou substituição do CNEFE nesta fase.

### Constraints Identified

- Preservar o código Inep sem coerção numérica e inspecionar o schema da edição real.
- Usar staging, validação e troca atômica.
- O job prepara e valida; publicação na VPS continua explícita.
- A tabela servida não pode depender do portal do Inep estar disponível em runtime.

### Out of Scope (Confirmed)

- Ensino superior.
- Alterar agora o cartão de ensino do Raio-X.
- Publicar a nova camada ou remover `h3_equipamentos`.
- Criar série histórica ou painel operacional do Censo Escolar.

## Session Summary

| Metric | Value |
|--------|-------|
| Questions Answered | 6 |
| Approaches Explored | 3 |
| Features Removed | 5 |
| Validations Completed | 4 |

## Next Step

**Ready for:** `/define .claude/sdd/features/BRAINSTORM_INEP_NO_GEODATA.md`
