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

**Melhorias do Raio-X aprovadas em 2026-09-12.** O alerta de saneamento, os equipamentos e a
comparação entre áreas foram publicados em 2026-09-13 nos dois clientes, e a leitura de
coleta de lixo foi corrigida em 2026-09-15. Discutidas com o
Guilherme sobre o Raio-X já construído (seis blocos: escala, contraste, perfil, classe
social, qualidade e regulação), e aprovadas nesta ordem:

1. **Saneamento como alerta, não como bloco.** Água, esgoto e lixo entram na conta, mas só
   viram linha na tela onde há **falta** — corte proposto em 90% dos domicílios ocupados.
   A medição que decidiu o formato (2026-09-12, `ibge_tabular.setor` com
   `domicilios_ocupados` no denominador): na concentração urbana de SP a mediana é 100%
   para água e 99,6% para esgoto, então um bloco fixo diria "normal" em quase toda área —
   mas a cauda é grossa, com **5.483 setores abaixo de 70% em esgoto de rede** e o
   percentil 5 em 18,6%. Em São Caetano do Sul as três são 100%, e o alerta nunca deve
   aparecer lá — mas apareceu até 2026-09-15, porque a leitura somava só `V00397`, o lixo
   recolhido no domicílio, e ignorava `V00398`, a caçamba do mesmo serviço de limpeza. As
   duas são coleta; o destino inadequado começa em `V00399`. Corrigido: a cobertura da
   concentração urbana passa de 91,37% para 99,47%, os setores abaixo do corte caem de 8.542
   para 842, e em São Caetano de 28 para zero. Um setor de lá acusava 4% de coleta, tendo
   100%. Detalhe que decidiu a fórmula: suprimida conta zero só quando a irmã está presente,
   porque 69.315 setores têm uma e não têm a outra. Atenção também ao
   denominador — com `V0003` (domicílios particulares, que inclui vago e de uso ocasional)
   a mesma conta dava mediana de 86% e inventava um problema que não existe.
2. ~~**Escola e saúde do CNEFE na área.**~~ Publicada em 2026-09-13: contagem de endereços de ensino e de saúde dentro
   do desenho, que é dado **medido** (endereço com coordenada), não rateado. Comércio ficou
   **de fora** por decisão do Guilherme, e `end_em_obra` fica de fora por um motivo mais
   forte: é a única variável cuja defasagem inverte o sentido — obra de 2022 hoje é prédio
   pronto. Escola e posto de saúde mudam pouco em quatro anos e envelhecem bem.
3. ~~**Comparar duas áreas desenhadas.**~~ Publicada em 2026-09-13: a de maior valor e a mais barata em dado: zero dado
   novo, a conta do Raio-X já roda por área. O custo é de tela. Muda o uso do produto —
   hoje ele descreve um lugar, com isso ajuda a escolher entre dois.

**A-001 medida na VPS em 2026-09-13 — e a premissa estava errada no pior caso.** Seis
requisições reais de buffers de 0,2823 km² ficaram entre 188 e 892 ms, com mediana de
361 ms: o uso observado atende ao alvo de 1 s. Já o município de São Paulo inteiro
(1.522,683 km² e 27.719 setores) não terminou em 90 s e foi cancelado sem derrubar os
serviços. Separadas as duas partes, o Censo levou 3,606 s e o zoneamento sozinho excedeu
15 s. Portanto A-005 também era falsa: a interseção das 61.784 feições regulatórias é o
gargalo. O processo cliente atingiu 47,5 MiB de RSS e a VPS terminou com 2,0 GiB de memória
disponível; o defeito medido é latência, não pressão de memória. O teto de 2.000 km² não
protege esse caminho. A correção seguinte deve limitar o bloco regulatório separadamente ou
otimizar a consulta; baixar às cegas o teto do Raio-X inteiro apagaria uma capacidade que a
parte censitária ainda entrega em 3,6 s.

**O corretivo escolhido foi um teto de 50.000.000 m² para o relatório inteiro.** Uma segunda
curva na mesma VPS, com buffers no centro de São Paulo e o contrato completo, mediu 0,281;
0,780; 3,122; 7,024; 12,487; 28,096; 49,949; 78,045; 175,601 e 312,180 km². Os tempos
respectivos foram 231, 333, 206, 276, 501, 541, 787, 979, 1.894 e 3.182 ms. O corte fica em
50 km² porque é o último ponto abaixo de 1 s com margem; 78 km² bate a meta sem deixar folga
para concorrência. A rota e a fachada de consulta recusam antes da varredura, e o painel usa
a área exata já devolvida pelo PostGIS para desabilitar a ação e explicar como corrigir. Não
se limitou o desenho salvo: ele continua útil no mapa e no chat; o limite é só do relatório
que demonstrou o custo.

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

