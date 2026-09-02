# BRAINSTORM: DESENHO_NO_MAPA

> Exploração antes de capturar requisitos — o cliente desenha no mapa e guarda o que
> desenhou, pela primeira vez com dado próprio dentro da aplicação.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | DESENHO_NO_MAPA |
| **Data** | 2026-08-31 |
| **Autor** | sessão `/brainstorm` com o Guilherme |
| **Status** | Pronto para `/define` |
| **Repositórios tocados** | `geo-analytics` (código), `webgis` (emendas no ADR-0001), `servidor-dados-gis` (banco novo) |

---

## Ideia inicial

**Pedido bruto (do Guilherme):** feature *core*, para todos os clientes, de desenho de
polígonos — cada cliente desenha e guarda "no lugar dele", com controle de acesso para os
dados não se misturarem. Junto: campos digitáveis pelo cliente (nome, rótulo), uma
ferramenta de *buffer* (clica num ponto, digita o raio em metros, sai um círculo) e uma
ferramenta de ponto. Pergunta explícita: **isso são features separadas?**

### Contexto lido antes de propor

Esta é uma feature que a arquitetura **já esperava**. Três achados do ADR-0001 do `webgis`
mudaram o desenho antes da primeira pergunta:

1. **A §8 nomeia esta feature como o gatilho de reabrir a decisão de login.** O texto diz
   que usuário/sessão fica fora do escopo até existir "dado do usuário para guardar", e o
   exemplo literal é *"o polígono que ele desenha"*. Ver a decisão 1 abaixo: o gatilho
   **não** disparou, porque o isolamento pedido é por cliente, não por pessoa.
2. **Isto é casca, não configuração.** A emenda de 2026-08-31 à regra 1 e a emenda da §10
   dizem que ferramenta de mapa (medir, desenhar, recortar, aproximar) serve todo cliente e
   não vira chave do `configuracao/esquema.ts`. O precedente é a medição de distância/área,
   que entrou sem alterar uma linha do esquema. O critério da regra 1: *existe cliente
   plausível que queira isto desligado?* Não existe.
3. **Onde o dado do cliente mora já estava decidido** pela regra 4 — schema por cliente,
   papel próprio, `SELECT` no `ibge` compartilhado —, mas colide com a regra 5 (banco
   central reconstruível). A decisão 5 abaixo resolve a colisão sem emendar nenhuma das duas.

### Contexto técnico observado (para o `/define`)

| Aspecto | Observação | Implicação |
|---------|------------|------------|
| Frontend | `web/src/map/medicao.ts` é o precedente exato: cálculo geodésico fora do React e do MapLibre, testável sem navegador | O desenho segue o mesmo corte — geometria e validação em módulo puro, `MapView.tsx` só monta e trata clique |
| Frontend | `map/highlight.ts` pinta por `setFilter` em fonte PMTiles; `map/selection.ts` pinta por fonte GeoJSON | O desenho do cliente **não** é tile: é fonte GeoJSON, como a seleção. Nada vai para o host de tiles |
| Backend | `query/db.py` declara em prosa que a fachada **nunca escreve, nem DDL** (regra 4 do `servidor-dados-gis`) | A escrita **não** entra no `query/`. Fachada nova, papel novo, conexão nova |
| Backend | `agent/cliente.py` já é a fronteira de cliente (`CLIENTE`, `.env` por cliente, persona em TOML) | A API de escrita mora no agente e herda a fronteira pronta |
| Backend | `agent/tools.py` tem 15 tools com args Pydantic e `TOOL_REGISTRY`; grounding vem das rows | A tool nova segue o padrão; os avisos de borda saem como **dado da row** (regra 8) |
| Deploy | `deploy/clientes/<id>.env` já dá domínio, caminho, unit, porta e portão por cliente | Nada de novo no mecanismo de deploy; entra variável de DSN da aplicação |
| Infra | VPS com **3,9 GB livres de 38 GB** (medido 2026-08-31) | Banco de desenhos é pequeno (KB por polígono); não é o gargalo. O eixo de ruas nacional continua barrado, isto não |
| KBs | `.claude/kb/maplibre`, `geospatial-etl` | Consultar antes do `/design` |

