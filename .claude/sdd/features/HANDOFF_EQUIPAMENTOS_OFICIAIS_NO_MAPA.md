# HANDOFF: EQUIPAMENTOS_OFICIAIS_NO_MAPA

> Para quem vai executar o `/build`. Escrito em 2026-09-19, depois do portão de aceite.
> **Não repete o DESIGN** — lê-se junto com ele, não no lugar dele.

## Ordem de leitura

1. [`DESIGN_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md`](DESIGN_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md) — manifesto de 30 arquivos, 6 decisões, padrões de código
2. [`DEFINE_…`](DEFINE_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md) — os 13 testes de aceite
3. `AGENTS.md` deste repo e `../webgis/AGENTS.md` — regras que valem acima de tudo isto
4. Este arquivo — o que já foi feito e onde você vai tropeçar

---

## O que JÁ ESTÁ FEITO — não refaça

| Item | Estado | Onde |
|---|---|---|
| Réplicas de CNES e escolas na VPS | **Publicadas em 2026-09-19** e conferidas linha a linha | `hetzner-gramos:geodata-postgis` |
| Portão da Decisão 1 (taxonomia) | **Aprovado pelo Gui em 2026-09-19** | Ver "Taxonomia aprovada", abaixo |
| De-para dos tipos do CNES | **Escrito**, 46 linhas, cobre os 40 códigos do dado | `servidor-dados-gis/metodologia/cnes/tipo_unidade.csv` |
| Fonte oficial do de-para | `CNES/CNV/TP_ESTAB.CNV` do TabNet, 45 códigos | `http://tabnet.datasus.gov.br/cgi/cnes/cnv/TP_ESTAB.CNV` |

**O portão da Decisão 1 já passou.** O DESIGN manda parar depois da etapa 1 para aprovar a
taxonomia; isso aconteceu. Comece pela etapa 1 e siga direto.

### Taxonomia aprovada, medida contra a view analisável em 2026-09-19

| classe | estabelecimentos | no mapa | conta no Raio-X |
|---|---:|:---:|:---:|
| `especialidade` | 106.994 | sim | **sim** |
| `atencao_basica` | 51.914 | sim | **sim** |
| `apoio_diagnostico` | 32.819 | sim | não |
| `farmacia` | 29.739 | sim | não |
| `hospital` | 8.037 | sim | **sim** |
| `promocao` | 4.654 | sim | não |
| `urgencia` | 2.030 | sim | **sim** |
| fora do mapa | 248.791 | — | — |

Manchete do cartão de saúde: **168.975** estabelecimentos nacionais.

---

## As seis armadilhas deste trabalho

### 1. O código 16 não existe na tabela oficial

