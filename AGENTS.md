# AGENTS.md

> **Fonte de verdade deste repositório.** Vale para qualquer agente — Claude Code, Codex
> ou outro. O `CLAUDE.md` é só um ponteiro para cá; nada de instrução mora lá.

> **É AQUI que se starta a sessão.** Regra única, decidida em 2026-08-31: todo trabalho
> começa neste repositório, seja ele feature, correção ou dúvida. É onde mora o código e
> o framework SDD. Os outros dois são alcançáveis daqui pelo disco (`../webgis`,
> `../servidor-dados-gis`), e o contrário também.

**Este repositório é um de três**, e os papéis se contradizem de propósito — o que vale
aqui não vale no vizinho:

| Repositório | Papel | O que se faz lá |
|---|---|---|
| `geo-analytics` (aqui) | **primeira aplicação derivada** — config e dado de cliente, e o agente | frontend, pipeline de tiles, agente, features |
| `../webgis` | a casca, a infraestrutura compartilhada e **o registro das decisões** | ADR, host de tiles, vigias, publicação de tiles |
| `../servidor-dados-gis` | dono do **dado universal** — cargas re-executáveis do IBGE/Censo | carga, schema do banco, e o `app_clientes` do acervo |

A contradição é literal e importa: no `servidor-dados-gis` **toda carga tem de ser
reexecutável**; o `app_clientes`, que o agente daqui escreve, existe exatamente para **não**
ser. Antes de tratar um como o outro, ver a emenda de 2026-08-31 à regra 4 do ADR-0001.

**Primeiro passo de toda sessão, antes de propor qualquer coisa:** se a tarefa toca
decisão, arquitetura, infraestrutura, deploy ou produção, **leia `../webgis/AGENTS.md` e o
ADR-0001 de lá**. Este arquivo descreve o código; o `webgis` é a sede das decisões, e
nenhuma sessão iniciada aqui carrega o conteúdo de lá automaticamente. Não decidir
arquitetura sem ter lido — foi assim que o recorte do Censo ficou quatro dias errado.

**Decisão que muda o que outro repositório faz não se resolve na sessão da feature.** Anote
no artefato do SDD que existe decisão pendente e trate dela como emenda no ADR-0001 do
`webgis` — lendo antes o `AGENTS.md` de lá.

**Um agente por vez, e a feature inteira com ele.** Claude Code e Codex nunca trabalham
juntos, nem na mesma feature partida por fase. Quem assume vai do início ao fim.

Este arquivo guarda **instrução**: linha que, se faltasse, faria o agente errar. O histórico
das decisões está em [`docs/DECISOES.md`](docs/DECISOES.md), e o registro por feature em
[`.claude/sdd/archive/`](.claude/sdd/archive/) — que é leitura útil para qualquer agente,
independentemente de quem consegue rodar os comandos que os geraram.

## O que é

Mapa web (MapLibre) + ETL geoespacial em Docker + **chat com agente de IA**.
Pipeline: `shp/gpkg/csv → GeoParquet (canônico) → PMTiles → MapLibre`.
Chat: `web (React) → agent/ (FastAPI + OpenAI function calling) → query/ (PostGIS)` — o
agente responde em texto e o mapa pinta os códigos retornados pelas tools.

**No ar, dois clientes** (VPS Hetzner + Caddy compartilhado, portão basic auth nos dois):

| Cliente | Domínio | Serviço systemd |
|---|---|---|
| 1 — `geo-analytics` | `geo-intelligence.averisen.com` | `geo-agent` |
| 2 — `eb-prime` | `app.ebprime.com.br` | `eb-prime-agent` |

O agente roda na VPS via systemd (uv/python 3.12 em `~/projects/geo`, só `127.0.0.1:8000`;
o Caddy expõe `/api`). Parquets em `~/projects/geo/data/processed` — o `setor.parquet` de lá
é ENXUTO (só `CD_SETOR` + `geom_bbox`, 6,5 MB vs 1 GB; gerado no `deploy.sh data`).
Rate limit por IP no backend protege a chave OpenAI (30 perguntas/10 min no chat) e o proxy
de geocoding (20/60s no `/api/geocode`).

