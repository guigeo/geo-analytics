# DESIGN: INEP_NO_GEODATA

> Job anual que combina o cadastro oficial do Censo Escolar com o complemento espacial
> público do Ipea/geobr e persiste escolas com qualidade espacial explícita no `geodata`,
> sem alterar Raio-X, tile ou frontend.

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | INEP_NO_GEODATA |
| **Data** | 2026-09-18 |
| **Autor** | Codex + Guilherme Ramos |
| **DEFINE** | [`DEFINE_INEP_NO_GEODATA.md`](DEFINE_INEP_NO_GEODATA.md) |
| **Status** | ✅ Shipped |
| **Repositório de implementação** | `../servidor-dados-gis` |
| **Produção** | Proibida nesta rodada; o build termina validado localmente |

## Evidência usada no desenho

### Cadastro oficial

| Item | Medição em 2026-09-18 |
|------|-----------------------|
| URL 2025 | `https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_2025_.zip` |
| ZIP | 537.217.189 bytes; SHA-256 `ad2c389160be5cf6b8e32257677e9b5657f01d10a342355ad9757bfecd2fc90a` |
| Arquivo | `Tabela_Escola_2025_V2.csv`, 141.425.160 bytes, 290 colunas, `;`, Windows-1252/Latin-1 |
| Grão | 214.192 linhas e 214.192 códigos Inep únicos |
| Situação | 180.540 ativas; 29.780 paralisadas; 3.872 extintas no ano |
| Limitação | O CSV público atual não contém endereço, latitude nem longitude, embora o dicionário ainda descreva esses campos como não publicados |

### Complemento espacial

| Item | Medição em 2026-09-18 |
|------|-----------------------|
| Distribuidor | Ipea/geobr v2.0.0 |
| URL | `https://github.com/ipea/geobr_prep_data/releases/download/v2.0.0/schools_2025.parquet` |
| Arquivo | 18.648.631 bytes; SHA-256 `a93955761e95071a5e83f50e3edeec69c644470927dbedaac86f224eb5de85dc` |
| Grão | 214.192 códigos únicos; conjunto de chaves idêntico ao CSV oficial |
| Coordenada escolhida | 145.095 `inep`; 69.097 `geocodebr` |
| Geometria | 214.179 pontos válidos e 13 vazios; entre ativas, 180.534 pontos e 6 vazios |
| Qualidade ativa antes do município | 134.978 pontos Inep + 31.607 geocodificados com desvio ≤ 800 m; 13.949 geocodificados acima de 800 m ficam fora da view analisável |

O Catálogo de Escolas do Inep declara permitir exportação, mas o link oficial do painel
retorna 404 e o acesso público ao Oracle BI está revogado. O GeoParquet do Ipea é a origem
dos pontos usados pela camada histórica e registra, por escola, `coords_source`, precisão e
desvio do geocódigo. O tile não será usado como fonte.

## Arquitetura

```text
  INEP — microdados 2025                     IPEA/geobr — schools_2025.parquet
  cadastro/classificação oficial             endereço + pontos + qualidade
             │                                             │
             │ ZIP + SHA-256                              │ Parquet + SHA-256
             ▼                                             ▼
 metodologia/inep/preparar_escolas.py          ogr2ogr → staging.escola_geo_raw
             │
             ▼
 staging.escola_inep_raw
   código, situação, dependência e ofertas
             │                                             │
             └────────────── JOIN por código Inep ─────────┘
                                   │
                                   │ valida chave, edição, ponto e município
                                   ▼
                         TEMP escola_nova
                                   │
                                   │ uma transação: validar → truncar → inserir
                                   ▼
                         infraestrutura.escola
                           ├─ infraestrutura.escola_ativa
                           ├─ infraestrutura.escola_analisavel
                           └─ infraestrutura.escola_cobertura_municipio
                                   │
                                   ├─ geo_reader (SELECT)
                                   ├─ futuro query/Raio-X
                                   ├─ futuro pipeline PMTiles
                                   └─ scripts/vps-publicar-escolas.sh (separado)
```

