# DESIGN: CNES_NO_GEODATA

> Job mensal que transforma o cadastro nacional oficial do CNES em dado persistente,
> auditável e espacialmente qualificado no `geodata`, sem alterar Raio-X, tile ou frontend.

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | CNES_NO_GEODATA |
| **Data** | 2026-09-18 |
| **Autor** | Codex + Guilherme Ramos |
| **DEFINE** | [`DEFINE_CNES_NO_GEODATA.md`](DEFINE_CNES_NO_GEODATA.md) |
| **Status** | ✅ Shipped |
| **Repositório de implementação** | `../servidor-dados-gis` |
| **Produção** | Proibida nesta rodada; o build termina validado localmente |

## Evidência usada no desenho

A fonte real foi baixada e inspecionada em 2026-09-18:

| Item | Medição |
|------|---------|
| URL | `https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_csv.zip` |
| ZIP | 56.245.320 bytes; SHA-256 `b95bd235d2fa8ffda763a12e31504e0b5464c964b358628f82d4263d245ac549` |
| CSV | `cnes_estabelecimentos.csv`, 230.415.275 bytes, 36 colunas, `;`, cabeçalho, UTF-8 |
| Grão | 636.342 linhas, 636.342 códigos CNES únicos |
| Ativos | 497.614 linhas com `CO_MOTIVO_DESAB` vazio |
| Ativos com ponto válido no Brasil | 497.596 |
| Ativos preservados sem ponto | 18 |

O Ipea/geobr também publica `healthfacilities_202604.parquet`, mas ele não será a fonte
da carga: o CSV do DATASUS é direto, mais recente e já cobre espacialmente 99,996% dos
ativos. O GeoParquet confirmou onde nasceram os pontos da camada antiga e permanece uma
fonte de conferência, não uma dependência do job.

## Arquitetura

```text
  Ministério da Saúde / DATASUS
  cnes_estabelecimentos_csv.zip (URL estável; conteúdo muda)
                     │
                     │ download para .novo + SHA-256
                     ▼
       dados/cnes/cnes_estabelecimentos.zip
                     │ unzip -p / extração controlada
                     ▼
       staging.cnes_estabelecimento_raw
          36 colunas text, sem consumo
                     │
                     │ valida chave, status, domínio e município
                     ▼
       TEMP estabelecimento_saude_novo
          · código CNES com 7 dígitos
          · código municipal IBGE com 7 dígitos por join
          · registro ativo/inativo preservado
          · ponto válido ou geom NULL
          · motivo da ausência espacial
                     │
                     │ uma transação: validar → truncar → inserir
                     ▼
  infraestrutura.estabelecimento_saude
       ├─ infraestrutura.estabelecimento_saude_ativo
       └─ infraestrutura.estabelecimento_saude_analisavel
                     │
                     ├─ geo_reader (SELECT)
                     ├─ futuro query/Raio-X
                     ├─ futuro pipeline PMTiles
                     └─ scripts/vps-publicar-cnes.sh (ato separado)
```

## Componentes

| Componente | Papel | Tecnologia |
|------------|-------|------------|
| `cargas/datasus_cnes.sh` | Download, hash, staging, transformação, validação, troca e linhagem | Bash + `curl` + `psql` + PostGIS |
| `infraestrutura.estabelecimento_saude` | Cadastro integral da edição corrente | PostgreSQL/PostGIS |
| Views `*_ativo` e `*_analisavel` | Separam situação cadastral de aptidão espacial | SQL |
| `scripts/vps-publicar-cnes.sh` | Transporte atômico, nunca chamado pela carga | Bash + `COPY` streaming + SSH |
| `scripts/verificar.sh` | Guarda global de schema, linhagem, permissão e geometria | Bash + SQL |
| `docs/cnes.md` | Contrato da fonte, campos, cadência e limitações | Markdown |

## Decisões

### 1. DATASUS direto é a fonte canônica; geobr é só conferência

**Escolha:** carregar o CSV nacional oficial do CNES. Não reconstruir a base a partir do
PMTiles nem depender do GeoParquet do geobr.

**Motivo:** o tile perdeu atributos e linhagem; o geobr atualiza em fotografias trimestrais,
enquanto a URL oficial recebe atualização diária. Rodar mensalmente o artefato oficial é
simples e preserva a cadência decidida.

**Consequência:** os 18 ativos sem coordenada válida permanecem no cadastro com `geom IS
NULL`. O sistema não inventa coordenada para fechar 100%.

