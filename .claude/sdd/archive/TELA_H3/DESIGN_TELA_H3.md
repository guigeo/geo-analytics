# DESIGN: TELA_H3

> Desenho técnico da primeira camada H3 medida: apartamentos por célula r9.

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | TELA_H3 |
| **Data** | 2026-09-07 |
| **Autor** | Codex |
| **DEFINE** | `DEFINE_TELA_H3.md` |
| **Status** | Pronto para build |

## Arquitetura

```text
 indicadores.censo_h3_r9_celula ─┐
 indicadores.cnefe_h3_r9         ├─► pipeline: índice H3 → polígono → GeoParquet → PMTiles
                                 │                                      │
                                 │                                      ▼
                                 │                         host de tiles compartilhado
                                 │                                      │
                                 ▼                                      ▼
                       query.h3_no_ponto                    MapLibre: interpolate + legenda
                                 │                                      │
                                 └──────── agente ───────────────────────┘
                                      destaque por H3_R9
```

## Componentes

| Componente | Papel | Tecnologia |
|------------|-------|------------|
| Exportador H3 | Junta as tabelas longas e materializa a borda pura no GeoParquet | Python, psycopg, h3, GeoPandas |
| Registry | Declara o dataset e os atributos do PMTiles | YAML + Pydantic |
| Pintura numérica | Traduz domínio/cores em `interpolate` | TypeScript + MapLibre |
| Legenda | Mostra gradiente e limites da camada ligada | React |
| Consulta H3 | Calcula índice do ponto e lê a célula | Python + h3 + PostGIS |
| Publicadores | Levam tabelas derivadas e tile ao ambiente de produção | Bash + COPY streaming + scripts existentes |

## Decisões

### 1. A camada é uma escala sequencial fixa de apartamentos

**Escolha:** `DOM_APARTAMENTO` entra como campo de pintura; `DOM_CASA`, total e as seis
contagens de qualidade entram como atributos. O mapa não guarda estado de variável.

**Razão:** a tela inaugural prova a capacidade geral sem antecipar um seletor. Contagem
em células de área constante é comparável e uma escala sequencial preserva magnitude.

**Rejeitadas:** predominância binária, que perde magnitude; seletor de 17 variáveis,
que abre escopo e interação ainda sem uso validado.

### 2. A borda nasce no pipeline e nunca no banco

**Escolha:** um novo tipo de fonte `h3_geodata` lê linhas pelo DSN, faz a união das
68.448 células do Censo com seis células CNEFE de borda, calcula
`h3.cell_to_boundary(h3_r9)` e escreve um GeoParquet de 68.454 feições.

**Razão:** a borda é função pura do índice e a tabela publicada deliberadamente só guarda
o centro. O pipeline é a fronteira de cache derivado para tile; 68 mil linhas são pequenas
e não justificam extensão PostgreSQL nem cache de geometria.

**Rejeitadas:** `h3-pg`, que muda a imagem do banco; persistir polígonos em
`indicadores`, que viola a regra 6; omitir células sem CNEFE, que cria buracos silenciosos;
omitir as seis células CNEFE de borda, que perde 18 endereços medidos.

### 3. O domínio da cor é declarativo e medido

**Escolha:** `pinturaPorNumero` contém `campo`, `minimo`, `maximo`, `corInicial`,
`corFinal` e `rotulo`. A medição local deu 0 / p95 216 / p99 820 / máximo 5.524;
o primeiro domínio é 0–820 e os 1% acima dele saturam na cor final.

**Razão:** o MapLibre precisa de extremos explícitos e configuração não pode esconder uma
regra cartográfica em JSX. A cor acima do teto satura, não enrola nem descarta a célula.

### 4. A tool usa o mesmo índice que o tile

**Escolha:** `GeoQuery.h3_no_ponto(lon, lat)` calcula o H3 r9 pelo ponto, confirma que
existe na malha carregada e retorna as contagens. `ToolResult` devolve `h3_domicilios` e
o `H3_R9`; o destaque passa a ler o campo declarado pela camada.

**Razão:** não há polígono no banco para `ST_Contains`, e derivar o mesmo índice evita
uma segunda geometria e garante que agente e tile apontem à mesma célula.

## Manifesto de arquivos

