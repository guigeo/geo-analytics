# BUILD REPORT: DESENHO_NO_MAPA — Fases 1 e 4

> Desenho de ponto e área sobre o mapa, guardados no acervo do cliente, com isolamento
> garantido pelo Postgres e não pela aplicação.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | DESENHO_NO_MAPA |
| **Fases** | 1 (alicerce, ponto e área) e 4 (o agente enxerga). Faltam 2 e 3 — encerramento do traçado e buffer |
| **Data** | 2026-09-01 |
| **DEFINE** | [DEFINE_DESENHO_NO_MAPA.md](../features/DEFINE_DESENHO_NO_MAPA.md) |
| **DESIGN** | [DESIGN_DESENHO_NO_MAPA.md](../features/DESIGN_DESENHO_NO_MAPA.md) |
| **ADR** | ADR-0001 do `webgis`, emendas de 2026-08-31 (`8f6ef9c`) |
| **Commits** | `507b1ed` (backend), `ccc2189` (frontend), `0cd7e6c` (fase 4), `91857f2`/`943a31b` (`servidor-dados-gis`) |
| **Status** | Fases 1 e 4 completas. Não publicado — ver *Antes de ir para a VPS* |

---

## Resumo

| Métrica | Valor |
|---------|-------|
| **Itens do manifesto** | 25 de 26 como escritos (1–21 e 26–30); 1 com desvio declarado (item 21) |
| **Arquivos criados** | 14 (10 em `web/src/desenho/`, 3 no `agent/`, 1 no `servidor-dados-gis`) |
| **Arquivos modificados** | 7 (`agent/` ×4, `web/src/map/` ×4 incluindo testes, `App.tsx`) |
| **Linhas novas** | ~2.550 |
| **Testes do agente** | **106** (offline + os que exigem `ACERVO_DSN`/`GEODATA_DSN`, que pulam sem eles) |
| **Testes do front** | 131, incluindo 27 novos dos módulos puros e 6 do gesto de desenhar |
| **Testes do query** | **49** (41 de antes + 8 do cruzamento) |
| **Portão do front** | `format:check`, `lint`, `typecheck`, `test`, `build` — verde, nos dois clientes |

---

## Execução

| # | Item | Status | Notas |
|---|------|--------|-------|
| 1 | `cargas/app_clientes.sh` | ✅ | Virou `.sh` e não `.sql`: schema, papel e senha são parâmetros, e SQL puro não parametriza identificador |
| 2 | `agent/…/acervo.py` | ✅ | Leitura com retomada, escrita **sem** — a assimetria é o ponto da classe |
| 3 | `agent/tests/test_acervo.py` | ✅ | 14 testes; AT-004 falha se vier lista vazia em vez de erro |
| 4 | `agent/…/schemas.py` | ✅ | `DesenhoNovo`, `DesenhoEdicao`, `Desenho`, `PaginaDeDesenhos` |
| 5 | `agent/…/config.py` | ✅ | `acervo_dsn`, vazio por padrão |
| 6 | `agent/…/rotas_desenhos.py` | ✅ | CRUD + `/geometrias` + `/categorias`; 503 e 422 são traduzidos num decorador |
| 7 | `agent/tests/test_rotas_desenhos.py` | ✅ | 10 testes, montando o router num app mínimo |
| 8 | `agent/…/main.py` | ✅ | `/api/health` reporta o acervo e **não** devolve 503 quando ele cai |
| 9–12 | `desenho/geometria.ts` + `estado.ts` + testes | ✅ | 27 testes; área reaproveitada de `map/medicao.ts` |
| 13 | `desenho/fonte.ts` | ✅ | Duas fontes; cor por `["get","cor"]`, não uma camada por desenho |
| 14 | `desenho/api.ts` | ✅ | `ErroDoAcervo` separa 503 de 422 |
| 15 | `desenho/BarraFerramentas.tsx` | ⚠️ | **Dois** modos, não três — ver desvio 1 |
| 16 | `desenho/FormularioDesenho.tsx` | ✅ | Categoria por `datalist`; paleta fechada de seis cores |
| 17 | `desenho/PainelDesenhos.tsx` | ✅ | Busca, filtro, página e o estado de acervo fora do ar |
| 18 | `map/MapView.tsx` | ✅ | Traçado e acervo em fontes separadas; ambos restaurados após `setStyle` |
| 19 | `map/estilo.ts` + teste | ✅ | Camadas em todo cliente; 3 testes novos, um deles de ordem |
| 20 | `App.tsx` | ✅ | Composição; desenhar e medir se excluem |
| 21 | `deploy/clientes/*.env` | ⚠️ | **Não feito como escrito** — ver desvio 4 |
| — | `desenho/useAcervo.ts` | ➕ | Arquivo fora do manifesto — ver desvio 3 |