**O app também ESCREVE.** O usuário desenha ponto, área e raio sobre o mapa, e isso vai para
o **`app_clientes`** — outro banco, com schema e papel por cliente. É o primeiro dado do
sistema que é do cliente e não do IBGE, e o primeiro em que "refaço do zero" deixou de ser
rede de segurança: **rodar `servidor-dados-gis/scripts/backup-acervo.sh --origem vps` antes
de qualquer publish que toque o acervo.**

## Fluxo (Makefile — porta de entrada única)

```bash
make dev        # desenvolve: Vite + HMR em :5173
make dev-ia     # dev + chat: front (:5173) + agente do cliente 1 (:8000)
make agente     # só o agente (uv nativo); CLIENTE=eb-prime PORTA_IA=8001 sobe o do cliente 2
make dev-lado-a-lado  # as duas aplicações juntas (:5173 e :5174), cada uma no seu agente
make preview    # valida: build + Caddy local em :8080 (IGUAL à VPS)
make ensaio     # ENSAIA o deploy sem tocar a VPS (rsync para /tmp, ssh só impresso)
make ship       # manda pra VPS: build + app
make ship-app   # só o frontend (redeploy rápido)   |  tiles: `make ship-tiles` no webgis
make ship-ia    # agente pra VPS (1ª vez: setup sudo — deploy/setup-agente-vps.sh)
#  todos aceitam CLIENTE=<id>; sem ele, o cliente 1
make help       # lista todos os alvos
```

`dev` é rápido mas difere da produção; **antes de `ship`, valide com `preview`** (mesmo
Caddy, mesma config de Range/compressão dos tiles). **O preview pede credencial** — usuário
`previa`, senha `previa-local`, no `deploy/Caddyfile.local` — e entrega `/api` ao agente
nativo, como a VPS faz. `ship*` usam `deploy/deploy.sh` (rsync via atalho `hetzner-gramos`
do `~/.ssh/config`).

**O deploy é por cliente:** domínio, caminhos, unit do systemd, porta e portão saem de
`deploy/clientes/<id>.env`, e `deploy/renderizar.sh` gera o bloco do Caddy e o unit a partir
de modelos versionados. **`make ensaio` faz o caminho inteiro contra `/tmp`** — nada sai da
máquina, e todo comando que iria por ssh é impresso. Publicar é passo do Guilherme.

**`make ship-app` NÃO toca o agente.** Antes de um `ship-app` puro, confira se há rota nova
esperada pelo frontend: um `ship-app` de rotina já pôs UI no ar contra um agente velho, e
todo `/api/desenhos` voltou **404 do FastAPI** (rota inexistente), não 503/422. Diagnóstico:
`curl -u <portão> .../api/<rota>` — 404 é deploy de agente atrasado; 503/422 vem de dentro
da rota.

**Os tiles não moram neste repositório.** Vivem num host compartilhado, servido para todas
as aplicações derivadas do `webgis`. O caminho vem de `TILES_DIR` no `.env` da raiz
(`cp .env.example .env`); em dev, `web/.env.local` aponta o front para o host com
`VITE_TILES_BASE_URL`. Ver `../webgis/docs/LOCAL.md`.

## Comandos (detalhe)