## Componentes

| Componente | Papel | Tecnologia |
|------------|-------|------------|
| `metodologia/inep/preparar_escolas.py` | Lê o CSV grande em streaming, valida cabeçalho e emite apenas o contrato cadastral | Python 3.12 stdlib, PEP 723, `uv run --script` |
| `cargas/inep_escolas.sh` | Descobre edição comum, baixa, calcula hashes, carrega staging, cruza, valida e troca | Bash + `curl` + GDAL + PostGIS |
| `infraestrutura.escola` | Cadastro integral da edição corrente | PostgreSQL/PostGIS |
| Views de consumo/qualidade | Ativas, analisáveis e cobertura municipal | SQL |
| `scripts/vps-publicar-escolas.sh` | Transporte atômico, nunca chamado pela carga | Bash + `COPY` streaming + SSH |
| `scripts/verificar.sh` | Guarda global de schema, linhagem, permissão e geometria | Bash + SQL |
| `docs/escolas-inep.md` | Linhagem dupla, códigos, oferta e limites espaciais | Markdown |

## Decisões

### 1. A fonte é dupla porque nenhuma fonte pública atual resolve sozinha

**Escolha:** o Inep é autoridade para existência, situação, dependência e oferta. O
Ipea/geobr fornece somente endereço, coordenadas e métricas da coordenada para a mesma
edição. O join é pelo código Inep de oito dígitos.

**Motivo:** o microdado oficial 2025 não publica os campos espaciais; o painel oficial que
os expunha está indisponível. O geobr é público, reproduzível, mantido pelo Ipea e é
precisamente a fonte que gerou os pontos históricos do projeto.

**Consequência:** `meta.fonte.versao` registra os dois hashes e a release geobr. A camada
não será apresentada como “coordenada integralmente publicada pelo Inep”.

### 2. O job só publica uma edição comum às duas fontes

**Escolha:** descobrir o maior `schools_YYYY.parquet` na release configurada do geobr e
procurar o ZIP oficial do mesmo ano, testando as duas formas conhecidas de URL (com e sem
`_` antes de `.zip`). Se o Inep tiver edição mais nova sem complemento espacial, informar
e não trocar a tabela.

**Motivo:** cruzar cadastro 2026 com pontos 2025 sem declarar a diferença produz falsa
ausência e localização obsoleta. Uma edição comum é uma unidade de publicação.

**Guarda:** divergência de chaves de até 1% é permitida, sempre preservando todas as linhas
do Inep e deixando sem geometria as não casadas. Acima de 1%, abortar como provável erro de
edição/schema. Código existente só no geobr nunca entra na tabela e é contado na linhagem.

### 3. A tabela guarda todas as situações; as views definem consumo

**Escolha:** `infraestrutura.escola` preserva os códigos 1–4 de situação. A view
`escola_ativa` usa apenas `situacao_funcionamento = 1`. A view `escola_analisavel` exige
também qualidade espacial.

**Motivo:** o GeoParquet medido contém 33.652 escolas não ativas. Contá-las em análises
territoriais ou no tile explicaria números maiores que a rede realmente em funcionamento.

### 4. Qualidade espacial viaja com cada linha

**Escolha:** preservar coordenadas Inep e geocodebr, `coords_source`,
`precisao_geocodebr`, `tipo_resultado_geocodebr` e `desvio_metros_geocodebr`.

`apta_analise_territorial` exige:

1. escola ativa;
2. geometria Point válida, não vazia e no envelope do Brasil;
3. `ST_Covers` do município declarado sobre o ponto; e
4. fonte `inep`, ou fonte `geocodebr` com `desvio_metros_geocodebr <= 800`.