### 2. A tabela guarda todos os registros; as views definem consumo

**Escolha:** `infraestrutura.estabelecimento_saude` preserva ativos e desativados da fonte.
A view `estabelecimento_saude_ativo` aplica `ativo`; a view
`estabelecimento_saude_analisavel` acrescenta a qualidade espacial.

**Motivo:** apagar desativados impede auditoria da contagem da fonte e torna impossível
explicar por que um código sumiu. Misturar os dois em consultas futuras reproduziria o erro
da camada histórica, que continha todos os 615 mil registros do geobr sem filtro de situação.

### 3. “Ativo” vem de `CO_MOTIVO_DESAB`, não do nome ou do tipo

**Escolha:** `ativo = nullif(trim(CO_MOTIVO_DESAB), '') IS NULL`.

**Motivo:** é o único campo de desativação no artefato inspecionado. `TP_UNIDADE`, nome e
vínculo SUS classificam o estabelecimento, mas não sua situação.

**Guarda:** a carga registra contagens por motivo e recusa se a coluna desaparecer ou se a
proporção de ativos cair abaixo de 50% ou subir acima de 95%; isso detecta mudança de
semântica sem congelar a contagem de uma edição.

### 4. Código municipal sai por join; não se fabrica dígito verificador

**Escolha:** `CO_IBGE` tem seis dígitos. O código de sete dígitos é obtido por
`JOIN ibge.municipio m ON left(m.cod_municipio, 6) = trim(raw.co_ibge)`.

**Motivo:** concatenar ou calcular um dígito fora da tabela territorial cria uma segunda
regra de código. Registro sem município correspondente é preservado com código nulo e
contado; qualquer órfão ativo reprova a publicação.

### 5. Geometria e aptidão territorial são coisas distintas

**Escolha:** criar ponto somente quando latitude e longitude forem numéricas e estiverem no
envelope `(-74, -34, -28, 6)`; usar `geometry(Point, 4674)`. Depois, marcar
`geom_no_municipio` com `ST_Covers(ibge.municipio.geom, geom)`.

`apta_analise_territorial` exige: ativo, geometria válida/não vazia e ponto coberto pelo
município declarado. A view analisável filtra por essa coluna.

**Motivo:** ponto válido no mundo pode estar no município errado e gerar exatamente o
sintoma observado — equipamento aparecendo em região onde não existe. O dado ruim não é
apagado: permanece auditável, mas não entra silenciosamente em contagem local.

### 6. Hash decide idempotência; contagem não

**Escolha:** baixar sempre para `*.novo`, calcular SHA-256 e comparar com o hash embutido em
`meta.fonte.versao`. Hash igual encerra com sucesso e a mensagem `sem mudança`. Hash novo
segue para staging. O arquivo vigente só substitui o cache depois da validação.

**Formato da versão:** `snapshot=YYYY-MM-DD; sha256=<64 hex>`; `data_publicacao` recebe o
`Last-Modified` HTTP quando disponível.

**Motivo:** a URL e o nome do arquivo são estáveis; o DATASUS pode republicar o mesmo dia
com igual contagem e conteúdo corrigido.

### 7. A carga e a publicação são atos separados

**Escolha:** o job termina no Postgres local/lab. `scripts/vps-publicar-cnes.sh` aceita
`--ensaio`, usa staging remoto e troca dado + `meta.fonte` numa transação. O BUILD só roda
o ensaio; não abre SSH de escrita nem publica.

### 8. Cadência é mensal, sem serviço novo no repositório

**Escolha:** o comando agendável é `./cargas/datasus_cnes.sh`; recomendação operacional:
primeiro sábado do mês, 04:00, `America/Sao_Paulo`. A instalação de cron/systemd fica fora
do BUILD, porque pertence ao host escolhido e é ato de infraestrutura/produção.

## Contrato de dados

### `infraestrutura.estabelecimento_saude`