```bash
# ETL (no container — gdal/tippecanoe/pmtiles vivem na imagem, NÃO no host)
# Exige TILES_DIR no .env (host de tiles compartilhado; ver .env.example).
docker compose build
docker compose run --rm pipeline build                 # tudo: GeoParquet + tiles + basemap
docker compose run --rm pipeline build --only <nome>   # um dataset
docker compose run --rm pipeline build --basemap-only  # só basemap (não re-tila dados)
docker compose run --rm pipeline census                # ingere Censo 2022 -> data/processed/censo_setor.parquet
docker compose run --rm pipeline census-municipio      # agrega setor -> data/processed/censo_municipio.parquet
cd pipeline && uv run geo-pipeline search-index        # indice de busca do front (nativo, so duckdb)
#   -> web/src/search/municipios.json (gitignored). OBRIGATORIO antes de `npm run build`
#      em clone novo: o front importa esse JSON via `?url` (asset com hash).

# Frontend (NÃO há node no host — usar o container)
docker compose up web                                  # dev :5173 (= make dev)
docker compose exec web npm run typecheck

# Testes/lint do ETL (lógica pura roda nativa com uv)
cd pipeline && uv sync --group dev && uv run pytest && uv run ruff check .

# Camada de consulta (roda nativa com uv, precisa dos parquets em data/processed)
cd query && uv sync --group dev && uv run pytest && uv run ruff check .

# Agente de IA (nativo com uv; testes rodam OFFLINE, benchmark chama a OpenAI)
cd agent && uv sync --group dev && uv run pytest && uv run ruff check .
CLIENTE=eb-prime uv run uvicorn geo_agent.main:app --port 8001   # o agente do cliente 2
cd agent && uv run pytest -m benchmark -v   # 17 casos reais (requer agent/.env; ~17 chamadas)

# Acervo do cliente — banco `app_clientes`, no servidor-dados-gis
../servidor-dados-gis/cargas/app_clientes.sh <cliente> '<senha>'   # cria schema, papel e tabela
../servidor-dados-gis/cargas/kmz_para_acervo.sh <cliente> arq.kmz  # carga administrativa de KMZ
#   Os testes do acervo pulam sem ACERVO_DSN no agent/.env — sem erro, com a instrução.
```

## Arquitetura

- **`pipeline/`** — projeto `uv`. Orquestrado por `cli.py`, dirigido por `datasets.yaml`
  (registry declarativo: 1 entrada por camada → adicionar dataset = editar YAML, sem refactor).
  - `convert.py` usa **`ogr2ogr` (streaming)** p/ converter arquivos grandes sem OOM (reprojeta a EPSG:4326).
  - `antennas.py` parseia CSV de pontos. `tiles.py` chama `tippecanoe`. `basemap.py` extrai recorte Protomaps.
  - **A curadoria do Censo não mora aqui.** Acrescentar variável do Censo é uma linha em
    `servidor-dados-gis/cargas/censo_nomes.tsv`, não um dict aqui. Ver `docs/DECISOES.md`.
  - venv fica em `/opt/venv` no container (fora do bind mount) — ver `Dockerfile`.
- **`web/`** — React/Vite/TS. **`configuracao/` é a fronteira de cliente**: o esquema Zod
  (`configuracao/esquema.ts`) valida no boot o que difere entre aplicações derivadas —
  identidade, mapa, camadas e chat — e `clientes/<id>.ts` guarda os valores de cada uma.
  Quem precisa de camada importa de `@/configuracao`, não conhece cliente pelo nome.
  **`configuracao/catalogo.ts` guarda as camadas do dado universal**, iguais para todos;
  o cliente escolhe quais enxerga, e `com()` ajusta uma sem tocar no catálogo.
  **Qual cliente é o build vem de `VITE_CLIENTE`** (padrão `geo-analytics`), resolvido pelo
  alias `cliente-ativo` no `vite.config.ts` — composição de build, §8 do ADR-0001. Um bundle
  por cliente, e o de um não contém a configuração do outro. Duas de pé ao mesmo tempo:
  `make dev-lado-a-lado`.
  `map/layers.ts` **não define mais as camadas**: ele só traduz camada configurada para
  especificação do MapLibre, e o snapshot em `map/layers.test.ts` congela essa saída.
  `map/basemap.ts` monta o basemap vetorial (Protomaps) e o satélite (raster XYZ Esri World
  Imagery, sem API key) — toggle no header; `basemapOverlayLayers()` filtra só `line`/`symbol`
  do basemap (vias, limites, rótulos, POIs) pra manter por cima do raster em modo híbrido
  (segundo toggle, opcional, só aparece com satélite ligado). `map/MapView.tsx` monta o style
  (basemap/satélite + camadas + seleção + destaques) e trata clique; `map/selection.ts` faz o
  highlight do CLIQUE via fonte GeoJSON. `map/highlight.ts` pinta os destaques do AGENTE por
  código (`setFilter` com `CD_MUN`/`CD_SETOR` nas próprias fontes PMTiles — funciona fora do
  viewport, independe do toggle). `chat/ChatPanel.tsx` + `chat/api.ts` = UI e client do chat;
  em dev o Vite faz proxy `/api → host.docker.internal:8000` (agente nativo; sem CORS).
  `components/SearchBox.tsx` combina a busca local de município/UF (`search/index.ts`,
  client-side sobre `search/municipios.json` gerado pelo pipeline) com busca de ENDEREÇO
  (`search/geocode.ts`, debounce 400ms a partir de 4 chars) via `/api/geocode` — proxy do
  agente pro Nominatim/OSM (que não manda CORS, por isso não dá pra chamar direto do
  navegador); endereço aproxima no zoom de rua (17) e não ganha destaque (sem código IBGE).
  `map/tileHost.ts` decide DE ONDE vêm os `.pmtiles`: sem `VITE_TILES_BASE_URL`, de `/tiles`
  na própria origem (o que a VPS serve hoje pelo Caddy); com ela, do HOST DE TILES
  COMPARTILHADO — em dev é o único caminho, porque **este repositório não guarda mais tile
  nenhum**. Ver `../webgis/docs/LOCAL.md`.
  `lib/novidades.ts` é o anúncio de feature nova, e é **dado, não JSX**: a lista mora ali e
  `components/Novidades.tsx` só renderiza — com a casca sendo derivada por cliente, changelog
  escrito em componente é conteúdo de um cliente dentro de código compartilhado. Cada novidade
  carrega a `pergunta` que o botão dispara no chat (via `PerguntaExterna`, o mesmo padrão
  `{texto, key}` do `MapFocus`) e o `chip` que entra na frente das sugestões do estado vazio:
  anunciar e DEMONSTRAR no mesmo clique. A pergunta precisa ser específica — medido: sem
  "porcentagem" e "top 10" o agente pede esclarecimento em vez de pintar o mapa.
