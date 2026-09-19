# Plano de ataque — revisado em 2026-09-19

> Fila de trabalho, do rápido e barato ao caro e demorado. **Não é registro de decisão**
> — decisão mora no [`DECISOES.md`](DECISOES.md), e o que está no ar mora no
> [`AGENTS.md`](../AGENTS.md). Aqui é só a ordem de atacar.
>
> Estimativa é de esforço ativo, não de prazo. Onde há dependência, ela está dita.

---

## Agora — cabe numa tarde

### 1. Limpar o Docker da VPS ⚠️ destrava o resto

- [ ] `docker builder prune` — 1,19 GB, zero entradas ativas
- [ ] `docker image prune -a` sobre o que não está em uso — ~2,0 GB
- [ ] **Com o Gui olhando:** 8 volumes órfãos, 1,35 GB. Dois têm nome
      (`investe-ai_minio-restore-data`, `investe-ai_postgres-restore-data`); seis são
      hashes sem rótulo. Volume apagado não volta

**Esforço:** 10 minutos. **Impacto:** o maior da lista.

O disco não está cheio, está entulhado — e quase tudo é de **outros projetos** na mesma
VPS (`investe-ai-pipeline` 1,14 GB, `previsao-open-meteo` 1,15 GB, quatro imagens do
investe-ai de 505 MB). Medido em 2026-09-19: 3,3 GB livres de 38 GB (92%), com 4,6 GB
recuperáveis. A limpeza leva o livre para perto de 7 GB.

**Por que é o item 1:** três coisas do roadmap estão paradas por disco — o basemap de
zoom 15 que o Gui **já decidiu** em 12/09, o eixo de ruas nacional e a malha H3 nacional.
E a tendência é 4,2 GB (12/09) → 3,3 GB (19/09), cerca de 0,9 GB por semana: três semanas
e meia até o zero.

### 2. Girar a credencial do portão

- [ ] `PORTAO_CREDENCIAL` nova em `agent/.env.geo-analytics` e `agent/.env.eb-prime`
- [ ] `make ship-ia` nos dois + restart (sudo do Gui)
- [ ] Conferir 401 sem credencial e login pela tela

**Esforço:** 15 minutos.

A credencial dos dois clientes apareceu na tela durante a investigação de 19/09. Está no
repo do Gui e não saiu dele — girar é higiene, não incidente.

### 3. Recarregar o CNES e regerar os dois tiles

- [ ] `./cargas/datasus_cnes.sh` (o ZIP do DATASUS mudou em 19/09 05:53 UTC)
- [ ] `./cargas/_tipo_unidade.sh` se a safra trouxer código novo — o `verificar.sh`
      **derruba** se trouxer, e é para derrubar mesmo
- [ ] Regerar `escolas.pmtiles` e `saude.pmtiles`, `make ship-tiles`, aceite visual
- [ ] Atualizar as contagens no `AGENTS.md` — **remedir, não forçar o número antigo**

**Esforço:** 40 minutos, quase tudo esperando tippecanoe.

O tile em produção saiu do snapshot de 18/09. Cadência mensal, então é higiene.

---

## Esta semana — um dia ou menos cada

### 4. Um caso de área desenhada no `benchmark.yaml`

- [ ] Caso com desenho real no `agent/benchmark.yaml` (o ambiente já recebe o acervo)
- [ ] Rodar e registrar a linha de base

**Esforço:** ~1 hora. Backlog já listado desde 31/08. Barato e paga toda vez que o prompt
ou uma tool mudar.

### 5. Publicar o basemap de zoom 15

- [ ] **Depende do item 1**
- [ ] Gerar com `pmtiles extract` sobre o build `20250602` — o mesmo do nacional em
      produção, senão as ruas divergem entre as duas camadas
- [ ] Enviar para **nome temporário** e `mv` no fim, senão o mapa fica quebrado durante
      o envio
- [ ] Conferir espaço: precisa de ~4,1 GB livres durante a transferência

**Esforço:** ~2 horas, quase tudo upload de 5,5 GB.