---

## Perguntas de descoberta

| # | Pergunta | Resposta | Impacto |
|---|----------|----------|---------|
| 1 | "Guardar no lugar dele" separa por **cliente** ou por **pessoa**? | **Por cliente, sem login** | Decisivo. O gatilho da §8 do ADR **não** dispara: sem login, sem sessão, sem tabela de usuários. O isolamento já existe de graça (processo, `.env` e portão por cliente) e ganha uma trava no banco |
| 2 | Que campos o cliente preenche? | **Fixos + categoria como texto livre** com autocomplete do que já existe naquele cliente | Categoria nova não exige deploy nem editar código. Mantém a feature como casca — mesmo formulário para todos — e o vocabulário de cada cliente nasce do uso |
| 3 | O agente de IA enxerga os desenhos? | **Sim, desde o MVP** | Cumpre a regra 7 do ADR (camada e nível andam juntos). Muda a natureza da feature: de bloco de notas geográfico para análise territorial |
| 4 | Existe amostra/ground truth? | Não há áreas da EB Prime disponíveis; **importar KML sai do escopo** — as áreas entrarão por carga administrativa, fora da aplicação | Duas consequências: a tabela nasce com dois produtores previstos, e a validação usa o próprio banco como gabarito (ver "Inventário de amostras") |
| 5 | Setor cortado ao meio pela área desenhada — conta o quê? | **Rateio areal + aviso na row** | A decisão mais importante e a menos visível. Vira aplicação da regra 8 do ADR |
| 6 | Uma feature ou três? Editar geometria salva entra? | **Uma feature, quatro fases**; editar geometria fica fora do MVP | Ver "Abordagens exploradas" |
| 7 | Onde mora o dado, e onde mora a API? | **Banco separado com schema por cliente**; API **no agente** | Resolve regra 4 × regra 5 sem emenda de conflito; a API custa uma emenda na §9 |

---

## Inventário de amostras

| Tipo | Local | Qtd. | Notas |
|------|-------|------|-------|
| Áreas reais do cliente | — | 0 | A EB Prime tem áreas em KML, mas não disponíveis nesta sessão. **Não** viram feature de importação |
| Gabarito (ground truth) | o próprio `geodata` | ilimitado | Ver abaixo — o banco é o gabarito de si mesmo |
| Código de referência | `web/src/map/medicao.ts`, `map/selection.ts`, `agent/tools.py` | 3 | Padrões a reusar: cálculo geodésico puro, fonte GeoJSON no mapa, tool com args Pydantic |

**Como validar o cruzamento espacial sem ter dado de cliente** — a descoberta que destrava o teste:

> Toma-se a geometria de um **município** (ou bairro) direto do `geodata`, injeta-se como se
> fosse um polígono desenhado, e compara-se a resposta da tool nova com a resposta que a tool
> **já existente** dá para aquele município. Os dois números têm de bater.

O banco é o próprio gabarito: autocontido, reproduzível como teste automatizado, e não depende
de a EB Prime mandar nada. Cobre o caso de bordas coincidentes.

Para o caso de **borda cortada** — que o teste acima não cobre — o critério é diferente e vale
declarar no `/define`: um retângulo pequeno inteiramente dentro de um único setor tem de
devolver uma fração conhecida da população dele, e a soma de duas metades complementares tem
de reconstituir o total do setor.

---

## Abordagens exploradas

### Abordagem A: uma feature, quatro fases ⭐ Recomendada e escolhida

**Descrição:** um só ciclo SDD, entregue em quatro fases. As três ferramentas são **modos de
desenho** da mesma feature, porque compartilham tudo o que é caro e diferem só em como a
geometria nasce:

```text
ponto     →  1 clique                    →  Point
polígono  →  N cliques + fechar          →  Polygon
buffer    →  1 clique + raio em metros   →  Polygon    (= ponto + um campo)
```

| Fase | Entrega | Por que nesta ordem |
|------|---------|---------------------|
| 1 | Alicerce + **ponto** | O ponto exercita o caminho inteiro — desenhar, preencher, salvar, listar, editar atributo, apagar — com a menor superfície de interação. É o que prova a arquitetura antes de investir nela |
| 2 | **Polígono** | O pedido principal. Reusa tudo da fase 1; o que é novo é encerrar o traçado e validar geometria (auto-interseção, polígono degenerado) |
| 3 | **Buffer** | Ponto + raio, sobre `ST_Buffer` em `geography`. Barato depois da fase 1 |
| 4 | **O agente enxerga** | Tool de cruzamento com rateio areal e avisos na row |

**Prós:**
- ~85% do trabalho (schema, papel, fachada, API, painel, formulário, renderização, tool) é
  comum às três ferramentas e se escreve uma vez.
- Cada fase entrega algo usável; a fase 1 valida a arquitetura com o menor risco.
- A ordem coincide com a do risco decrescente: o que pode dar errado no desenho aparece na
  fase 1, quando ainda é barato mudar.

**Contras:**
- A primeira entrega útil de verdade (polígono) só chega na fase 2.
- Exige disciplina para as fases 3 e 4 não virarem "ideias em aberto" — o `CLAUDE.md` deste
  repositório já teve uma lista assim, revisada em 2026-08-31 por descrever o mundo de antes.

**Por que recomendada:** três features do SDD significariam três ciclos
`/define → /design → /build → /ship` para reaproveitar o mesmo schema, e o DESIGN da segunda
teria de refazer as decisões da primeira. Fatiar em fases é o mecanismo que o passo 5 do ADR
já usou (sete fases) e que funciona.

---

### Abordagem B: três features independentes

**Descrição:** `DESENHO_POLIGONO`, `FERRAMENTA_PONTO` e `FERRAMENTA_BUFFER`, cada uma com
ciclo próprio.

**Prós:**
- Cada uma arquiva sozinha e a primeira fecha mais cedo.
- Escopo por documento fica pequeno e legível.

**Contras:**
- Triplica o trabalho de infraestrutura ou obriga a primeira a "adivinhar" o que as outras
  duas vão precisar do schema — que é exatamente o erro que a §7 do ADR já recusou uma vez ao
  proibir extrair template com N=1.
- O buffer, isolado, é um documento inteiro para descrever "o modo ponto com um campo a mais".

**Rejeitada** por custo sem contrapartida.

---

### Abordagem C: só polígono no MVP

**Descrição:** corta ponto e buffer; entrega o desenho de área e o agente enxergando.

**Prós:**
- Menor entrega possível que resolve o problema original.

**Contras:**
- O ponto é a interação mais barata do conjunto e a que melhor valida o caminho completo;
  cortá-lo economiza pouco e perde o teste de fumaça da arquitetura.
- Buffer é pedido explícito e de uso comum em análise territorial (raio ao redor de uma antena,
  de uma loja).

**Rejeitada**, mas fica registrada como o plano B se a fase 1 revelar que o custo estourou.

---

## Abordagem escolhida

| Atributo | Valor |
|----------|-------|
| **Escolhida** | Abordagem A — uma feature, quatro fases |
| **Confirmação do usuário** | 2026-08-31, checkpoint 1 ("Fecha, segue assim") |
| **Raciocínio** | As três ferramentas compartilham a infraestrutura inteira; o que difere é só como a geometria nasce. Fases dão entrega incremental sem pagar três ciclos de SDD |

---

## Decisões tomadas