- **`query/`** — projeto `uv`. Camada de consulta PostGIS sobre o geodata central —
  **backend de dados do chat**. `db.py` abre a conexão (`GEODATA_DSN`, papel `geo_reader`,
  `autocommit`); `queries.py` expõe `GeoQuery` (lookups, `busca_municipios` nome→código,
  `ranking_municipios`, `setor_no_ponto`, `setores_proximos`, `setores_no_ponto`). Geometria
  exata vive nos PMTiles **e no banco**; o backend devolve `cd_setor`/`cd_mun` e o mapa pinta.
  Espacial é **exato**: `ST_DWithin`/`ST_Distance` sobre o polígono real, em metros. Métrica
  tem dois caminhos — resumo materializado quando a coluna existe lá, formato longo quando
  não (medido; ver `webgis/docs/HERANCA.md` §7.4).
- **`agent/`** — projeto `uv`. Backend do chat: FastAPI + SDK `openai` PURO (sem framework de
  agente — decisão de aprendizado). `tools.py` = 15 tools (args Pydantic → JSON Schema;
  `TOOL_REGISTRY` despacha p/ o `GeoQuery`); `agent.py` = loop de tool-calling explícito
  (teto 6 iterações; erro de tool volta ao LLM p/ autocorreção 1x) + sessões em memória
  (TTL 1 h). **Grounding:** `destaques`/`dados` da resposta saem das rows das tools
  (determinístico), o LLM só escreve o texto. Config via `agent/.env` (`OPENAI_API_KEY`,
  `OPENAI_MODEL=gpt-5-mini`). Benchmark de 30 casos em `benchmark.yaml`.
  **`cliente.py` é a fronteira de cliente do backend**, irmã do `web/src/configuracao/`: a
  **persona** — nome, descrição e para quem responde — mora em `geo_agent/clientes/<id>.toml`,
  validada por Pydantic no boot, e `CLIENTE` escolhe qual (padrão `geo-analytics`). **Nenhum
  `.py` cita cliente** — `test_cliente.py` guarda isso. Um processo serve um cliente só;
  `/api/health` diz qual, porque com dois agentes de pé "está vivo" deixa de bastar. O
  `geocode.py` também se identifica ao Nominatim com o domínio do cliente.
  **`prompts.py`** define o escopo em prosa (que temas existem, o que é fora de escopo) — ao
  adicionar um tema no censo, atualizar aqui também, senão o agente recusa dado que já existe
  no banco (aconteceu com renda: dado chegou, mas o prompt ainda mandava recusar).
  **As classes são A / B / C / DE — quatro, não cinco.** Diga "na mesma régua do Critério
  Brasil", nunca "segundo a ABEP": o método é outro — eles classificam por posse e instrução,
  aqui é renda domiciliar estimada.
  **Classe social é a única métrica aqui que o IBGE NÃO publica.** O rótulo diz "(estimada)",
  a regra 8 do system prompt manda declarar, e `_avisos_classe_social()` devolve o aviso
  **junto da linha** — o que muda o sentido do número é dado, não instrução de prompt
  (regra 8 do ADR-0001). Ver `docs/DECISOES.md`.
  As **regras são da casca, a persona é do cliente.**
  `tools.py` também guarda `METRIC_LABELS` (coluna → rótulo PT-BR das colunas curadas do
  Censo) — embutido no fim do system prompt pra o LLM NUNCA devolver nome cru de coluna na
  resposta (ex.: "pop_total" vira "população total"); `listar_metricas` devolve
  `{campo, rotulo}`. Além do loop de chat, `main.py` expõe `GET /api/geocode` — proxy pro
  Nominatim/OSM pra busca de endereço do front (rate limit próprio por IP, separado do chat).