**Motivo:** geocódigo em centro de município pode cair dentro de uma região onde a escola
não existe — exatamente o tipo de falso positivo que motivou esta rodada. O ponto continua
disponível para inspeção/mapa, mas não entra automaticamente em contagem local.

### 5. Oferta educacional é derivada de indicadores explícitos

**Escolha:** o preparador produz booleanos para `oferece_creche`, `oferece_pre_escola`,
`oferece_fundamental_anos_iniciais`, `oferece_fundamental_anos_finais`, `oferece_medio`,
`oferece_eja`, `oferece_profissional` e `educacao_especial_exclusiva`.

Cada booleano é `true` quando qualquer indicador oficial correspondente vale `1`. O código
fonte exato fica documentado e testado; nada é inferido do nome da escola.

| Booleano final | Indicadores oficiais que entram no `OR` |
|----------------|-----------------------------------------|
| `oferece_creche` | `IN_COMUM_CRECHE`, `IN_ESP_EXCLUSIVA_CRECHE` |
| `oferece_pre_escola` | `IN_COMUM_PRE`, `IN_ESP_EXCLUSIVA_PRE` |
| `oferece_fundamental_anos_iniciais` | `IN_COMUM_FUND_AI`, `IN_ESP_EXCLUSIVA_FUND_AI` |
| `oferece_fundamental_anos_finais` | `IN_COMUM_FUND_AF`, `IN_ESP_EXCLUSIVA_FUND_AF` |
| `oferece_medio` | os oito `IN_COMUM_MEDIO_*` e `IN_ESP_EXCLUSIVA_MEDIO_*` |
| `oferece_eja` | os seis `IN_COMUM_EJA_*` e `IN_ESP_EXCLUSIVA_EJA_*` |
| `oferece_profissional` | `*_MEDIO_INTEGRADO`, `*_MEDIO_FIC`, `*_EJA_PROF`, `IN_COMUM_PROF`, `IN_ESP_EXCLUSIVA_PROF` |
| `educacao_especial_exclusiva` | `IN_ESPECIAL_EXCLUSIVA` |

### 6. Hash composto decide idempotência

**Escolha:** calcular SHA-256 do ZIP Inep e do GeoParquet. Hashes iguais aos registrados em
`meta.fonte.versao` encerram com `sem mudança`; mudança em qualquer um refaz o cruzamento.

**Formato:**
`ano=2025; inep_sha256=<64>; geobr_release=v2.0.0; geobr_sha256=<64>`.

### 7. A carga e a publicação são atos separados

**Escolha:** o job termina no Postgres local/lab. `scripts/vps-publicar-escolas.sh` aceita
`--ensaio`, usa staging remoto e troca tabela, views e linhagem numa transação. O BUILD só
roda o ensaio.

### 8. Cadência é anual, com checagem em agosto

**Escolha:** comando agendável `./cargas/inep_escolas.sh`; recomendação operacional:
primeiro sábado de agosto, 05:00, `America/Sao_Paulo`, e execução manual após republicação
anunciada. A instalação do timer fica fora do BUILD.

## Contrato de dados

### `infraestrutura.escola`