---

## Desvios do DESIGN

**1. A barra traz dois modos, não três.** O manifesto pede "os três modos" no item 15 e,
duas linhas abaixo, põe "modos polígono e buffer" na fase 3 (item 23). O buffer depende
do círculo geodésico (item 24) e do `ST_Buffer` no servidor (item 25), ambos declarados
fase 3. Um terceiro botão prometeria em tela o que o backend recusaria. **AT-003 fica
pendente** e é a única do MVP que esta fase não cobre.

**2. O mapa consome a `FeatureCollection` que o servidor monta.** O `fonte.ts` chegou a
ter `colecaoDeDesenhos(Desenho[])`, e ela saiu: `/api/desenhos/geometrias` já devolve a
coleção pronta, com `cor` em `properties` — que é justamente o que `["get","cor"]` lê.
Duas montagens da mesma coleção é onde essa propriedade se perde.

**3. `useAcervo.ts` não estava no manifesto.** São ~150 linhas de duas cargas com ritmos
diferentes (o mapa quer tudo, a lista quer a página filtrada), debounce e descarte de
resposta vencida. No `App` isso ficaria no meio do estado do mapa, do chat e da medição —
e a primeira coisa a se perder ali seria a distinção que o AT-012 cobra: **acervo fora do
ar não é lista vazia**.

**4. O `ACERVO_DSN` não foi para `deploy/clientes/*.env`.** Aquele arquivo é versionado, e
o DSN carrega senha. O padrão real do projeto guarda DSN no `agent/.env` da VPS, que não
vai ao Git. Documentado em `agent/.env.example`, com o registro de que a ausência dele
**não impede o boot** — é o que faz a §9 do ADR valer na prática.

---

## O que a implementação encontrou

**O `crs` pendurado no GeoJSON.** `ST_AsGeoJSON` injeta `{"crs":{"name":"EPSG:4674"}}`
sozinho quando o SRID não é 4326 — e o RFC 7946 removeu esse campo, então o MapLibre o
ignora **em silêncio**, que é o pior modo de falhar. Na entrada havia o espelho do mesmo
erro: coordenadas WGS84 sendo *rotuladas* 4674 em vez de convertidas. Os dois lados agora
usam `ST_Transform`; o erro de ida e volta mediu **0 m**. `test_geojson_sai_em_wgs84_e_sem_crs`
é a regressão.

**O `REVOKE` que derrubou o PostGIS.** `REVOKE ALL ON SCHEMA public` tirou o `USAGE`, e o
PostGIS instala suas funções ali: oito testes quebraram em
`function st_geomfromgeojson(unknown) does not exist`, que não fala de permissão nenhuma.
O correto é revogar `CREATE` e conceder `USAGE`. Está escrito no script para o caminho não
ser refeito.

**O duplo clique dependia da ordem dos efeitos.** Cada ferramenta desligava o zoom de
duplo clique no seu próprio `useEffect`; com o desenho ligado, o efeito da medição
reabilitava o zoom um instante antes de o do desenho desligá-lo. O teste pegou, e a
correção não foi no teste: ter uma ferramenta ativa virou uma pergunta só, num efeito só.