- **`agent/…/acervo.py`** — a fachada que **ESCREVE**, e a única. Irmã do `query/`, oposta a
  ele: aquele lê o `geodata` (universal, reconstruível), este escreve o `app_clientes` (do
  cliente, insubstituível). **Leitura tem retomada, escrita não** — repetir um SELECT é
  seguro, repetir um INSERT cria dois desenhos, e a assimetria mora na assinatura de dois
  métodos irmãos. O isolamento entre clientes é do **Postgres**, não da aplicação: o papel de
  um não tem `USAGE` no schema do outro, e o banco recusa em vez de misturar.
  `rotas_desenhos.py` expõe o CRUD em `/api/desenhos`; toda falha vira 503 ou 422.
  `tools.py:info_area_desenhada` lê a geometria aqui em WKB e a manda como **parâmetro** da
  consulta no `geodata` — sem `postgres_fdw`, sem JOIN entre bancos. O cruzamento é
  `query/queries.py:cruzamento_por_geometria`, com **rateio areal** na borda: os avisos
  (quanto veio de rateio; se a área cabe dentro de um setor só) saem da ROW, não do prompt —
  regra 8 do ADR. `ACERVO_DSN` vazio NÃO impede o boot: cai uma tool, não o chat.
- **`web/src/desenho/`** — geometria e estado **puros** (fora do React e do MapLibre, como
  `map/medicao.ts`), fontes GeoJSON, cliente REST e os três componentes. **O buffer manda o
  CENTRO, não o círculo:** quem gera o polígono é o `ST_Buffer` sobre `geography`, com 64
  lados dos dois lados — o navegador não tem elipsoide, e o círculo dele só pré-visualiza.
  **Esconder desenho é FILTRO por id**, não `visibility`: a visibilidade é da camada, e as
  três camadas do acervo servem todos os desenhos.
- **Saídas** (não versionadas): `data/processed/*.parquet` e os `*.pmtiles`, que o pipeline
  escreve direto no host de tiles compartilhado (`TILES_DIR` no `.env` → `GEO_TILES_DIR=/tiles`
  no container). Sem `TILES_DIR`, `docker compose` e `deploy.sh tiles` param com mensagem em
  vez de recriar a cópia por app.

## Convenções

- **Python: sempre `uv`** (nunca pip/venv global). Type hints obrigatórios. Ruff + pytest.
- **Frontend tem portão**: `npm run format:check`, `lint`, `typecheck`, `test` e `build` — o
  mesmo que o CI roda, em Node 20 (a imagem do build de produção). Rodar o portão antes de
  dizer que terminou.