| Coluna | Tipo | Regra |
|--------|------|-------|
| `cod_cnes` | `char(7)` PK | `lpad(trim(co_cnes), 7, '0')` |
| `cod_unidade` | `char(13)` | Valor publicado |
| `cod_municipio` | `char(7)` nullable | Join com `ibge.municipio` |
| `razao_social` | `text` | `NO_RAZAO_SOCIAL` |
| `nome_fantasia` | `text` nullable | `NO_FANTASIA` |
| `tipo_unidade` | `integer` | `TP_UNIDADE` |
| `cod_natureza_organizacao` | `text` nullable | Código preservado como texto |
| `natureza_organizacao` | `text` nullable | Descrição da fonte |
| `cod_natureza_juridica` | `text` nullable | `CO_NATUREZA_JUR` |
| `tipo_gestao` | `text` nullable | `TP_GESTAO` |
| `esfera_administrativa` | `text` nullable | Descrição publicada |
| `ambulatorial_sus` | `boolean` nullable | Derivado apenas de `CO_AMBULATORIAL_SUS` |
| `motivo_desativacao` | `text` nullable | `CO_MOTIVO_DESAB` |
| `ativo` | `boolean NOT NULL` | Motivo de desativação vazio |
| `latitude_fonte` / `longitude_fonte` | `double precision` nullable | Valor parseado, mesmo se rejeitado para geom |
| `geom` | `geometry(Point,4674)` nullable | Só coordenada dentro do envelope |
| `motivo_sem_geom` | `text` nullable | `ausente`, `nao_numerica`, `fora_do_brasil` |
| `geom_no_municipio` | `boolean` nullable | `NULL` sem geom/município; senão `ST_Covers` |
| `apta_analise_territorial` | `boolean NOT NULL` | Regra da Decisão 5 |
| `snapshot_fonte` | `date NOT NULL` | Data HTTP/execução que identifica o retrato |

Índices: PK em `cod_cnes`; B-tree em `cod_municipio`, `tipo_unidade`, `ativo`;
GiST em `geom`; GiST funcional em `(geom::geography)` para distância em metros.

### Views

```sql
CREATE VIEW infraestrutura.estabelecimento_saude_ativo AS
SELECT * FROM infraestrutura.estabelecimento_saude WHERE ativo;

CREATE VIEW infraestrutura.estabelecimento_saude_analisavel AS
SELECT * FROM infraestrutura.estabelecimento_saude
WHERE ativo AND apta_analise_territorial;
```

Nenhuma view substitui o CNEFE nesta feature.

## Manifesto de arquivos

| # | Arquivo | Ação | Finalidade | Responsável | Dependências |
|---|---------|------|------------|-------------|--------------|
| 1 | `../servidor-dados-gis/cargas/datasus_cnes.sh` | Criar | Job completo de ingestão e publicação local | harness de build | `_comum.sh`, PostGIS |
| 2 | `../servidor-dados-gis/scripts/vps-publicar-cnes.sh` | Criar | Transporte atômico com `--ensaio` | harness de build | 1 |
| 3 | `../servidor-dados-gis/scripts/verificar.sh` | Modificar | Incluir `infraestrutura` e invariantes CNES | harness de build | 1 |
| 4 | `../servidor-dados-gis/docs/cnes.md` | Criar | Fonte, schema, qualidade e operação | harness de build | 1 |
| 5 | `../servidor-dados-gis/README.md` | Modificar | Inventário e comando da carga | harness de build | 1, 4 |

**Total:** 5 arquivos. Nenhum arquivo em `geo-analytics`, além dos artefatos SDD.

## Padrões de implementação

### Download atualizável

```bash
novo="${ZIP}.novo"
curl -fsSL --retry 3 -o "$novo" "$URL"
hash="$(shasum -a 256 "$novo" | awk '{print $1}')"
# Comparar com meta.fonte; só seguir se mudou. Nunca sobrescrever o cache antes de validar.
```

No Linux sem `shasum`, usar `sha256sum`; a seleção deve ser por capacidade (`command -v`),
como `descompactar()` e `espaco_livre_gb()` já fazem.

### Staging sem coerção precoce

As 36 colunas entram como `text`. Toda conversão usa `nullif(trim(...), '')` e regex antes
do cast. Cabeçalho ausente, coluna renomeada ou contagem zero interrompe antes da transação.

### Troca atômica

```sql
BEGIN;
CREATE TEMP TABLE estabelecimento_saude_novo ON COMMIT DROP AS ...;
-- DO $$ com todas as invariantes contra a tabela temporária
CREATE TABLE IF NOT EXISTS infraestrutura.estabelecimento_saude
    (LIKE estabelecimento_saude_novo INCLUDING ALL);
TRUNCATE infraestrutura.estabelecimento_saude;
INSERT INTO infraestrutura.estabelecimento_saude
SELECT * FROM estabelecimento_saude_novo;
-- recriar/garantir constraints, índices, views, comentários, grants e meta.fonte
COMMIT;
```

