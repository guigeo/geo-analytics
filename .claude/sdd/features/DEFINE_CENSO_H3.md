# DEFINE: CENSO_H3

> O Censo sai do setor censitário e entra numa malha homogênea de hexágonos — a primeira
> camada do sistema cuja geometria não é herdada de recorte administrativo nenhum

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | CENSO_H3 |
| **Data** | 2026-09-05 |
| **Autor** | define (sessão Claude Code) |
| **Status** | Ready for Design |
| **Clarity Score** | 14/15 |
| **Origem** | Conversa medida em 2026-09-05 (piloto no scratchpad, não commitado) |
| **Pré-requisito** | ⏳ Emenda ao ADR-0001 (`webgis`) — sai junto com a feature, não depois |
| **Repositório do código** | `../servidor-dados-gis` — esta feature quase não toca este repo |

---

## Problema

Toda variável do sistema hoje mora num recorte administrativo: setor, bairro, distrito,
município. Isso tem dois custos que só aparecem quando se tenta acrescentar informação nova.

**O primeiro é de junção.** Cada fonte nova chega no recorte dela — o Censo vem por setor,
o zoneamento vem por lote, um cadastro de endereços vem por ponto. Cruzar duas delas exige
uma decisão geométrica caso a caso, e o resultado não se compara com o cruzamento seguinte.

**O segundo é de comparabilidade.** Setor censitário não tem tamanho: o mediano urbano da
Grande São Paulo tem 0,0275 km² e o rural mediano tem 1,60 km² — 58 vezes maior. Densidade,
score e ranking calculados sobre unidades de tamanhos tão diferentes comparam coisas
diferentes, e o mapa não avisa.

Uma malha H3 resolve os dois: a mesma célula recebe qualquer fonte, e todas as células têm
o mesmo tamanho. Esta feature constrói a malha e coloca dentro dela o dado que o sistema já
tem — o Censo — porque a malha só se prova com dado cujo total se conhece.

---

## Usuários

| Usuário | Papel | Dor |
|---------|-------|-----|
| **Guilherme** | Dono do produto | Quer acrescentar variáveis de score (fluxo, atividade econômica) e não tem onde colocá-las que sirva a todas as fontes |
| **Features seguintes** | Camada no mapa, tool do agente, score composto | Cada uma teria de inventar a própria unidade de agregação |
| **Cliente 1 e 2** | Análise territorial | Indireto: nada muda para eles nesta feature — ela é o cano, não a água |

---

## Objetivos

| Prioridade | Objetivo |
|------------|----------|
| **MUST** | Tabela `indicadores.censo_h3_r9` no `geodata`, por script re-executável |
| **MUST** | As 38 variáveis somáveis do `censo_nomes.tsv` rateadas por área, com fechamento exato |
| **MUST** | `media_moradores` e `renda_media` reconstruídas do denominador, nunca rateadas |
| **MUST** | `fator_desagregacao` e `setores_na_celula` em toda linha — a procedência é dado |
| **MUST** | Linhagem em `meta.fonte` e `SELECT` para `geo_reader`, como toda camada publicada |
| **MUST** | Emenda ao ADR-0001: dado re-agregado em malha estatística é estimativa |
| **SHOULD** | O recorte ser um parâmetro do script, não uma constante — o Brasil é o mesmo código |
| **COULD** | Índice por prefixo que torne barata a leitura em res 8 e res 7 |

---

## Critérios de sucesso

- [ ] **Fechamento exato**: para cada uma das 38 variáveis, a soma das células é igual à
      soma dos setores de origem, com erro relativo abaixo de 1e-6 (o piloto deu 0,000000%)
- [ ] **68.448 células** para a concentração urbana São Paulo/SP (37 municípios, 7.154 km²),
      com 47.083 setores lidos e **zero** setores sem célula
- [ ] **Tempo de carga abaixo de 5 minutos** para o recorte de São Paulo (piloto: 16 s de
      cálculo; a margem cobre leitura, escrita, índice e `ANALYZE`)
- [ ] **`fator_desagregacao` coerente**: nenhuma célula com fator abaixo de 1,0; a
      distribuição reproduz o piloto (93,5% da população em células de fator ≤1,5×)
- [ ] **Idempotência**: rodar a carga duas vezes seguidas produz a mesma contagem de linhas
      e os mesmos totais

---

## Testes de aceite

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| AT-001 | Fechamento | A carga terminou | Somo `pop_total` de todas as células e dos setores do recorte | Os dois totais são iguais dentro de 1e-6 |
| AT-002 | Assinatura da presunção | A carga terminou | Procuro células **vizinhas** com valor idêntico de `pop_total` | Toda ocorrência tem `fator_desagregacao > 1` — valor repetido só existe onde houve densidade presumida |
| AT-003 | Média não se rateia | Uma célula recebeu setores de rendas médias diferentes | Comparo `renda_media` da célula com a média ponderada por área | Os valores diferem, e o gravado é o ponderado por `renda_responsaveis` |
| AT-004 | Mediana não existe | A tabela foi criada | Procuro a coluna `renda_mediana` | Ela não existe, e o comentário do schema explica por quê |
| AT-005 | Célula íntegra | A carga terminou | Procuro célula com `pop_total > 0` e `setores_na_celula = 0` | Nenhuma linha retorna |
| AT-006 | Re-execução | A carga já rodou uma vez | Rodo de novo sem mudar nada | Mesma contagem de linhas, mesmos totais, sem duplicata |
| AT-007 | Contrato do banco | A carga terminou | Consulto como `geo_reader` e leio `meta.fonte` | A leitura funciona e a linhagem registra fonte, versão, script e o recorte carregado |
| AT-008 | Interrupção | A carga é interrompida no meio | Consulto a tabela | Ou o estado anterior inteiro, ou o novo inteiro — a publicação acontece em transação |