**A idade entrou no Raio-X antes de entrar no mapa, de propósito (2026-09-15).** O bloco
Perfil passou a mostrar quatro grupos etários — 0-14, 15-29, 30-59 e 60+ — porque ali a conta
roda por área e não custa tile nenhum. A camada equivalente no mapa ficou para depois de uma
semana de uso: quais faixas as pessoas de fato olham é o que decide quais valem o tile, e
regerar tile é caro de repetir. É a mesma escolha que fez a `TELA_H3` estrear com um tema só
em 2026-09-07. O gatilho para retomar é a observação de uso, não uma data.

**Ordem de execução acordada em 2026-09-12, do mais barato ao mais caro.** O critério é
esforço crescente, e a primeira linha de cada item é o que de fato custa.

| # | Item | O que custa | Dado novo? |
|---|---|---|---|
| ~~1~~ | ~~**Publicar o Raio-X**~~ — no ar desde 2026-09-12 no cliente 1 e 2026-09-13 no cliente 2 | só deploy | não |
| ~~2~~ | ~~**Seletor de variável na tela H3**~~ — publicado nos dois clientes em 2026-09-13 (`SELETOR_H3`) | frontend; a casca já pintava por valor e tinha legenda | não |
| ~~3~~ | ~~**Mais variáveis no agente** (`h3_no_ponto`)~~ — publicado nos dois clientes em 2026-09-13 (`H3_NO_AGENTE`) | backend pequeno + prompt | não |
| ~~4~~ | ~~**Saneamento como alerta no Raio-X**~~ — publicado nos dois clientes em 2026-09-13; a coleta de lixo passou a somar a caçamba em 2026-09-15 | 3 variáveis e um corte em 90% | não |
| ~~5~~ | ~~**Escola e saúde no Raio-X**~~ — publicada nos dois clientes em 2026-09-13 | carga nova de ~35,7 mil pontos, do lab | sim, leve |
| ~~6~~ | ~~**Comparar duas áreas**~~ — publicada nos dois clientes em 2026-09-13 | só tela; a conta já roda por área | não |
| 7 | **Basemap z15 no Brasil** | 5,5 GB na VPS — barrado por disco | não |
| 7b | **Camada H3 de população por idade** — o Raio-X ganhou as faixas em 2026-09-15 e o mapa não tem a leitura equivalente | tile novo (`h3_populacao`), os 4 passos de camada nova, e escolher grupos e rampa de uma vez | não |
| 8 | **Empresas (Receita × CNEFE)** | semanas: baixar, padronizar, casar, agregar, publicar | sim, pesado |

Os itens 1 a 4 e o 6 **não exigem dado novo nenhum**: o que falta neles é leitura e tela
sobre o que já está no `geodata`. São 40 variáveis do Censo em `indicadores.censo_h3_r9` e
17 do CNEFE em `cnefe_h3_r9`, com os rótulos legíveis em `ibge_tabular.variavel` e
`indicadores.cnefe_variavel` — nenhuma carga no `servidor-dados-gis` é necessária para
resolver a lacuna que hoje deixa a tela mostrando **uma** variável e o agente alcançando
**três**.

O item 5 tem um ganho que não é de quantidade: são 17.337 endereços de ensino e 18.365 de
saúde nos 37 municípios (medido em 2026-09-12), poucos o bastante para viajarem como pontos.
Com o ponto, a contagem dentro do desenho é **exata por interseção** — seria a primeira
variável do Raio-X que não passa por rateio, e portanto a primeira que o bloco de qualidade
não precisa ressalvar.

O item 8 começa por medição, não por carga: rodar o casamento de endereço em São Caetano do
Sul e contar a taxa de acerto antes de prometer a feature. Se passar de 80%, o caminho está
pago.

**Redesenho do painel de camadas — feito em 2026-09-13.** A queixa do Guilherme foi "está
pobrinho"; o diagnóstico é que tudo no painel tinha o mesmo peso visual — grupo, linha, nome
truncado, switch —, e nada ali dizia o que a camada mostra nem o que estava ligado. A pobreza
era de informação, não de pixel. O que entrou:

1. **Olho de visibilidade no lugar do switch.** Onze interruptores empilhados eram o que mais
   pesava na tela, e switch é idioma de tela de configuração. A linha inteira virou o
   controle, e continua sendo um `role="switch"`: mudou o desenho, não o que ela faz.
2. **Procedência debaixo do nome** — "IBGE · Censo 2022", "CNEFE 2022 · célula H3 r9", a lei
   do zoneamento —, num campo `fonte` novo do esquema. A decisão que vale além dela: camada
   sem origem registrada **não ganha linha nenhuma**. Antenas, rodovias e ferrovias não têm
   fonte em lugar nenhum do repositório, e um "a confirmar" na tela do cliente seria pior do
   que a lacuna.