**`test_nenhum_py_cita_cliente` pegou uma docstring.** O critério de saída da fase 5 é
literal — nenhum `.py` cita cliente, nem em exemplo. O teste do acervo passou a derivar o
vizinho de `clientes_disponiveis()`, então sobrevive a um terceiro cliente.

### Achado de segurança — reportado, não mexido

O PostgreSQL concede `CONNECT` e `TEMPORARY` ao `PUBLIC` em todo banco novo. No
`app_clientes` isso foi fechado. **No `geodata` continua aberto** — qualquer papel do
cluster conecta nele. Endurecer um banco central em produção não é coisa de se fazer de
passagem dentro de uma feature; fica como decisão do Guilherme, com o caminho já
conhecido (`REVOKE CONNECT, TEMPORARY ON DATABASE geodata FROM PUBLIC`).

---

## Fase 4 — o agente enxerga a área desenhada

| # | Item | Status | Notas |
|---|------|--------|-------|
| 26 | `query/…/queries.py` | ✅ | `cruzamento_por_geometria()` — rateio areal, uma consulta, só leitura |
| 27 | `query/tests/test_queries.py` | ✅ | 8 testes: gabarito, reconstituição, borda, formato longo, média, densidade, recusa |
| 28 | `agent/…/tools.py` | ✅ | `info_area_desenhada` + `_avisos_de_borda()` + `_avisos_de_extensao()` |
| 29 | `agent/tests/test_tools.py` | ✅ | 7 testes, incluindo AT-007 sobre a **row** |
| 30 | `agent/…/prompts.py` | ✅ | Regra 9 e três exemplos; a 4a deixou de dizer "única porta" |
| — | `Contexto` em `tools.py`/`agent.py`/`main.py` | ➕ | Ver desvio 5 |

### O caminho, medido

A geometria sai do `app_clientes` em WKB (~2 kB para um desenho comum, 333 kB para o
contorno de São Paulo) e viaja como **parâmetro** da consulta no `geodata`. Não há
`postgres_fdw`, não há `JOIN` entre bancos, e o central continua sendo só lido.

| Área | Setores | Parciais | Tempo |
|---|---|---|---|
| Buffer 500 m | 40 | **30 (75%)** | 3 ms |
| Buffer 5 km | 3.286 | 164 (5%) | 36 ms |
| Buffer 50 km | 49.185 | 310 | 640 ms |
| Município de SP (21.308 vértices) | 27.719 | 775 | 1.320 ms |

Medido em 2026-09-01, neste Mac, com cache quente. **A primeira execução de uma área
grande custou 3,9 s** — o `ibge_tabular.setor` tem 18,9 M de linhas e o primeiro toque
paga o disco. Importa para a VPS (A-001), onde a memória é menor.

E confere contra o que já existia: o município como desenho devolve 11.451.967 contra
os 11.451.999 da tool municipal (**0,0003%**), e duas metades complementares de um setor
reconstituem o total com **0,0001%** — que é o que separa "fração de área" de "contagem
de setores", e o teste do município sozinho não separaria, porque lá a borda é 0,03%.

### Três decisões que o DESIGN deixou em aberto

**5. Nem toda métrica se soma.** O esboço do DESIGN agregava `pop_total` e a assinatura
recebia uma lista. Somar `renda_media` de 40 setores devolve um número grande, plausível
e sem significado nenhum — e silenciosamente. `_PESO_DA_MEDIA` declara o modo de cada
uma: soma para contagem, média ponderada por domicílios para as que são por domicílio
(renda do responsável, moradores por domicílio, os `pct_*`), densidade **recalculada**
sobre a área desenhada. `renda_mediana` é recusada nomeando a saída, porque mediana de
medianas não é mediana e não há como consertar isso com peso nenhum.