---

## Fora de escopo

- **Camada no mapa.** Sem PMTiles, sem `catalogo.ts`, sem tile publicado. O front não sabe
  que esta tabela existe.
- **Tool do agente.** O chat não responde sobre hexágono nesta feature.
- **Brasil inteiro.** Só a concentração urbana São Paulo/SP. O recorte é parâmetro; o
  gatilho do nacional é disco na VPS, e ele está em 3,9 GB livres.
- **Resoluções 8 e 7 materializadas.** A hierarquia do H3 é prefixo — derivam na leitura.
- **`renda_mediana`.** Mediana não se agrega sem microdado. Fica no setor, onde é verdade.
- **Variáveis novas.** Fluxo de pessoas, CNEFE, CNPJ, POIs: nada disso entra agora. A malha
  existe justamente para recebê-las depois.
- **Endurecer o `geodata`.** O `CONNECT` a `PUBLIC` continua como está; não é assunto de
  feature de dado.

---

## Restrições

| Tipo | Restrição | Impacto |
|------|-----------|---------|
| Arquitetural | Dado estimado mora em `indicadores`, nunca em `ibge*` (regra 9 do ADR-0001) | O nome do schema não é escolha de estilo; é a regra que separa o publicado do calculado |
| Arquitetural | Toda carga do `servidor-dados-gis` tem de ser re-executável | Sem passo manual, sem SQL avulso, sem QGIS |
| Infra | O `geodata` roda na VPS: 3,9 GB livres de 38 GB, 3,7 GB de RAM | Decide o recorte. São Paulo custa ~11 MB; o Brasil em res 8 custaria ~2 GB e não cabe hoje |
| Técnica | O H3 é calculado em **Python na carga**, não por extensão do Postgres | Instalar `h3-pg` mudaria a imagem do banco em produção — custo alto para benefício nenhum aqui |
| Técnica | A geometria da célula **não** é armazenada | A fronteira é função pura do índice; guardá-la é guardar cache (regra 6 do ADR) |
| Fonte | O IBGE não publica a contagem de responsáveis **com** rendimento | `renda_media` é aproximação por definição, não por descuido — e tem de sair marcada |

---

## Contexto técnico

| Aspecto | Valor | Notas |
|---------|-------|-------|
| **Local de entrega** | `../servidor-dados-gis/cargas/` | Script de carga + auxiliar Python; esta feature quase não toca o `geo-analytics` |
| **Domínios de KB** | `geospatial-etl` | Rateio areal, idempotência de carga, validação contra a fonte |
| **Impacto de infra** | Nenhum | Tabela nova em banco existente; sem serviço, sem porta, sem deploy |

---

## Suposições

| ID | Suposição | Se estiver errada | Validada? |
|----|-----------|-------------------|-----------|
| A-001 | Peso por área em graus² é peso relativo suficiente dentro de um setor | O rateio distorce com a latitude | ✅ Piloto: desvio de 25 pessoas em 20,7 milhões (0,0001%), e a normalização por setor o zera |
| A-002 | Res 9 é a resolução certa para o Brasil urbano | A malha mente ou perde detalhe | ✅ Medido: res 10 desagregaria 78,1% da população; res 8, 1,5%; res 9, 9,6% pelo critério de área |
| A-003 | A cobertura por `contain="overlap"` pega todo setor | Setor pequeno sumiria da malha | ✅ Piloto: 0 setores sem célula em 47.083 |
| A-004 | A proporção de responsáveis **com** rendimento é parecida entre setores da mesma célula | `renda_media` fica enviesada onde a proporção varia muito | ❌ **Não é validável** — o IBGE não publica o denominador. Por isso a coluna sai marcada como aproximação |
| A-005 | O custo escala linear: 473k setores ≈ 3 min | O nacional exige processamento por partes | ⏳ Não medido — só importa quando o recorte nacional entrar |

---

## Clarity Score

| Elemento | Nota | Por quê |
|----------|------|---------|
| Problema | 3 | Nomeado com número: 58× de diferença entre setor urbano e rural mediano |
| Usuários | 2 | Feature de infraestrutura — o usuário final não toca nela, e isso é honesto declarar |
| Objetivos | 3 | Oito objetivos, cada um verificável |
| Sucesso | 3 | Todos com número, e todos já medidos uma vez no piloto |
| Escopo | 3 | O que fica de fora é maior que o que entra, e está nomeado |
| **Total** | **14/15** | |

---

## Questões em aberto

1. **Quando o recorte vira nacional?** O gatilho é disco na VPS, não decisão de produto.
   Fica registrado aqui para não virar surpresa: em res 8 o Brasil são ~11,5 milhões de
   células, ~2 GB, e hoje há 3,9 GB livres.
2. **As variâncias do IBGE (`V06003`, `V06005`) entram na curadoria?** Elas permitiriam
   dizer o quanto a renda **varia** dentro da célula — provavelmente a variável de score
   mais barata que existe. Fora desta feature; vale um `/brainstorm` próprio.

---

## Histórico

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-05 | define (Claude Code) | Versão inicial, a partir do piloto medido na mesma sessão |

---

## Próximo passo

**Pronto para:** `/design .claude/sdd/features/DEFINE_CENSO_H3.md`