| Coluna | Tipo | Regra |
|--------|------|-------|
| `cod_escola` | `char(8)` PK | Código Inep, nunca `double` no contrato final |
| `cod_municipio` | `char(7)` nullable | Código oficial do CSV; validado contra `ibge.municipio` |
| `nome_escola` | `text NOT NULL` | `NO_ENTIDADE` |
| `situacao_funcionamento` | `smallint NOT NULL` | 1 ativa; 2 paralisada; 3 extinta no ano; 4 extinta antes |
| `ativa` | `boolean NOT NULL` | `situacao_funcionamento = 1` |
| `dependencia_administrativa` | `smallint NOT NULL` | 1 federal; 2 estadual; 3 municipal; 4 privada |
| `categoria_escola_privada` | `smallint` nullable | Código oficial; nulo quando não aplicável |
| `localizacao` | `smallint` nullable | Urbana/rural conforme dicionário da edição |
| `localizacao_diferenciada` | `smallint` nullable | Código oficial |
| oito colunas `oferece_*` | `boolean NOT NULL` | Derivação documentada dos indicadores 263–290 |
| `endereco`, `numero`, `complemento`, `bairro`, `cep` | `text` nullable | Complemento geobr da mesma edição |
| `latitude_inep`, `longitude_inep` | `double precision` nullable | Coordenada original preservada pelo geobr |
| `latitude_geocodebr`, `longitude_geocodebr` | `double precision` nullable | Coordenada alternativa |
| `fonte_coordenada` | `text` nullable | `inep` ou `geocodebr` |
| `precisao_geocodebr`, `tipo_resultado_geocodebr` | `text` nullable | Qualidade do geocódigo |
| `desvio_metros_geocodebr` | `integer` nullable | Medida publicada pelo geobr |
| `geom` | `geometry(Point,4674)` nullable | Geometry do GeoParquet; vazia/inválida vira nula |
| `motivo_sem_geom` | `text` nullable | `sem_correspondencia`, `vazia`, `invalida`, `fora_do_brasil` |
| `geom_no_municipio` | `boolean` nullable | `ST_Covers` contra município declarado |
| `apta_analise_territorial` | `boolean NOT NULL` | Regra da Decisão 4 |
| `ano_censo` | `smallint NOT NULL` | Edição comum das duas fontes |

Índices: PK em `cod_escola`; B-tree em `cod_municipio`, `ativa`,
`dependencia_administrativa`; GiST em `geom`; GiST funcional em `(geom::geography)`.

### Views

```sql
CREATE VIEW infraestrutura.escola_ativa AS
SELECT * FROM infraestrutura.escola WHERE ativa;

CREATE VIEW infraestrutura.escola_analisavel AS
SELECT * FROM infraestrutura.escola
WHERE ativa AND apta_analise_territorial;

CREATE VIEW infraestrutura.escola_cobertura_municipio AS
SELECT cod_municipio,
       count(*) FILTER (WHERE ativa) AS escolas_ativas,
       count(*) FILTER (WHERE ativa AND geom IS NOT NULL) AS ativas_com_ponto,
       count(*) FILTER (WHERE ativa AND apta_analise_territorial) AS ativas_analisaveis
FROM infraestrutura.escola
GROUP BY cod_municipio;
```

Nenhuma view substitui o CNEFE nesta feature.

## Preparador do CSV oficial

`metodologia/inep/preparar_escolas.py` lê em streaming, Latin-1/Windows-1252, valida a
presença das colunas usadas e emite UTF-8 `;` com:

- identificação e classificação: `NU_ANO_CENSO`, `CO_ENTIDADE`, `NO_ENTIDADE`,
  `CO_MUNICIPIO`, `TP_DEPENDENCIA`, `TP_CATEGORIA_ESCOLA_PRIVADA`,
  `TP_LOCALIZACAO`, `TP_LOCALIZACAO_DIFERENCIADA`, `TP_SITUACAO_FUNCIONAMENTO`;
- oferta: `IN_ESPECIAL_EXCLUSIVA`, `IN_COMUM_CRECHE`, `IN_COMUM_PRE`,
  `IN_COMUM_FUND_AI`, `IN_COMUM_FUND_AF`, os quatro `IN_COMUM_MEDIO_*`, os equivalentes
  `IN_ESP_EXCLUSIVA_*`, os seis `*_EJA_*` e `IN_COMUM_PROF`/
  `IN_ESP_EXCLUSIVA_PROF`.

Coluna usada ausente, linha com quantidade de campos diferente ou código inválido aborta
nomeando arquivo e linha. Coluna nova não usada é aceita; isso evita quebrar por expansão
irrelevante das atuais 290 colunas.

## Manifesto de arquivos