**6. As 34 métricas do formato longo entram.** Faixa etária, cor e tipo de domicílio são
todas contagens, e são metade da graça de perguntar sobre uma área ("quantas crianças de
0 a 4 anos moram aqui"). A CTE do longo só é montada quando alguém pede: são 18,9 M de
linhas, e juntá-las por nada dobraria o custo da área grande.

**7. `tools.py` recebe um `Contexto`, não uma `GeoQuery`.** A camada de tools alcança
dois bancos agora, e o tipo mostra a assimetria em vez de escondê-la: o `geodata` sempre
existe, o `acervo` pode faltar. Custou renomear 17 assinaturas e as fixtures dos testes,
e o que se ganha é que a falta do acervo derruba **uma tool**, não o chat — a §9 do ADR
virando tipo, não comentário.

### O que a fase 4 encontrou

**Nome de desenho parece nome de lugar, e isso não é acidente.** "Área da Sé" é um
desenho; "Sé" é um distrito real. Na primeira verificação com o agente vivo, a pergunta
"quantas crianças de 0 a 4 anos moram na Área da Sé?" fez o modelo **perguntar de volta**
qual dos dois era, gastando um turno para descobrir o que a tool responde sozinha.
Foram precisas duas travas, e a que resolveu foi a de baixo: a **descrição da tool**
mandando chamá-la antes de perguntar (é por nome e descrição que o LLM escolhe, não pelo
prompt), mais a regra 4a deixando de afirmar que `info_local` é a única porta — o que era
verdade até esta fase e passou a colidir com a regra 9.

**E um erro de método meu, que quase virou conclusão errada.** As duas rodadas de
verificação seguintes bateram num uvicorn **antigo**, que não morreu porque `kill %1` não
alcança job de outro shell. Concluí duas vezes que as correções não funcionavam quando
elas nem tinham sido carregadas. Só o `lsof -ti:8099 | xargs kill` fechou a porta; contra
o processo certo, as três perguntas de controle passam — a da área desenhada escolhe a
tool e reescreve o aviso, e Copacabana e Vila Madalena seguem no `info_local` de sempre.

---

## O primeiro dado real (2026-09-02) — fora do manifesto

Duas áreas do cliente 2 chegaram em KMZ do Google Earth e entraram por
`servidor-dados-gis/cargas/kmz_para_acervo.sh`, novo — **não** por feature da
aplicação, e não como camada: camada mora no host de tiles, aberto na internet sem
credencial. O destino é `cliente_eb_prime.desenho` com `origem = 'carga'`, a coluna
prevista desde o primeiro dia e que até aqui nenhuma carga real havia escrito.

| Área | Tamanho | Setor que a contém | População |
|---|---|---|---|
| BASILAR CERAMICA 2 | 0,70 ha, 8 vértices | 6,68 ha, 346 pessoas — cobre 10,3% | 36 |
| POTENCIAL INCORP SCS | 2,40 ha, 57 vértices | 23,88 ha, 2 pessoas — cobre 10,2% | 0 |

**AT-004 passou a valer com dado real:** o papel do cliente 1 recebe
`permission denied for schema cliente_eb_prime`. Até hoje o isolamento era testado
contra schema vazio.

### O defeito que o dado real revelou

As duas são **lotes**, não recortes de bairro — `ST_Within(área, setor)` é verdadeiro
nas duas. O aviso dizia *"a área corta 1 setores censitários ao meio"*: não corta nada.
E o erro de forma escondia o de fundo — ali o número não agrega coisa nenhuma, é a
população de **um** setor multiplicada pela fração de área. Num bairro a premissa de
distribuição uniforme se dilui entre centenas de setores; num lote ela responde por
100% do resultado. São dois avisos distintos agora, e a consulta devolve
`fracao_menor`/`fracao_maior` para o de baixo poder dizer quanto do setor a área ocupa.

Buffer e contorno do IBGE nunca produziriam esse caso: eu só desenhei áreas do tamanho
de bairro. **Nenhum teste sintético meu tinha o formato do problema.**

### Duas pedras no caminho da carga

O `ubuntu-small` do GDAL — a imagem das outras cargas — traz o driver **KML** mas não o
**LIBKML**, que é quem abre KMZ; o `ogr2ogr` recusa o arquivo listando os drivers que
tem, e KML não está entre os tentados. A `ubuntu-full` resolveria por mais de 1 GB de
download; o KMZ é extraído com o `zipfile` da stdlib, o mesmo recurso que o `_comum.sh`
já usa em `descompactar`, pelo mesmo motivo.

E o `psql` **não** substitui `:'variável'` dentro de `$$ … $$` nem em `-c` — só no que
lê da entrada padrão. Custou duas execuções falhas até o script passar tudo por stdin.

---

## Testes de aceitação

| AT | Cobertura | Onde |
|----|-----------|------|
| AT-001 | ✅ ponta a ponta, contra agente vivo | manual + `test_rotas_desenhos.py` |
| AT-002 | ✅ área salva com a área calculada | `geometria.test.ts`, `test_acervo.py` |
| AT-003 | ⛔ **fase 3** | buffer não existe ainda |
| AT-004 | ✅ recusa com `InsufficientPrivilege`; conferido com **dado real** em 02/09 | `test_acervo.py` |
| AT-005 | ✅ **0,0003%** contra a tool municipal | `test_queries.py`, `test_tools.py` |
| AT-006 | ✅ **0,0001%** ao reconstituir um setor cortado ao meio | `test_queries.py` |
| AT-007 | ✅ a row traz `parciais` e `pop_de_rateio` antes de qualquer texto | `test_tools.py` |
| AT-008 | ✅ 49 mil setores em **640 ms**, com aviso, sem recusar | `test_tools.py` |
| AT-009 / AT-010 | ✅ auto-interseção e degenerado recusados antes de sair | `geometria.test.ts` |
| AT-011 | ⏳ não exercitado | exige dropar e recarregar o `geodata` inteiro |
| AT-012 | ✅ 503 vira estado de tela, e o mapa segue de pé | `test_rotas_desenhos.py`, `PainelDesenhos.tsx` |
| AT-013 | ✅ paginação e filtro; ⏳ o tempo com 500 itens ainda não foi medido | `useAcervo.ts` |
| AT-014 | ✅ categoria nasce do uso, via `/categorias` | `test_acervo.py` |
| AT-015 | ✅ confirmação na própria linha | `PainelDesenhos.tsx` |
| AT-016 | ✅ `origem` `desenho` e `carga` convivem; a carga real rodou em 02/09 | `test_acervo.py`, `kmz_para_acervo.sh` |
| AT-017 | ✅ zero clientes citados em `.py` e `.tsx` | `test_cliente.py` |

---

## Antes de ir para a VPS

1. **Backup do `app_clientes` precisa existir** (Q-001 / A-006 do DEFINE). É o primeiro
   dado do sistema em que "refaço do zero" deixou de ser rede de segurança, e publicar
   antes do backup inverte a ordem exata em que isso importa.
2. **Rodar `cargas/app_clientes.sh` na VPS** para cada cliente, e pôr o `ACERVO_DSN` no
   `agent/.env` de lá — comparando mtimes antes, para não sobrescrever a chave da OpenAI.
3. `make ship-ia` + `sudo systemctl restart` — o restart pede senha e só roda em terminal
   de verdade.
4. **A-001 segue em aberto:** os tempos do DESIGN foram medidos neste Mac, não na VPS.
   Remedir antes da fase 4, que é quando eles passam a decidir alguma coisa.

## Próximo passo

Sobram as fases 2 e 3: encerramento explícito do traçado e o buffer por raio (AT-003,
a única aceitação do MVP ainda descoberta). Nenhuma das duas é pré-requisito da outra,
e o buffer é a que o usuário pediu por nome no `/brainstorm`.

Vale também um caso de área desenhada no `benchmark.yaml`: o ambiente do benchmark já
recebe o acervo, e o que falta é decidir de onde vem a geometria do caso — cravar um
desenho no acervo de desenvolvimento deixaria o benchmark dependente do estado dele.