3. **Selo com ícone por tema** no cabeçalho do combo, que acende quando ele abre, e a conta
   das camadas ligadas ali dentro. É ela que avisa, com o grupo fechado, que há coisa acesa.
4. **Símbolo de carta nas linhas.** Ferrovia é trilho com dormentes e rodovia é pista com
   faixa central — na legenda **e** no mapa, pelos mesmos campos (`tracejado`,
   `faixaCentral`). A faixa é sub-camada `__faixa` e só aparece do zoom 9 em diante: no país
   inteiro a estrada tem menos de um pixel, e a divisória viraria sujeira.

**O que foi construído e descartado, para a discussão não recomeçar do zero:** uma seção
"Ativas" no topo do painel, com contador e "limpar tudo". Ela respondia "o que está ligado"
de uma vez só, e caiu no uso: ligar uma camada a levava para cima e **empurrava a lista
inteira para baixo** — o painel se mexia debaixo do clique. A conta por combo dá a mesma
resposta sem deslocar nada. Também seguem fora, por decisão de 12/09: vidro fosco, gradiente
e sombra grande; busca de camada e opacidade por camada esperam a lista crescer.

A escolha foi feita olhando: um estudo com quatro tratamentos do cabeçalho de grupo (cartão,
selo com ícone, régua tipográfica e trilho colorido) lado a lado, nos dois temas. Ganhou o
selo com ícone. O painel é da **casca compartilhada**, então tudo isto vale para os dois
clientes.

**A premissa do item 2 estava errada, e a correção vale para o item 2b.** A tabela acima
dizia que o seletor não exigia dado novo porque "são 40 variáveis do Censo e 17 do CNEFE no
`geodata`". Verdade no banco, falso no produto: o tile publicado projeta **três** colunas
temáticas — `DOM_APARTAMENTO`, `DOM_CASA`, `DOMICILIOS_PARTICULARES` — mais as seis
`COORD_*` (`pipeline/datasets.yaml`). As outras 54 exigem novo SQL, `make tiles` e
`make ship-tiles`, com o tile hoje em 12,8 MB. Por isso a feature entregue foi o seletor
sobre o que já viaja, e a lista maior virou **etapa 2**: decidir as variáveis de uma vez —
regerar tile é caro de repetir — e medir o peso antes de publicar. O item 3 da fila
(`h3_no_ponto`) é a mesma lacuna vista do outro lado: o agente consulta o banco direto, e
por isso alcança o que a tela não alcança.

**Etapa 2 publicada em 2026-09-13: equipamentos por célula H3.** O tile
`h3_equipamentos` reaproveita a malha de 68.454 células e projeta as contagens exatas de
endereços do CNEFE para ensino e saúde. São dois temas próprios, com rampas distintas da
moradia; a cobertura única dos 37 municípios fica no grupo “Indicadores territoriais”, e não
repetida em cada camada. Agente, tile e mapa foram publicados juntos nos dois clientes.

## 2026-09-16 — O alerta que não era erro, e o prazo que faltava no banco

Um alerta do vigia do cliente 2 (`agente respondeu HTTP 000`, 20:10 UTC) levou à primeira
investigação de produção feita só pelo log. O resultado tem duas partes, e a segunda é a que
vale para o futuro.

**Não houve erro.** Zero 5xx e zero traceback em toda a janela retida, e — mais importante —
o agente do cliente 2 só tinha recebido requisições do **próprio vigia**: 306 `/api/health` e
310 `/api/auth/eu`, nenhum `login`, nenhum `chat`, nenhum Raio-X. Duas semanas depois de
publicado, o uso real era zero. O que o `HTTP 000` dizia é que o `curl` do vigia desistiu aos
20 s, e não que alguém tomou erro na tela.

**O que houve foi uma consulta sem prazo.** O `/api/health` pendurou mais de 20 s num
`select 1` enquanto o processo respondia outra rota em 0,3 ms no mesmo segundo — e a
requisição pendurada não deixou linha no journal, porque o middleware só escreve quando ela
termina. O `connect_timeout=5` das duas conexões cobre apenas o handshake. Entraram
`keepalives`, `tcp_user_timeout=10s` e `statement_timeout=20s` no geodata e no acervo: agora
o pendura-para-sempre vira exceção, e exceção o `_executa_com_retomada` já reconecta e
repete. Validado contra o Postgres da VPS antes de subir, não só nos testes.

**A terceira lição é sobre o próprio log.** O do agente mora no `user-1000.journal` e é
vacuumado antes do log do sistema — quando a investigação começou, o do sistema ia até 06/09
e o do agente só até 14/09. Alerta antigo pode não ter mais prova nenhuma, e por isso a
retenção do journald entrou junto da correção.