Decisão do Gui em 12/09, parada por disco desde então. O front **não muda**: mesmo nome de
arquivo, mesma source. Hoje o mapa para no zoom 13 e, de 14 em diante, mostra tile esticado.

### 6. Atlas do Desenvolvimento Humano / IDHM por município

- [ ] Carga no `geodata`, réplica, camada no catálogo
- [ ] Decidir se entra no Raio-X ou só no mapa

**Esforço:** ~1 dia. Backlog antigo. O dado é pequeno — não briga com o disco.

### 7. Streaming no chat

- [ ] **Medir a latência primeiro.** Só fazer se doer de verdade

**Esforço:** ~1 dia. Backlog listado com a condicional desde 31/08. A condicional continua
valendo: sem medição, é otimização por sensação.

---

## Próximas semanas — vários dias

### 8. Malha H3 de equipamentos no cadastro oficial

- [ ] Refazer a agregação por ponto, com CNES e Inep no lugar do CNEFE
- [ ] Republicar o tile `h3_equipamentos`
- [ ] Ajustar `h3_no_ponto` e o prompt
- [ ] Decidir o que fazer com as contagens do CNEFE: somem ou viram segundo número

**Esforço:** 2 a 3 dias. Caminho já existe — é o mesmo do `CNEFE_H3`.

**Por que sobe na fila apesar do tamanho:** é contradição visível. O mapa e o Raio-X dizem
"12 escolas · Inep"; a camada H3 e a tool dizem "19 endereços de ensino · CNEFE". Mesma
sessão, duas grandezas — e desde 19/09 as duas procedências aparecem na tela. Era dívida
invisível, virou dívida aparente.

### 9. POIs via OSM/Geofabrik, com ANAC para aeroportos

- [ ] Carga e curadoria de categorias
- [ ] Camada e, se couber, cartão

**Esforço:** 2 a 3 dias. Backlog antigo.

**O trabalho de verdade não é a carga, é a curadoria** — a mesma discussão que o CNES
obrigou: o OSM tem centenas de valores de `amenity`, e decidir o que conta como POI é
decisão de produto, não de ETL. Vale reusar a forma do `cnes_tipo_unidade`: de-para em
tabela, com coluna dizendo o que entra no mapa e o que entra na manchete.

---

## Depende de disco, mesmo depois da limpeza

### 10. Eixo de ruas nacional (OSM)

- [ ] **Medir o tamanho antes de prometer.** Barrado desde 31/08

**Esforço:** vários dias. Pode continuar barrado mesmo com 7 GB livres — a medição vem
primeiro. Se não couber, a rota é Hetzner Volume, não upgrade de plano.

### 11. Malha H3 nacional

- [ ] Decidir a resolução (res 8 pesa ~2 GB; res 9 nacional é impensável hoje)
- [ ] Rever a cobertura declarada no produto

**Esforço:** vários dias, mais decisão de produto do que trabalho.

---

## O salto — feature que muda o patamar

### 12. A pergunta inversa: "onde?", não "o que tem aqui?"

- [ ] `/brainstorm` próprio — isto é SDD completo, não tarefa
- [ ] Definir o critério de ranqueamento e a unidade (célula H3? bairro? setor?)
- [ ] Decidir onde a resposta aparece: tela nova, ou o mapa pintado por pontuação

**Esforço:** 1 a 2 semanas.

Hoje o produto responde **"o que tem aqui?"**. O Raio-X compara duas áreas — mas só as que
o usuário já desenhou. Quem avalia ponto comercial não quer conferir uma escolha feita;
quer descobrir qual fazer.

**O dado já existe todo.** Censo, CNEFE, CNES, Inep e zoneamento estão nas 68.448 células
H3. Falta a pergunta invertida e a tela que a responde.

É a única coisa desta lista que muda **o que o produto é**, e não o que ele mostra.

---

## Riscado nesta revisão

- ~~Divergência do `Literal` `Camada` entre `tools.py` e `schemas.py`~~ — fechada pelo
  Grok em 19/09; as duas listas estão idênticas.
- ~~Publicar CNES e Inep no produto~~ — no ar nos dois clientes em 19/09.
