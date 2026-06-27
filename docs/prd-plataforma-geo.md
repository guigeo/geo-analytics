---
titulo: "Plataforma de Visualização e Consulta Geográfica"
tipo: PRD
status: draft
versao: 0.1
fase_sdd: "brainstorm → define"
autor: guigeo
data: 2026-06-26
---

# PRD — Plataforma de Visualização e Consulta Geográfica
> *Working title — renomear conforme o repo.*

## 1. Resumo
Aplicação **web** para visualizar camadas geográficas do Brasil (município, setor censitário, bairro e outras) em mapa interativo, evoluindo em três fases: **(1)** visualização, **(2)** consulta em linguagem natural via IA sobre os dados geográficos, **(3)** expansão do acervo de dados. Princípio condutor: stack enxuta, *in-process*, sem infraestrutura pesada no início; a complexidade entra só quando o dado exige.

## 2. Problema e Objetivo
- **Problema:** a equipe de geomarketing precisa explorar visualmente recortes territoriais e, futuramente, interrogar esses dados sem escrever SQL/GIS manualmente.
- **Objetivo:** entregar primeiro um mapa funcional com camadas oficiais (IBGE); depois uma camada de IA que responda perguntas atributivas e espaciais; por fim escalar para novos datasets sem retrabalho de arquitetura.
- **Sucesso (visão):** o usuário abre o mapa, escolhe um recorte, clica e vê atributos. Na fase 2, pergunta em português e recebe resposta + destaque no mapa.

> `[a confirmar]` o problema de negócio específico além de "explorar territórios" — preencher no brainstorm.

## 3. Usuários
- **Primário:** analistas/equipe de geomarketing (e o próprio autor).
- `[a confirmar]` existe usuário externo / cliente final? Define necessidade futura de auth (hoje fora de escopo).

## 4. Escopo por Fase

### Fase 1 — Visualização de camadas (MVP)
Mapa web exibindo camadas territoriais, com interação básica (pan, zoom, clique → atributos).

### Fase 2 — Consulta por IA
Chat que aceita perguntas em linguagem natural (atributivas **e** espaciais), responde consultando os dados e reflete o resultado no mapa.

### Fase 3 — Expansão de dados
Adição **incremental** de novos datasets geográficos sem mudança estrutural.

## 5. Requisitos Funcionais

**Fase 1**
- `RF-1.1` Exibir mapa interativo (pan/zoom).
- `RF-1.2` Renderizar a camada de municípios do Brasil.
- `RF-1.3` Clique em feição exibe atributos (nome, código IBGE, UF).
- `RF-1.4` Suportar múltiplas camadas alternáveis (toggle on/off): município, setor censitário, etc.
- `RF-1.5` Performance aceitável em camada pesada (setor censitário) via *vector tiles*.

**Fase 2**
- `RF-2.1` Campo de chat para perguntas em português.
- `RF-2.2` Responder perguntas atributivas/estatísticas (contagem, filtro por atributo).
- `RF-2.3` Responder perguntas espaciais (proximidade, contém, interseção).
- `RF-2.4` Destacar no mapa a(s) feição(ões) retornada(s).
- `RF-2.5` Conversão pergunta→consulta via **tool-calling** (funções parametrizadas), **não** SQL livre.

**Fase 3**
- `RF-3.1` Ingerir novo dataset = nova tabela de consulta + nova camada + nova tool, **sem refactor**.
- `RF-3.2` Pipeline única: fonte → (formato de exibição + formato de consulta).

## 6. Requisitos Não-Funcionais
- `RNF-1` Rodar em dev local no **Mac M4 16GB** sem servidor de banco dedicado.
- `RNF-2` Custo de IA baixo no início (modelo classe Flash); escalar só se a qualidade exigir.
- `RNF-3` Sem autenticação / multiusuário concorrente no MVP.
- `RNF-4` Dados oficiais e reprodutíveis (IBGE), com processamento versionável.

## 7. Restrições e Decisões Técnicas *(já definidas — input para a fase de design)*
Decisões resultantes de análise prévia. O **design** detalha o "como" (schema, assinaturas de tools, deploy); **não** re-decide o "quê".

- **Formato canônico:** **GeoParquet**. Shapefile é convertido **uma vez**; nunca lido cru em runtime.
- **Frontend de mapa:** **MapLibre GL JS**.
- **Camadas pesadas:** *vector tiles* via **PMTiles** (geradas com `tippecanoe`), servidas como arquivo estático. **Não** aplicar a camadas leves (município) — GeoJSON direto basta.
- **Engine de consulta (Fase 2):** **DuckDB + extensão spatial** (*in-process*). PostGIS fica fora de escopo até haver escrita concorrente / produção com tráfego real.
- **IA:** padrão **tool-calling** sobre funções espaciais parametrizadas; *text-to-SQL* só como fallback. Modelo inicial classe Flash; provider `[a confirmar]`.
- **Processamento:** Python via `uv`, GeoPandas para o ETL inicial.
- **Não-objetivo de infra:** **Databricks não é backend do chat** (latência/custo de warehouse inadequados para app interativo). Pode entrar como camada *batch* upstream apenas se o volume justificar, no futuro.

## 8. Fontes de Dados
- **Município:** IBGE, Malha Municipal Digital (versão mais recente). Colunas-chave: `CD_MUN`, `NM_MUN`, `SIGLA_UF`. ~5.570 feições (cabe em memória).
- **Setor censitário:** IBGE, Malha de Setores Censitários 2022 (preliminar). ~450k feições — **exige tiles**. Vinculado a município/distrito/subdistrito/bairro.
- **UF:** UF dos brasil.
- **Bairro:**Bairros do brasil
- **Antenas telefonia:**Base de antenas de telefonia
- **Os arquivos estao:**em /Users/gui_ramos/Projetos/geo-analytics/data

## 9. Questões em Aberto / Riscos
- `Q1` Provider de LLM (Gemini Flash vs. alternativa) e teto de custo.
- `Q2` Alvo de deploy (estático + backend? onde?). `[a confirmar]`
- `Q3` Uso interno ou com cliente externo? Define auth futura.
- `Q4` Volume real esperado de datasets na Fase 3.

## 10. Marcos / Critérios de Aceite
- `M1` **(Fase 1 mínima):** pipeline shapefile → GeoParquet/GeoJSON → mapa; com as 5 fontes renderiza e é clicável. **✅ =** abrir no browser, clicar, ver atributos.
- `M2` Setor censitário renderiza com performance via PMTiles.
- `M3` **(Fase 2):** GeoParquet no DuckDB spatial; primeira tool respondendo **1** pergunta atributiva e **1** espacial, com destaque no mapa.
- `M4` **(Fase 3):** adicionar **1** dataset novo seguindo o pipeline, sem refactor.

## 11. Fora de Escopo (MVP)
- PostGIS / banco gerenciado.
- Autenticação e multiusuário concorrente.
- Databricks como backend de *serving*.
- Camada de bairro nacional (até resolver `Q1`).
- App mobile nativo.