330 linhas no cadastro com `tipo_unidade = 16`, e a `TP_ESTAB.CNV` do DATASUS **não tem
esse código**. Os nomes não têm padrão ("CLINICA DO SONO", "VIGILANCIA SANITARIA
MUNICIPAL", "DAVITA").

Já está no de-para com `rotulo_oficial` vazio, `classe = desconhecido`, `no_mapa = false`.
**Não invente um rótulo para ele.** É o cenário do AT-010 acontecendo de verdade, e o valor
dele é ser visível.

### 2. O de-para tem uma coluna a mais do que o DESIGN previu

O DESIGN especificou `cod, rotulo, classe, conta_no_raio_x, no_mapa`. O CSV tem também
`rotulo_oficial` (a string exata do DATASUS, sem acento, maiúscula) e `observacao`.

Motivo: `rotulo` é o que vai ao popup e precisa ser legível ("Centro de saúde / UBS");
`rotulo_oficial` é o que torna a linha auditável contra a fonte. Guarde as duas. O DDL do
arquivo 2 do manifesto precisa refletir isso.

### 3. O `--ensaio` não pode abrir SSH

Regra herdada das cargas de 18/09, e a razão é que qualquer `ssh` no caminho do ensaio vira
publicação acidental. O `scripts/vps-publicar-cnes.sh:26-40` é o modelo: o bloco do ensaio
consulta só o banco local e faz `exit 0` **antes** da primeira linha que fala com a VPS.
O `vps-publicar-tipo-unidade.sh` (arquivo 5) copia essa forma.

### 4. O `GRANT` ao `geo_reader` que ninguém lembra

Tabela nova no schema `infraestrutura` **não** herda permissão. Sem o `GRANT SELECT` ao
`geo_reader`, a aplicação não enxerga a tabela e o erro só aparece em produção. Está no
arquivo 2 do manifesto; confira no `inep_escolas.sh:488-490`, que faz certo.

### 5. Apelido de coluna sem aspas no `datasets.yaml`

O Postgres minusculiza apelido sem aspas, e é isso que as camadas de infraestrutura
esperam. **Aspas só no contrato IBGE** (`CD_MUN` e afins). Errar aqui gera um tile cujo
atributo não bate com o `atributos` do catálogo, e a camada fica clicável mostrando nada.

### 6. O snapshot do CNES mudou em 19/09 às 05:53

O ZIP no S3 do DATASUS tem `Last-Modified` de 2026-09-19 05:53 UTC; a carga em produção é
de 18/09. **Recarregue antes de gerar o tile** (`./cargas/datasus_cnes.sh`) — senão o
primeiro tile publicado já nasce uma safra atrás. As contagens deste documento vão mudar um
pouco, e isso é esperado: refaça a medição, não force o número antigo.

---

## Regras de processo que valem aqui

- **Aceite visual antes de produção.** O Gui vê a tela antes do `ship-tiles`. Não publique
  tile em `tiles.averisen.com` sem o "pode subir".
- **Disco da VPS: 3,3 GB livres de 38 GB (91%)**, medido em 2026-09-19 depois das réplicas.
  Meça antes e depois do `ship-tiles` e aborte abaixo de 2 GB (AT-012).
- **Commits pequenos, direto na `main`**, com a aprovação vindo da conversa e não do
  GitHub. Uma etapa do manifesto por commit é um bom tamanho.
- **Se um subagente não escrever em duas tentativas, assuma direto.** Foi o que aconteceu
  nas cargas de 18/09 e está registrado no SHIPPED delas.
- **Nunca `git push --force` nem `git reset --hard`** em nenhum dos dois repositórios.

---

## Evidência exigida por teste de aceite

Não basta o teste passar — o BUILD_REPORT precisa da evidência. O que vale para cada um:

| AT | Evidência que conta |
|---|---|
| AT-001, AT-002 | Captura do painel nos dois clientes, camadas apagadas, com fonte e cobertura visíveis |
| AT-003 | Contagem por `classe` lida do `.pmtiles` publicado, não do SQL que o gerou |
| AT-004 | Teste que muda a classe oculta e verifica a chamada de `setFilter`, sem rede nova |
| AT-005 | O contrato carrega `total` e `total_no_mapa`; o teste prova que são iguais no estado inicial |
| AT-008 | **Saída real da fachada**, com uma área sem equipamento, passada pelo contrato Pydantic. Mock que devolve número bonito não prova nada — é a lição do "dublê fiel demais" |
| AT-010 | Rodar `verificar.sh` com um código inventado no dado e mostrar que ele falha |
| AT-012 | `df -h /` na VPS antes e depois, colado no relatório |

---

## O que NÃO fazer

- **Não toque nas cargas `datasus_cnes.sh` e `inep_escolas.sh`** além de rodá-las. O único
  arquivo novo no `servidor-dados-gis` é o de-para e seus companheiros (manifesto 1–5).
- **Não use as flags `ST_ATEND_*`** do CSV do CNES. Parecem separar assistência de apoio e
  não separam — a Decisão 5 do DESIGN traz a medição que prova. `ST_ATEND_HOSPITALAR` é a
  única útil e fica para depois, porque usá-la exige mexer na carga.
- **Não troque a fonte do tema `equipamentos` do `h3_no_ponto`.** Fora de escopo, e é a
  pendência que o SHIPPED vai registrar.
- **Não regenere o snapshot do MapLibre com `-u` cego.** Leia o diff: ele é o único teste
  que pega camada mal traduzida.
- **Não publique o endereço da escola no tile.** Está na tabela, o tile é público, e o
  manifesto de atributos do DESIGN não o inclui.

---

## Divergência para fechar de passagem

`agent/src/geo_agent/tools.py:22` define o `Literal` `Camada` sem `h3_equipamentos`, mas
`tools.py:717` devolve exatamente esse valor. O `schemas.py:30-32` tem. É só type hint, não
quebra em runtime. O DEFINE listou como **COULD** — feche junto com o arquivo 27, que já
mexe nesse `Literal` para as camadas novas.

---

## Estado dos repositórios em 2026-09-19

| Repo | Branch | Último commit relevante |
|---|---|---|
| `geo-analytics` | `main`, limpa, sincronizada | `505f387` — DESIGN desta feature |
| `servidor-dados-gis` | `main`, sincronizada | `004ccd1` — as duas cargas de 18/09 |

O `metodologia/cnes/tipo_unidade.csv` está **não commitado** no `servidor-dados-gis`, de
propósito: ele entra no primeiro commit do build, junto com a carga que o consome.