- **`data/` é gitignored** (fontes grandes/reproduzíveis) — só `data/README.md` é versionado.
- **Dados crus nunca lidos em runtime** — convertidos uma vez para GeoParquet.
- Camada pesada (setor ~473k) → tuning no `tippecanoe`; tilagem é o gargalo, não a conversão.
- **Idioma: português em tudo** — prosa, commits e também **código**. Fronteira de idioma
  dentro do código cobra pedágio de atenção em toda mudança. Sobrou inglês de antes desta
  decisão; ele se traduz quando o arquivo for tocado, não numa varredura só.

## Como se entrega

Versão curta das "Convenções de trabalho" do [`../webgis/AGENTS.md`](../webgis/AGENTS.md) —
em caso de dúvida, vale o texto de lá, que é a sede.

- **A aprovação acontece na conversa, não no GitHub.** O plano é aprovado antes; daí em
  diante o agente vai até o fim sozinho — commit, push e entrega na `main`. **Não abrir PR
  e ficar esperando.**
- **PR só quando ele fizer trabalho:** mudança que precisa de revisão linha a linha, ou que
  o Guilherme pediu para ver antes. Nesse caso o agente abre **e mescla**, sem devolver a
  aprovação para quem já aprovou o plano.
- **Nada de trabalho pronto parado na árvore** — nem em branch, nem em PR aberto. Peça que
  fecha é commitada e empurrada no mesmo movimento.
- **O que autoriza commitar na `main` é a validação, não a pressa.** O corpo do commit
  declara o que foi rodado: teste, build, portão, medição contra a fonte, processo de pé.
  Sem isso, o fluxo direto vira só um jeito mais rápido de quebrar a `main`.
- **Commit convencional, em português, com corpo em prosa** explicando o porquê e o que foi
  validado — não uma lista do que foi tocado.
- **Entrega se prova na `main`, não no `git status`.** Antes de dizer "nada pendente",
  conferir `git log origin/main..HEAD` **e** se a `main` local não está atrás da remota.

## Acervo de conhecimento (`.claude/kb/`)

`maplibre` · `pmtiles-tippecanoe` · `geospatial-etl` · `agentes-llm` — padrões já
destilados, em markdown. **A pasta se chama `.claude/` por herança, não por dono:** o
conteúdo serve a qualquer agente, e o do `sdd/archive/` também.

## Estado atual

**Tudo que está pronto está no ar**, nos dois clientes, desde 2026-09-03 — inclusive o
`DESENHO_NO_MAPA` (ponto, área e raio guardados no `app_clientes`, com o agente cruzando a
área desenhada com o Censo por rateio areal). Nenhuma pendência de acervo ou desenho.

**Redeploy do agente:** `make ship-ia [CLIENTE=<id>]` + `ssh -t hetzner-gramos 'sudo
systemctl restart <SERVICO do cliente>'`. O restart pede senha — **só roda num terminal de
verdade do Guilherme, nunca pelo Claude Code.** A instalação na VPS é **editable**: `uv sync`
sem mudança de dependências não precisa de `--reinstall-package`, mas o processo do systemd
só pega o código novo depois do `restart`.

**Atenção ao redeploy do agente:** o `.env` (chave OpenAI, credencial do portão) às vezes é
editado direto na VPS e fica mais novo que o local — antes de `deploy.sh agent`/`ship-ia`,
comparar mtimes pra não sobrescrever a chave certa com uma desatualizada. Já derrubou o
portão de um cliente uma vez.

### Em aberto

- **Remedir o cruzamento na VPS (A-001).** Os tempos foram medidos neste Mac; lá a memória é
  menor. A primeira execução **fria** de uma área grande custou 3,9 s aqui, contra 640 ms
  com cache quente.
- **Achado de segurança:** o `geodata` ainda concede `CONNECT`/`TEMPORARY` a `PUBLIC`, então
  qualquer papel do cluster abre conexão nele. Fechado no `app_clientes` e deixado no central
  de propósito — endurecer banco em produção não é coisa de fazer de passagem dentro de uma
  feature.
- **Espaço na VPS:** 3,9 GB livres de 38 GB (90% usado), medido em 2026-08-31. É o que barra
  o eixo de ruas nacional (OSM).

Roadmap e ideias em aberto: [`docs/DECISOES.md`](docs/DECISOES.md).