| # | Decisão | Razão | Alternativa rejeitada |
|---|---------|-------|-----------------------|
| 1 | **Isolamento por cliente, sem login.** Quem passa o portão de um cliente vê e edita tudo daquele cliente; ninguém registra quem desenhou | O isolamento já existe: processo, `.env`, DSN e portão por cliente. Custa zero e não reabre a §8 do ADR | Login com usuário/sessão (é produto novo); autoria anotada sem permissão por linha (exige login do mesmo jeito) |
| 2 | **Campos fixos + categoria como texto livre** com autocomplete do que já existe no cliente. Preenchidos: `nome` (obrigatório), `categoria`, `cor`, `observacao`. Automáticos: `id`, `tipo`, `geom`, área/raio calculado, `origem`, `criado_em`, `atualizado_em` | Categoria nova não exige editar código nem publicar. Mesmo formulário para todo cliente mantém a feature como casca | Lista fechada de categorias por cliente (categoria nova vira deploy, e contradiz "é casca"); campos livres em JSONB (é construtor de formulários, produto próprio) |
| 3 | **O agente enxerga os desenhos desde o MVP**, com tool nova de cruzamento | Regra 7 do ADR: camada na tela que o chat recusa é a assimetria que o usuário lê como defeito — foi o que aconteceu com bairro. A infraestrutura já existe (PostGIS dos dois lados) | Deixar para depois (exigiria emenda justificando a exceção à regra 7) |
| 4 | **Rateio areal na borda, com os avisos saindo da row da tool** — quantos setores entraram parciais e que fração da população veio de rateio | Regra 8 do ADR: o que muda o sentido do número é dado, não instrução de prompt. Ao LLM cabe reescrever o aviso com as palavras da resposta, não decidir se ele existe | Centroide dentro conta inteiro (simples, mas erra feio em área pequena); devolver piso e teto (honesto, mas empurra a incerteza para o usuário em toda resposta) |
| 5 | **Banco `app_clientes` separado, no mesmo servidor PostGIS, com schema e papel por cliente.** O papel do cliente 2 não enxerga o schema do cliente 1 | Satisfaz a regra 4 (schema e papel por cliente) **e** a regra 5 (o `geodata` segue reconstruível) sem emendar nenhuma. O cruzamento continua possível porque o polígono viaja como **parâmetro** da consulta — dezenas de vértices, não milhões — dispensando `postgres_fdw` | Schema dentro do próprio `geodata` (JOIN direto, mas recarregar o banco passa a apagar dado do cliente); um banco por cliente (isolamento máximo, custo de administração × N sem cliente que exija) |
| 6 | **A API de escrita mora no agente** (`/api/desenhos`) | É o único backend que existe, já é a fronteira de cliente e já está atrás do portão. Processo novo por cliente é o que a §10 marca para revisão acima de ~10 clientes | Serviço próprio separado do agente |
| 7 | **O `geodata` permanece só-leitura para a aplicação**; a fachada `query/` não ganha escrita | A promessa está escrita em prosa no `query/db.py` e é o que preserva a liberdade de recarregar o banco central | Acrescentar escrita ao `query/` |
| 8 | **A tabela nasce com dois produtores previstos** (coluna `origem`: `desenho` \| `carga`) | O Guilherme vai carregar as áreas KML da EB Prime por fora da aplicação. Prever a coluna custa nada agora; não prever transforma a carga em migração depois | Tabela só para desenho (obrigaria migração) |

### Decisões que **não** se resolvem nesta feature

Conforme a regra do `CLAUDE.md` — decisão que muda o que outro repositório faz vira emenda no
ADR-0001 do `webgis`, não nota na sessão da feature:

| # | Pendência | Onde se resolve |
|---|-----------|-----------------|
| A | **A queda do agente passa a derrubar também os desenhos.** A §9 do ADR registra hoje que "a queda degrada o chat, nunca o site" — a propriedade muda de forma | Emenda à §9 do ADR-0001 (`webgis`) |
| B | **A senha do portão muda de natureza.** Hoje protege a conta da OpenAI (custo); depois disto protege o dado do cliente. O ADR registra que a senha do cliente 2 já se perdeu uma vez, e a §8 deixa em aberto "onde a credencial de cliente deve morar" | Emenda à §8 do ADR-0001 (`webgis`) |
| C | **Banco novo no servidor PostGIS**: criação de `app_clientes`, schemas, papéis e grants, e a rotina de backup dele — que é o primeiro dado do sistema que **não** se refaz por script | `servidor-dados-gis` (dono do banco), referenciado pela emenda à regra 4/5 |
| D | **Confirmar a leitura da regra 4.** Ela diz "schema por cliente" e a decisão 5 põe esses schemas em outro banco. É compatível com a letra e com o espírito, mas merece uma linha explícita no ADR para não ser redescoberto | Emenda à regra 4 do ADR-0001 |

---

## Funcionalidades removidas (YAGNI)

| Sugerida | Razão da remoção | Dá para acrescentar depois? |
|----------|------------------|------------------------------|
| Importar KML/KMZ/shapefile **pela aplicação** | Decisão do Guilherme: prefere que as pessoas desenhem. As áreas existentes entram por carga administrativa, fora do app | Sim — a coluna `origem` já deixa o caminho aberto |
| Login, usuário, sessão, papéis | Isolamento por cliente basta (decisão 1). Manteria o gatilho da §8 do ADR fechado | Sim — e o ADR já descreve o que dispara |
| Campos configuráveis por cliente (JSONB / construtor de formulários) | É produto próprio, não ferramenta de mapa. E o agente deixaria de saber o que ler | Sim, se um cliente pagar por isso |
| Categoria como lista fechada por cliente | Categoria nova viraria edição de código + build + deploy, e contradiz "a ferramenta é casca" | Sim |
| **Editar a geometria depois de salva** (arrastar vértice) | Handles de vértice, undo e validação contínua são a parte mais delicada da interface. No MVP: edita-se atributo; para mudar o traçado, apaga e redesenha | Sim — e é a primeira candidata a voltar. **Foi apresentada ao usuário como o corte mais contestável e ele manteve o corte** |
| Desenhar linha/rota | Não pedido | Sim |
| Exportar os desenhos (GeoJSON/KML) | Não pedido. Barato depois | Sim |
| Histórico/versões do desenho | Não pedido, e multiplica o schema | Sim |
| Compartilhar desenho entre clientes | Contradiz o isolamento pedido | Não sem repensar a decisão 1 |

**O que fica, por ser barato e por a falta doer imediatamente:**
- Desfazer o último vértice durante o traçado (sem isso, um clique errado obriga recomeçar).
- A camada de desenhos ligável/desligável no painel de camadas.
- Apagar um desenho com confirmação.

---

## Validações incrementais

| Seção | Apresentada | Retorno do usuário | Ajustado? |
|-------|-------------|--------------------|-----------|
| Achados do ADR (esta feature é o gatilho da §8; é casca, não configuração) | ✅ | Aceito sem contestação | Não |
| Isolamento e campos | ✅ | Por cliente, sem login; fixos + categoria livre | Não |
| Escopo, amostras e importação de KML | ✅ | **Ajuste do usuário:** importar KML sai do escopo; as áreas entram por carga fora do app. Levantou que não há polígono de teste disponível | **Sim** — nasceu a decisão 8 (coluna `origem`) e a estratégia de gabarito pelo próprio `geodata` |
| Checkpoint 1 — uma feature em 4 fases + cortes YAGNI | ✅ | "Fecha, segue assim" — inclusive mantendo o corte de editar geometria | Não |
| Checkpoint 2 — banco, papéis e onde mora a API | ✅ | Banco separado com schema por cliente; API no agente | Não |

---

## Requisitos sugeridos para o `/define`

### Declaração do problema (rascunho)

O cliente consegue *ver* dados geográficos e *perguntar* sobre eles, mas não consegue registrar
os territórios que **ele mesmo** define — a área de atuação, o raio de uma unidade, o ponto de
interesse —, nem cruzar esses territórios com o Censo. Todo dado da aplicação hoje é universal
e de terceiros; nada é do cliente.