| # | Arquivo | Ação | Finalidade | Responsável | Dependências |
|---|---------|------|------------|-------------|--------------|
| 1 | `../servidor-dados-gis/metodologia/inep/preparar_escolas.py` | Criar | Extrair contrato cadastral e derivar ofertas em streaming | harness de build | stdlib |
| 2 | `../servidor-dados-gis/metodologia/inep/test_preparar_escolas.py` | Criar | Congelar cabeçalho, códigos e derivação de oferta | harness de build | 1 |
| 3 | `../servidor-dados-gis/cargas/inep_escolas.sh` | Criar | Job completo de ingestão e publicação local | harness de build | 1, GDAL, PostGIS |
| 4 | `../servidor-dados-gis/scripts/vps-publicar-escolas.sh` | Criar | Transporte atômico com `--ensaio` | harness de build | 3 |
| 5 | `../servidor-dados-gis/scripts/verificar.sh` | Modificar | Incluir `infraestrutura` e invariantes Inep | harness de build | 3 |
| 6 | `../servidor-dados-gis/docs/escolas-inep.md` | Criar | Linhagem dupla, schema, qualidade e operação | harness de build | 1, 3 |
| 7 | `../servidor-dados-gis/README.md` | Modificar | Inventário e comando da carga | harness de build | 3, 6 |

**Total:** 7 arquivos. Nenhum código em `geo-analytics`, além dos artefatos SDD.

## Padrões de implementação

### Descoberta da edição

```bash
# Extrair apenas nomes schools_YYYY.parquet da página de assets da release configurada,
# validar regex estrita e escolher o maior ano. Nunca executar conteúdo retornado.
```

O nome do arquivo e o ano retornado são dados não confiáveis da rede: aceitar somente
`^schools_[0-9]{4}[.]parquet$`.

### Parquet para staging

Usar a imagem GDAL já adotada no repositório, volume `dados/:ro`, rede do PostGIS e
`ogr2ogr -nln staging.escola_geo_raw -overwrite --config PG_USE_COPY YES`. Antes do BUILD
assumir o driver, provar `ogrinfo --formats` contém Parquet. Se não contiver, usar
`uv run --script` com `pyarrow` para emitir CSV; não instalar runtime global.

### Join e geometria

```sql
LEFT JOIN staging.escola_geo_raw g
  ON lpad((g.code_school::bigint)::text, 8, '0') = i.cod_escola
```

Geometry vazia, inválida ou fora do envelope `(-74, -34, -28, 6)` vira `NULL`, nunca
desaparece. `ST_Covers`, e não `ST_Contains`, aceita ponto exatamente sobre a fronteira.

### Troca atômica

Mesmo padrão da carga CNES: tabelas de staging sobrevivem a falha; tabela temporária é
validada; `TRUNCATE + INSERT + views + grants + meta.fonte` ocorrem numa transação.

## Fluxo operacional

```text
1. Exigir PostGIS, GDAL/Parquet e 4 GB livres
2. Descobrir maior edição comum Inep + geobr
3. Baixar ambos para .novo e calcular os dois SHA-256
4. Se o par de hashes é vigente: sair 0, sem mudança
5. Extrair só Tabela_Escola_*.csv do ZIP oficial
6. Preparar/copy do cadastro oficial para staging
7. Ogr2ogr do GeoParquet para staging espacial
8. Validar chaves, edição e divergência entre conjuntos
9. Cruzar, qualificar ponto e município, montar tabela temporária
10. Validar e trocar tabela + views + linhagem numa transação
11. ANALYZE e validar como geo_reader
12. Promover arquivos .novo ao cache somente após sucesso
```

## Estratégia de testes