Staging é removido só após sucesso. Em falha, permanece para diagnóstico; o início da
próxima execução o recria.

## Fluxo operacional

```text
1. Exigir PostGIS e espaço livre (mínimo 2 GB)
2. Baixar ZIP para .novo e calcular SHA-256
3. Se hash vigente: sair 0, sem mudança
4. Conferir nome do CSV e cabeçalho de 36 campos
5. COPY para staging, todas as colunas text
6. Medir fonte: total, chave, status, coordenada e municípios
7. Montar tabela temporária normalizada
8. Validar e trocar tabela + views + linhagem numa transação
9. ANALYZE e validar como geo_reader
10. Mover .novo para o cache somente após sucesso
```

## Estratégia de testes

| Tipo | Evidência exigida no BUILD |
|------|-----------------------------|
| Estático | `bash -n` nos dois scripts; `shellcheck` se disponível |
| Fonte real | Carga completa do ZIP oficial; registrar hash e medições |
| Chave | Zero `cod_cnes` vazio/duplicado; total publicado = total do staging |
| Situação | Ativos + desativados = total; view ativa = flag `ativo` |
| Espacial | SRID 4674; zero geom inválida/vazia/fora do envelope; sem ponto preservado |
| Município | Zero órfão ativo; medir e registrar pontos fora do município declarado |
| Atomicidade | Injetar falha antes do `TRUNCATE` e provar que hash/contagem anterior não mudam |
| Idempotência | Segunda execução com mesmo ZIP informa `sem mudança` e não altera `data_carga` |
| Permissão | `geo_reader` lê tabela/views e não escreve |
| Transporte | Rodar somente `scripts/vps-publicar-cnes.sh --ensaio` |
| Regressão | `./scripts/verificar.sh --profundo` |

Contagens de 2026-09-18 são observação, não assert fixo. As invariantes são proporção,
fechamento, unicidade e domínio; atualização legítima pode mudar o número de linhas.

## Tratamento de erros

| Falha | Comportamento |
|-------|--------------|
| HTTP/ZIP inválido | Repetir download até 3 vezes; manter versão publicada |
| Hash igual | Sair 0 com `sem mudança` |
| Schema mudou | Abortar nomeando colunas faltantes/sobrando |
| Código CNES vazio/duplicado | Abortar antes da troca |
| Coordenada ruim | Preservar registro, `geom NULL`, contabilizar motivo |
| Município órfão ativo | Abortar; indica versão territorial incompatível ou fonte corrompida |
| Muitos pontos fora do município | Abortar acima de 2%; abaixo disso publicar com flag e métrica |
| Falha de COPY/transação | Rollback; tabela vigente intacta; staging disponível |
| Publicação remota parcial | Staging remoto + transação impedem tabela vazia |

## Configuração

| Chave | Padrão | Uso |
|-------|--------|-----|
| `CNES_URL` | URL oficial medida acima | Override controlado da fonte |
| `CNES_FORCAR` | `0` | Reprocessar hash idêntico apenas em diagnóstico |
| `VPS_HOST` | `hetzner-gramos` | Só no publicador separado |
| `REMOTO_CT` | `geodata-postgis` | Só no publicador separado |

## Observabilidade

Cada execução imprime uma linha final com: hash, snapshot, total, ativos, desativados,
com/sem geometria, fora do município e duração. A mesma síntese, sem duração, entra em
`meta.fonte.observacao`. Exit codes: `0` sucesso/sem mudança; `1` fonte ou integridade;
`2` configuração/ambiente.

## Handoff para o harness de BUILD

1. Trabalhar apenas em `../servidor-dados-gis`.
2. Não tocar `query/`, `pipeline/`, catálogo web, PMTiles nem Raio-X.
3. Implementar os cinco arquivos do manifesto, nessa ordem.
4. Rodar a carga real local, todos os testes acima e o publicador apenas com `--ensaio`.
5. Parar com a aplicação sem mudança e sem produção; validação visual não se aplica até a
   rodada futura de consumo/mapa.

## Histórico de revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-18 | Codex | Desenho inicial, fechado contra o CSV nacional real |
| 1.1 | 2026-09-18 | Cursor | Status Complete após build local; produção intocada |
| 1.2 | 2026-09-18 | Cursor | Shipped and archived |

## Próximo passo

**✅ SHIPPED**