| # | Arquivo | Ação | Papel |
|---|---------|------|-------|
| 1 | `pipeline/pyproject.toml`, `pipeline/uv.lock` | Modificar | Dependência `h3`. |
| 2 | `pipeline/src/geo_pipeline/config.py` | Modificar | Tipo `h3_geodata` no registry. |
| 3 | `pipeline/src/geo_pipeline/h3.py` | Criar | Exportador streaming/limitado da malha e atributos. |
| 4 | `pipeline/src/geo_pipeline/convert.py` | Modificar | Despacha fonte H3. |
| 5 | `pipeline/datasets.yaml`, testes do pipeline | Modificar | Dataset `h3_domicilios` e contrato do tile. |
| 6 | `web/src/configuracao/esquema.ts` | Modificar | Contrato de pintura numérica e campo de destaque. |
| 7 | `web/src/configuracao/catalogo.ts`, clientes e testes | Modificar | Camada, cobertura e domínio medido. |
| 8 | `web/src/map/layers.ts`, testes/snapshot | Modificar | Expressão `interpolate`. |
| 9 | `web/src/map/highlight.ts`, testes | Modificar | Destaque declarativo por `H3_R9`. |
| 10 | `web/src/panels/LayerPanel.tsx`, testes | Modificar | Legenda contínua compacta. |
| 11 | `query/pyproject.toml`, `query/src/geo_query/queries.py`, testes | Modificar | Consulta de célula pelo ponto. |
| 12 | `agent/src/geo_agent/{schemas.py,tools.py,prompts.py}`, testes e benchmark | Modificar | Tool, grounding e destaque H3. |
| 13 | `../servidor-dados-gis/scripts/vps-publicar-h3.sh` | Criar | Replica as tabelas H3 para a VPS com validação. |
| 14 | `../webgis/scripts/verificar-tiles.sh` | Modificar | Saúde do novo tile no host compartilhado. |
| 15 | `.claude/sdd/reports/BUILD_REPORT_TELA_H3.md` | Criar | Evidência de build e validações. |

## Contratos de dado

O dataset `h3_domicilios` publica exatamente:

```text
H3_R9, DOM_APARTAMENTO, DOM_CASA, DOMICILIOS_PARTICULARES,
COORD_ORIGINAL, COORD_MODIFICADA, COORD_ESTIMADA, COORD_FACE_QUADRA,
COORD_LOCALIDADE, COORD_SETOR, geom
```

Ele parte de `censo_h3_r9_celula` e faz `LEFT JOIN` ao agregado CNEFE. Os valores nulos
das contagens viram `0`; `H3_R9` vem sempre da malha completa. O pipeline valida índice
único, contagem de células e soma dos dois campos inaugurais contra as tabelas de origem.

## Estratégia de teste

| Tipo | Escopo |
|------|--------|
| Unitário pipeline | Borda de índice conhecido, SQL, atributo zero e registry. |
| Integração pipeline | Exportação contra geodata local, 68.448 índices e somas. |
| Frontend | Zod, expressão `interpolate`, highlight por campo, legenda e ambos os clientes. |
| Query/agente | Ponto dentro/fora, payload honesto, literal de destaque e prompt. |
| Operacional | `verificar-tiles`, Range, CORS, preview dos dois clientes e health dos agentes. |

## Ordem de build

1. Medir a distribuição local e fixar o domínio da escala no documento/configuração.
2. Implementar e testar exportador H3 e dataset; gerar tile local.
3. Implementar capacidade de pintura, legenda, catálogo, clique e destaque.
4. Implementar query/tool/prompt e seus testes offline.
5. Criar publicador da VPS e atualizar verificador compartilhado.
6. Rodar portões; só então fazer a publicação manual na ordem dado → tile → app → agente.

## Erros e segurança

| Falha | Comportamento |
|-------|---------------|
| Tabela H3 não existe | Pipeline falha antes de criar ou sobrescrever tile. |
| Índice inválido ou duplicado | Exportador aborta; não publica GeoParquet parcial. |
| Ponto fora do recorte | Tool diz que não há H3 carregado e não destaca. |
| Tile ausente na VPS | `build_app` e `verificar-tiles.sh` recusam publicação. |
| Agente indisponível | Mapa e tile continuam estáticos; chat/dependências da sessão degradam. |

## Próximo passo

**Pronto para:** build, começando pela medição local e pelo exportador H3.