| Tipo | Evidência exigida no BUILD |
|------|-----------------------------|
| Unidade | Rodar `uv run --script metodologia/inep/test_preparar_escolas.py` |
| Estático | `bash -n`; `shellcheck` se disponível; sintaxe Python via `uv` |
| Fonte real | Carga completa do ZIP Inep + GeoParquet da edição comum |
| Chave | Zero código vazio/duplicado; 100% das linhas Inep publicadas |
| Cruzamento | Medir `inep_only`, `geobr_only`, interseção e reprovar divergência >1% |
| Situação | Tabela preserva códigos; view ativa contém somente código 1 |
| Oferta | Fixtures cobrem cada grupo de indicadores e combinação especial/comum |
| Espacial | SRID 4674; zero geom inválida/vazia/fora do envelope na tabela final |
| Qualidade | Geocode >800 m não entra na view analisável; linha continua na tabela |
| Município | Zero órfão ativo; medir e registrar pontos fora do município |
| Atomicidade | Falha injetada antes da troca mantém hashes e contagens anteriores |
| Idempotência | Segunda execução não muda `data_carga` nem conteúdo |
| Permissão | `geo_reader` lê tabela/views e não escreve |
| Transporte | Rodar somente `scripts/vps-publicar-escolas.sh --ensaio` |
| Regressão | `./scripts/verificar.sh --profundo` |

Os números observados de 2025 são baseline de diagnóstico, não assert permanente.

## Tratamento de erros

| Falha | Comportamento |
|-------|--------------|
| Edição existe só no Inep | Informar espera do complemento espacial; manter versão vigente |
| Download/hash falha | Repetir até 3 vezes; manter versão vigente |
| CSV/Parquet muda schema | Abortar nomeando colunas faltantes |
| Código vazio/duplicado | Abortar antes da troca |
| Divergência de chaves ≤1% | Preservar todo Inep; publicar sem ponto e registrar cobertura |
| Divergência de chaves >1% | Abortar como provável edição errada |
| Geometry vazia/ruim | Preservar escola com `geom NULL` e motivo |
| Ponto fora do município | Preservar, marcar não analisável; abortar se exceder 2% das ativas com ponto |
| Falha de COPY/transação | Rollback; versão publicada intacta; staging disponível |

## Configuração

| Chave | Padrão | Uso |
|-------|--------|-----|
| `INEP_ANO` | maior edição comum descoberta | Fixar edição para reprodução |
| `INEP_URL` | descoberta/teste das duas formas oficiais | Override controlado |
| `GEOBR_DATA_RELEASE` | `v2.0.0` | Release do complemento espacial |
| `INEP_FORCAR` | `0` | Reprocessar hashes idênticos em diagnóstico |
| `VPS_HOST` | `hetzner-gramos` | Só no publicador separado |
| `REMOTO_CT` | `geodata-postgis` | Só no publicador separado |

## Observabilidade

A linha final informa: ano, hashes, total por situação/dependência, chaves casadas e não
casadas, pontos Inep/geocodebr/ausentes, ativos analisáveis, pontos fora do município e
duração. A síntese entra em `meta.fonte.observacao`. Exit codes: `0` sucesso/sem mudança;
`1` fonte ou integridade; `2` configuração/ambiente.

## Handoff para o harness de BUILD

1. Trabalhar apenas em `../servidor-dados-gis`.
2. Não tocar `query/`, `pipeline/`, catálogo web, PMTiles nem Raio-X.
3. Implementar os sete arquivos do manifesto, nessa ordem.
4. Rodar os testes com as fontes reais e o publicador somente com `--ensaio`.
5. Não substituir a camada atual nem publicar nada; a futura rodada de consumo deve usar
   `escola_analisavel`, ou declarar outra regra de qualidade explicitamente.

## Histórico de revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-18 | Codex | Desenho inicial, fechado contra microdado Inep e GeoParquet geobr reais |
| 1.1 | 2026-09-18 | Cursor | Status Complete após build local; produção intocada |
| 1.2 | 2026-09-18 | Cursor | Shipped and archived |

## Próximo passo

**✅ SHIPPED**