### Usuários-alvo (rascunho)

| Usuário | Dor |
|---------|-----|
| Cliente 2 (EB Prime), pelo app dele | Tem áreas de atuação que só existem em arquivo, fora de qualquer ferramenta, e não consegue perguntar nada sobre elas |
| Guilherme, no app da casa | Precisa delimitar recortes ad hoc para analisar e hoje não tem onde guardá-los |
| Guilherme, como operador | Precisa carregar as áreas do cliente por fora, sem que isso vire feature da aplicação |

### Critérios de sucesso (rascunho)

- [ ] Desenhar ponto, polígono e buffer (raio em metros) e salvar com nome, categoria, cor e observação.
- [ ] O desenho persiste entre sessões e entre navegadores, e reaparece ao abrir o app.
- [ ] Listar, filtrar por categoria, renomear e apagar os desenhos do cliente.
- [ ] **Prova de isolamento:** o papel de banco do cliente 2 recebe erro do PostgreSQL ao tentar ler o schema do cliente 1 — teste automatizado, não inspeção. Isolamento no banco, não só no código.
- [ ] O agente responde sobre uma área desenhada ("quantas pessoas moram aqui?", "qual a classe social predominante?") cruzando com os setores censitários.
- [ ] **Gabarito:** um desenho que coincide com o contorno de um município devolve o mesmo número que a tool municipal já existente.
- [ ] **Borda:** a resposta traz, vinda da row da tool, quantos setores entraram parcialmente e que fração do total veio de rateio.
- [ ] O `geodata` continua reconstruível: dropar e recarregar não toca nos desenhos.
- [ ] Nenhum `.py` e nenhum `.tsx` cita cliente pelo nome (o critério de saída da fase 5 continua valendo).
- [ ] O portão do frontend passa a rodar `format:check`, `lint`, `typecheck`, `test` e `build` com o novo código.

### Restrições identificadas

- **Português em tudo** — prosa, commits e código (decisão de 2026-08-29).
- **Python sempre com `uv`**; type hints obrigatórios; Ruff + pytest.
- O `geodata` é só-leitura para a aplicação; a fachada `query/` não ganha escrita.
- O desenho do cliente **não** vira tile e **não** vai para o host compartilhado — ele é aberto na internet (medido em 2026-08-31, `206` sem credencial). Fonte GeoJSON servida pela API, atrás do portão do cliente.
- Um processo serve um cliente só; nada de multi-tenancy em runtime.
- VPS com 3,9 GB livres de 38 GB — o banco de desenhos é pequeno, mas o espaço é apertado.
- O `restart` do systemd na VPS pede senha e só roda em terminal de verdade.

### Fora de escopo (confirmado)

- Importar KML/KMZ/shapefile pela aplicação.
- Login, usuário, sessão e permissão por pessoa.
- Editar a geometria de um desenho já salvo.
- Campos configuráveis por cliente.
- Desenhar linha; exportar; histórico de versões; compartilhar entre clientes.
- Qualquer chave nova no `configuracao/esquema.ts` — a ferramenta é casca.

---

## Resumo da sessão

| Métrica | Valor |
|---------|-------|
| Perguntas de descoberta | 7 |
| Abordagens exploradas | 3 |
| Funcionalidades removidas (YAGNI) | 9 |
| Validações concluídas | 5 |
| Decisões registradas | 8 + 4 pendências entre repositórios |

---

## Próximo passo

**Pronto para:** `/define .claude/sdd/archive/DESENHO_NO_MAPA/BRAINSTORM_DESENHO_NO_MAPA.md`

**Antes ou junto do `/define`**, tratar as quatro pendências entre repositórios (A–D acima) como
emendas ao ADR-0001 do `webgis` — a regra do `CLAUDE.md` é explícita, e o precedente do recorte
do Censo mostra o que custa não fazer isso.
