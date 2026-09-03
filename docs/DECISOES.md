# Decisões e histórico

Registro do **porquê** — o que foi decidido, quando, e o que a decisão substituiu.

Este arquivo **não** entra na sessão do agente. O `CLAUDE.md` da raiz carrega em toda
sessão e por isso guarda só instrução: linha que, se faltasse, faria o agente errar.
O resto — a narrativa de como chegamos aqui — mora aqui.

Separados em 2026-09-03, quando o `CLAUDE.md` tinha 23 KB e a seção "Próximo passo"
descrevia como pendente uma feature publicada no dia anterior.

---

## Linha do tempo

| Data | O que aconteceu |
|------|-----------------|
| 2026-06-27 | `MAPA_FASE1` e `REFINAMENTO_VISUAL` — mapa estático com 5 camadas IBGE/antenas |
| 2026-06-28 | Cliente 1 no ar em `geo-intelligence.averisen.com` |
| 2026-07-08 | `AGENTE_IA` shipada — chat com function calling, benchmark 16/16 |
| 2026-08-08 | Tema **renda do responsável pelo domicílio** em produção (commit `95b6358`) — primeiro dado econômico, puxado do IBGE fora do release padrão de setores |
| 2026-08-09 | Agente/dados movidos na VPS para `~/projects/geo`; toggle de satélite; busca de endereço via `/api/geocode`; glossário `METRIC_LABELS` (o LLM parou de vazar `pop_total` na resposta) |
| 2026-08-20 | Passo 4 do roteiro: `query/` migra para PostGIS; a curadoria do Censo sai deste repositório |
| 2026-08-27 | Classe social estimada entra (schema `indicadores` do `servidor-dados-gis`) |
| 2026-08-29 | Portão do frontend no CI; decisão de idioma (português também no código) |
| 2026-08-30 | Fase 5 (persona por cliente) e fase 6 (deploy por cliente); preview passa a pedir credencial |
| 2026-08-31 | Cliente 2 (EB Prime) no ar em `app.ebprime.com.br` |
| 2026-09-02 | `DESENHO_NO_MAPA` arquivada — o app passa a **escrever** no `app_clientes` |
| 2026-09-03 | V2 (UI nova + desenho) publicada nos **dois** clientes |

---

## A curadoria do Censo saiu deste repositório (2026-08-20)

O `pipeline/census.py` — DuckDB sobre CSV — foi removido no passo 4 do roteiro. As camadas
passaram a sair do `geodata` por consulta declarada no `datasets.yaml`, e `data/` deixou de
guardar fonte bruta.

A escolha de variáveis passou a viver num lugar só: `servidor-dados-gis/cargas/censo_nomes.tsv`
— 41 variáveis, conferidas contra o banco em 2026-08-22 (41 distintas no formato longo).
Acrescentar variável virou uma linha lá, e não mais um dict aqui.

Era a pendência 3 do `webgis/docs/HERANCA.md`. Ela fecha por **não existir mais o segundo
dono** — não por alguém ter sincronizado as duas listas.

---

## O `query/` deixou de ser DuckDB (2026-08-20)

Antes: GeoArrow em memória, só centroide aproximado, sem operação geoespacial real.
Depois: PostGIS sobre o `geodata` central, com `ST_DWithin`/`ST_Distance` sobre o polígono
real, em metros, e `setor_que_contem` por `ST_Contains`.

Não há mais DuckDB nem GeoArrow no código deste repositório.

---

## Persona por cliente, e o critério de saída literal (fase 5, 2026-08-30)

A persona do agente saiu do `prompts.py` para `geo_agent/clientes/<id>.toml`.

**TOML e não `.py` de propósito:** persona é texto do cliente. O critério de saída da fase
foi literal — nenhum `.py` cita cliente — e `test_cliente.py` guarda isso.

Como se soube que o cliente 1 não mudou: com `publico` vazio, o prompt montado é **caractere
por caractere** o que estava cravado no `prompts.py` até 2026-08-30.

As **regras são da casca, a persona é do cliente**. Dois clientes com regras diferentes sobre
o mesmo número seriam dois produtos, não duas aplicações da mesma casca.

---

## Por que a classe social tem três marcas, e não uma

Classe social é a única métrica do app que o IBGE **não** publica — é estimativa do
`servidor-dados-gis` (schema `indicadores`, desde 2026-08-27).

Três coisas garantem que ela não passe por dado oficial, e **são três porque uma só cai**:

1. o rótulo diz "(estimada)";
2. a regra 8 do system prompt manda declarar;
3. `_avisos_classe_social()` devolve o aviso **junto da linha**.

A terceira é a regra 8 do ADR-0001: o que muda o sentido do número é **dado**, não instrução
de prompt. O aviso da tool só existe hoje na cascata `info_local`, porque é lá que o canal de
`avisos` existe; nas outras `info_*` a marca viaja só pelo rótulo.

Os cortes A/B/C/DE foram calibrados para a distribuição nacional reproduzir a do Critério
Brasil 2024 (A 3,1%, B 21,5%, C 47,0%, DE 28,4%).

---

## Os tiles saíram deste repositório

Vivem num host compartilhado, servido para todas as aplicações derivadas do `webgis` — uma
cópia só, em vez de uma por app (passo 1 do ADR-0001 de lá).

Sem `TILES_DIR`, o `docker compose` e o `deploy.sh tiles` param com mensagem, em vez de
recriar a cópia por app.

---

## Ideias em aberto — revisadas em 2026-08-31

Metade da lista anterior já tinha sido entregue, e o parágrafo seguia descrevendo o mundo de
antes do passo 4 do ADR:

- ~~operações geoespaciais reais (buffer, distância), que exigiriam WKB porque "hoje é
  GeoArrow e só dá centroide aproximado"~~ — **feito** em 2026-08-20.
- ~~"novas tools se as perguntas extrapolarem as 7 atuais"~~ — são **15** hoje, com os níveis
  bairro, distrito e a cascata `info_local`.
- ~~"desenho no mapa, com os dados do cliente"~~ — **feito**: `DESENHO_NO_MAPA`.

**Segue em aberto:** Atlas do Desenvolvimento Humano/IDHM por município; POIs via
OSM/Geofabrik com ANAC para aeroportos; streaming se a latência do chat doer; um caso de área
desenhada no `benchmark.yaml` (o ambiente já recebe o acervo).

**Segue barrado por espaço:** eixo de ruas nacional (OSM). A VPS tem **3,9 GB livres de 38 GB
(90% usado)**, medido em 2026-08-31 — não os ~6 GB que o parágrafo anterior dizia. Hetzner
Volume continua sendo a rota mais barata, e não upgrade de plano.
