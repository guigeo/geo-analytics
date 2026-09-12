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

**Prioridade declarada para a volta (2026-09-05): o portal de login.** Sai o portão de
`basic_auth`, entra portal com sessão, logout e troca de senha. O escopo é o que o mantém
pequeno: **conta por pessoa, sem distinção entre pessoas do mesmo cliente** — várias
pessoas da mesma empresa veem os mesmos desenhos, as mesmas camadas, o mesmo acervo; não
há papel, permissão nem dado por pessoa. O gatilho já estava nomeado no ADR desde
2026-08-29 ("dado do usuário para guardar") e disparou em 2026-09-03, quando o
`DESENHO_NO_MAPA` subiu nos dois clientes. A pergunta que a feature abre — onde a sessão
mora, já que hoje o portão é Caddy puro e o site sobrevive à queda do agente — está na
emenda de 2026-09-05 à §8 do ADR-0001, no `webgis`.

**A malha H3 (2026-09-05), a variável que faltava (2026-09-06) e a primeira tela
(2026-09-07).** O Censo 2022 passou a existir em 68.448 células de 0,106 km² sobre a
concentração urbana São Paulo/SP, e o `CNEFE_H3` pôs dentro delas 17 contagens do Cadastro
Nacional de Endereços em 37.801 células — a primeira variável **medida** da malha, que
entra por ponto e sem rateio. A `TELA_H3` publicou nos dois clientes um tile de 68.454
células (inclui seis células CNEFE de borda) com o tema único **domicílios em apartamento**;
a casca ganhou pintura numérica contínua, legenda e a tool `h3_no_ponto`. A cobertura de 37
municípios é declarada no produto: fora dela a camada não inventa ausência de dados.

O que a segunda ensinou e vale além dela: o CNEFE e a malha de setores do Censo 2022
**renumeram parte dos mesmos setores**, então o `cod_setor` não serve de chave entre os
dois produtos — cruzar por ele perderia 4,3% dos domicílios sem dar erro nenhum, e cruzar
por coordenada funciona. Por município os dois fecham na unidade: 8.735.615 domicílios
particulares nos 37. Registro completo em `.claude/sdd/archive/CENSO_H3/` e
`.claude/sdd/archive/CNEFE_H3/`; armadilhas da fonte em
`../servidor-dados-gis/docs/cnefe.md`.

**Segue em aberto:** Atlas do Desenvolvimento Humano/IDHM por município; POIs via
OSM/Geofabrik com ANAC para aeroportos; streaming se a latência do chat doer; um caso de área
desenhada no `benchmark.yaml` (o ambiente já recebe o acervo).

**Segue barrado por espaço:** eixo de ruas nacional (OSM). A VPS tem **5,2 GB livres de 38 GB
(86% usado)**, medido em 2026-09-05 — eram 3,9 GB em 2026-08-31, e antes disso o parágrafo
dizia ~6 GB, que já estava errado. Hetzner
Volume continua sendo a rota mais barata, e não upgrade de plano.

**Melhoria esperando espaço: o basemap detalhado.** O mapa de fundo hoje publicado para o
Brasil para no zoom 13, e a fonte (Protomaps) tem rua de bairro e contorno de prédio até o
zoom 15 — então, de 14 em diante, o que a tela mostra é o tile de 13 esticado, sem detalhe
novo. Medido em 2026-09-12, gerando os três arquivos com `pmtiles extract` sobre o build
`20250602` (o mesmo do nacional em produção, de propósito: build diferente faz as ruas
divergirem entre as duas camadas):

| Recorte | Zoom máximo | Tamanho |
|---|---|---|
| Brasil (publicado hoje) | 13 | 1,4 GB |
| Brasil | 14 | 2,7 GB |
| Brasil | **15 (teto da fonte)** | **5,5 GB** |
| Concentração urbana de SP | 15 | 132 MB |

**A melhoria é publicar o de 5,5 GB assim que houver espaço na VPS** — decisão do Guilherme
em 2026-09-12, depois de comparar os três no host local: o ganho de detalhe é visível e o
custo não é desempenho. Medido no próprio arquivo: o peso médio do tile quase não muda
(43 KB em z13, 45 KB em z15); o que cresce é o pico em área densa (63 KB → 205 KB), e o
navegador passa a buscar tile de verdade em dois níveis onde antes reaproveitava o esticado.
A troca **não exige mudança no front**: é o mesmo nome de arquivo e a mesma source.

O gatilho é o disco: **4,2 GB livres de 38 GB (89% usado), medido em 2026-09-12** — eram
5,2 GB em 2026-09-05. Publicar o de 5,5 GB exige ~4,1 GB livres só durante o envio (o antigo
sai depois), e o envio tem de ser para nome temporário com `mv` no fim, senão o mapa fica
quebrado em produção enquanto sobe. Note que `make ship-tiles` do `webgis` **não serve** para
esse caso: ele sincroniza o diretório inteiro com `--delete`, então um host local com mapas
de teste ao lado estouraria o disco da VPS.

Dois caminhos intermediários, se o espaço não vier: o Brasil em z14 (2,7 GB, cabe hoje) ou o
z15 apenas nas manchas urbanas — o IBGE agrupa 660 municípios em 185 concentrações urbanas, e
`pmtiles extract` aceita `--region` com GeoJSON. O segundo obriga o estilo a montar o tema
duas vezes (nacional até z13, detalhado de z14 em diante), que é o custo de código que o
arquivo único não tem.

**Melhorias do Raio-X aprovadas em 2026-09-12, nenhuma publicada.** Discutidas com o
Guilherme sobre o Raio-X já construído (seis blocos: escala, contraste, perfil, classe
social, qualidade e regulação), e aprovadas nesta ordem:

1. **Saneamento como alerta, não como bloco.** Água, esgoto e lixo entram na conta, mas só
   viram linha na tela onde há **falta** — corte proposto em 90% dos domicílios ocupados.
   A medição que decidiu o formato (2026-09-12, `ibge_tabular.setor` com
   `domicilios_ocupados` no denominador): na concentração urbana de SP a mediana é 100%
   para água e 99,6% para esgoto, então um bloco fixo diria "normal" em quase toda área —
   mas a cauda é grossa, com **5.483 setores abaixo de 70% em esgoto de rede** e o
   percentil 5 em 18,6%. Em São Caetano do Sul é 100% nos 421 setores, nas três variáveis:
   lá o alerta nunca deve aparecer, e esse é o comportamento correto. Atenção ao
   denominador — com `V0003` (domicílios particulares, que inclui vago e de uso ocasional)
   a mesma conta dava mediana de 86% e inventava um problema que não existe.
2. **Escola e saúde do CNEFE na área.** Contagem de endereços de ensino e de saúde dentro
   do desenho, que é dado **medido** (endereço com coordenada), não rateado. Comércio ficou
   **de fora** por decisão do Guilherme, e `end_em_obra` fica de fora por um motivo mais
   forte: é a única variável cuja defasagem inverte o sentido — obra de 2022 hoje é prédio
   pronto. Escola e posto de saúde mudam pouco em quatro anos e envelhecem bem.
3. **Comparar duas áreas desenhadas.** A de maior valor e a mais barata em dado: zero dado
   novo, a conta do Raio-X já roda por área. O custo é de tela. Muda o uso do produto —
   hoje ele descreve um lugar, com isso ajuda a escolher entre dois.

**A variável de empresas (Receita/CNPJ), e por que o CNEFE é o caminho.** Quer-se contagem de
empresas por célula H3. O cadastro da Receita não tem coordenada, e o geocodificador já está
no acervo: o CNEFE traz logradouro, número e CEP ao lado da coordenada medida — a carga do
`CNEFE_H3` guardou o bruto fiel à fonte exatamente para isso (ver "O que ainda não existe"
em `../servidor-dados-gis/docs/cnefe.md`). Três decisões já tomadas: **precisão de quadra
basta**, porque o destino é a célula de 0,106 km²; o **endereço cadastral do CNPJ não é o
operacional** (matriz em contabilidade, holding em residência) e isso entra como disclaimer,
não como bloqueio; e o volume se corta **antes** de geocodificar — só estabelecimento ativo,
só no recorte, o que derruba de ~60 M para a ordem de 2-3 M e tira o trabalho do Databricks,
onde o Guilherme já mediu que custa caro. O trabalho sujo é padronizar abreviação de
logradouro dos dois lados. Um bônus ainda não usado: `DSC_ESTABELECIMENTO` está preenchido em
100% das espécies 4, 5, 6 e 8, então há **duas** chaves possíveis contra a Receita — endereço
e nome. Piloto barato para medir a taxa de casamento antes de prometer a feature: São Caetano
do Sul, onde os 82.528 endereços do CNEFE já serviram de piloto antes.

**Só os 37 municípios do CNEFE estão em casa**, ~10,2 M endereços, e só no lab. Os ~111 M do
Brasil exigiriam baixar o resto por UF — cabe nos 865 GB do lab, não no Mac nem na VPS.
