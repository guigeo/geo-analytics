# DEFINE: DESENHO_NO_MAPA

> O cliente desenha ponto, polígono e raio sobre o mapa, guarda com atributos no
> repositório dele, e pergunta ao agente o que o Censo diz sobre a área que desenhou.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | DESENHO_NO_MAPA |
| **Data** | 2026-08-31 |
| **Autor** | sessão `/define` com o Guilherme |
| **Status** | Pronto para o `/design` |
| **Pontuação de clareza** | 14/15 |
| **Entrada** | [`BRAINSTORM_DESENHO_NO_MAPA.md`](BRAINSTORM_DESENHO_NO_MAPA.md) |
| **Decisões de arquitetura** | ADR-0001 do `webgis`, emendas de 2026-08-31 à regra 4, à §8 e à §9 (commit `8f6ef9c`) |

---

## Declaração do problema

O cliente vê dados geográficos e pergunta sobre eles, mas **não consegue registrar os
territórios que ele mesmo define** — a área de atuação, o raio ao redor de uma unidade,
o ponto de interesse. Todo dado da aplicação hoje é universal e de terceiros (IBGE,
Anatel); nada é do cliente. A consequência prática é que a pergunta mais natural de
quem olha um mapa de negócio — *"quantas pessoas moram na minha área?"* — não tem como
ser feita, porque "minha área" não existe no sistema.

---

## Usuários-alvo

| Usuário | Papel | Dor |
|---------|-------|-----|
| **EB Prime** (cliente 2), em `app.ebprime.com.br` | Usa a aplicação para decidir sobre território | As áreas de atuação dela só existem em arquivo KML, fora de qualquer ferramenta. Não dá para vê-las no mapa junto do Censo, nem perguntar nada sobre elas |
| **Guilherme**, em `geo-intelligence.averisen.com` | Analista no app da casa | Delimita recortes ad hoc para analisar e não tem onde guardá-los; cada sessão recomeça do zero |
| **Guilherme**, como operador | Dono da infraestrutura | Precisa carregar as áreas KML do cliente por fora, sem que isso vire feature da aplicação e sem migração de schema depois |

---

## Objetivos

| Prioridade | Objetivo | Fase |
|------------|----------|------|
| **MUST** | O cliente salva um desenho com atributos e o reencontra na sessão seguinte | 1 |
| **MUST** | O dado de um cliente é inacessível ao outro **pelo banco**, não só pelo código | 1 |
| **MUST** | Desenhar polígono livre (a ferramenta pedida como principal) | 2 |
| **MUST** | O agente responde sobre a área desenhada, cruzando com o Censo | 4 |
| **MUST** | O aviso de borda sai da row da tool, não do prompt | 4 |
| **SHOULD** | Buffer por raio em metros a partir de um clique | 3 |
| **SHOULD** | Listar, buscar por nome e filtrar por categoria até ~500 desenhos | 1 |
| **SHOULD** | O `geodata` continuar reconstruível sem tocar no dado do cliente | 1 |
| **COULD** | Desfazer o último vértice durante o traçado | 2 |
| **COULD** | Camada de desenhos ligável/desligável no painel de camadas | 1 |

---

## Critérios de sucesso

Os limites de tempo abaixo saem de **medição real** no `geodata` local (468.097 setores,
2026-08-31), com margem para a VPS, que tem menos CPU — ver A-001.

| # | Critério | Origem do número |
|---|----------|------------------|
| 1 | Salvar um desenho responde em **< 300 ms** | Escrita de uma linha com geometria pequena |
| 2 | Cruzamento de área típica (**até ~5.000 setores**) responde em **< 500 ms** no servidor | Medido: 72 ms no Mac; margem de ~7× |
| 3 | Cruzamento de área extrema (**~50.000 setores**, 10% do país) responde em **< 3 s** | Medido: 358 ms no Mac; margem de ~8× |
| 4 | O rateio areal não custa mais que **+20%** sobre a contagem simples | Medido: 42 ms contra 72 ms — o `ST_Intersection` só roda na borda |
| 5 | A lista renderiza **500 desenhos** com primeira pintura em **< 1 s** | Volume-alvo declarado pelo Guilherme |
| 6 | **Isolamento:** o papel do cliente 2 recebe erro do PostgreSQL ao ler o schema do cliente 1 | Teste automatizado, não inspeção |
| 7 | **Gabarito:** desenho coincidente com um município devolve o mesmo número da tool municipal existente, com diferença **≤ 0,5%** | Tolerância para a aproximação geodésica já aceita em `medicao.ts` (-0,11% a +0,45%) |
| 8 | **Rateio:** duas metades complementares de um setor reconstituem o total dele com erro **≤ 1%** | Prova aritmética do método |
| 9 | Recarregar o `geodata` do zero deixa **100%** dos desenhos intactos | Regra 5 do ADR |
| 10 | **0** ocorrências de nome de cliente em `.py` e `.tsx` | Critério de saída da fase 5, já vigente |
| 11 | O portão do frontend passa: `format:check`, `lint`, `typecheck`, `test`, `build` | Portão vigente desde 2026-08-29 |

---

## Testes de aceitação

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| **AT-001** | Salvar um ponto | Aplicação aberta, autenticada no portão do cliente 1 | Ativo o modo ponto, clico no mapa, preencho nome e salvo | O ponto aparece no mapa e na lista; recarregando a página, continua lá |
| **AT-002** | Salvar um polígono | Modo polígono ativo | Clico 5 vértices e encerro o traçado | O polígono é salvo com a área calculada exibida em unidade legível |
| **AT-003** | Buffer por raio | Modo buffer ativo, raio 500 m digitado | Clico um ponto no mapa | Um polígono circular de 500 m de raio geodésico é criado e salvo como polígono comum |
| **AT-004** | **Isolamento no banco** | Papel `cliente_eb_prime` conectado | `SELECT` em qualquer tabela do schema `cliente_geo_analytics` | O PostgreSQL recusa com erro de permissão. **O teste falha se retornar 0 linhas em vez de erro** |
| **AT-005** | **Gabarito do cruzamento** | Geometria do município de São Paulo injetada como desenho | Pergunto ao agente a população da área | O número difere em ≤ 0,5% do que a tool municipal já devolve para o mesmo município |
| **AT-006** | **Rateio reconstitui o total** | Um setor censitário isolado, cortado por duas áreas complementares | Consulto as duas áreas | A soma das duas populações rateadas reconstitui o total do setor com erro ≤ 1% |
| **AT-007** | **Aviso de borda vem como dado** | Área desenhada que corta 39 setores ao meio (caso medido: buffer de 500 m) | O agente responde | A row da tool traz a contagem de parciais e a fração rateada, **antes** de o LLM escrever qualquer texto. Inspecionar a row, não a prosa |
| **AT-008** | Área enorme passa com aviso | Área cobrindo ~49.000 setores | Pergunto sobre ela | Responde em < 3 s e o aviso informa a extensão e quantos setores foram tocados. Não recusa |
| **AT-009** | Polígono inválido é recusado | Modo polígono ativo | Traço um polígono que cruza a si mesmo | A aplicação recusa antes de salvar, com mensagem, e o traçado continua editável |
| **AT-010** | Polígono degenerado | Modo polígono ativo | Encerro o traçado com 2 vértices | Recusa: polígono exige 3 vértices distintos |
| **AT-011** | **`geodata` segue reconstruível** | Desenhos salvos no `app_clientes` | Dropo e recarrego o `geodata` inteiro | Os desenhos continuam íntegros e o cruzamento volta a funcionar sem intervenção |
| **AT-012** | **Degradação com o agente fora** | Agente parado | Abro a aplicação | Basemap, satélite, tiles, busca de município e navegação funcionam. Os desenhos não aparecem, e a UI diz isso — não quebra em branco |
| **AT-013** | Lista com volume | 500 desenhos no cliente | Abro o painel e filtro por categoria | Primeira pintura em < 1 s; o filtro por categoria e a busca por nome respondem |
| **AT-014** | Categoria nasce do uso | Nenhuma categoria cadastrada | Salvo com categoria "praça de pedágio" e depois crio outro desenho | A categoria aparece no autocomplete do segundo, sem publicar nada |
| **AT-015** | Apagar com confirmação | Um desenho salvo | Peço para apagar | Pede confirmação; confirmado, some do mapa e da lista e não volta ao recarregar |
| **AT-016** | Dois produtores na mesma tabela | Um desenho de origem `desenho` | Insiro uma linha de origem `carga` pelo caminho administrativo | As duas convivem, aparecem no mapa e o agente cruza as duas igualmente |
| **AT-017** | Nenhum cliente citado em código | Árvore do repositório | `grep` por nome de cliente em `.py` e `.tsx` | Zero ocorrências |

---

## Fora de escopo

Confirmado no brainstorm e nas emendas ao ADR:

- **Importar KML/KMZ/shapefile pela aplicação.** As áreas existentes entram por carga administrativa fora do app. A coluna `origem` mantém o caminho aberto.
- **Login, usuário, sessão e permissão por pessoa.** O isolamento é por cliente. Ver a emenda de 2026-08-31 (b) à §8 do ADR: o gatilho apareceu e não disparou, porque o que exige sessão é dado *por pessoa*.
- **Editar a geometria de um desenho já salvo** (arrastar vértice). Edita-se atributo; para mudar o traçado, apaga e redesenha. É a primeira candidata a voltar.
- **Campos configuráveis por cliente** (JSONB, construtor de formulários).
- **Categoria como lista fechada por cliente.**
- Desenhar linha ou rota; exportar; histórico de versões; compartilhar entre clientes.
- **Qualquer chave nova no `configuracao/esquema.ts`** — a ferramenta é casca, não ponto de variação (regra 1, emenda de 2026-08-31).
- **Tile do desenho do cliente.** Ele é fonte GeoJSON servida pela API, atrás do portão. O host de tiles é aberto na internet (`206` sem credencial, medido em 2026-08-31) e só recebe dado público.
- **Backup do `app_clientes`.** É requisito de operação e precisa existir antes da fase 1 ir para a VPS, mas não é código desta feature. Registrado em Q-001.

---

## Restrições

| Tipo | Restrição | Impacto no design |
|------|-----------|-------------------|
| Arquitetura | Dado do cliente em `app_clientes`, banco separado, schema e papel por cliente | Duas conexões no agente. O `geodata` continua só-leitura |
| Arquitetura | O `query/` não ganha escrita — a promessa está em prosa no `query/db.py` | A escrita é fachada nova, não extensão da existente |
| Arquitetura | A API de escrita mora no agente, em `/api/desenhos` | Herda `CLIENTE`, `.env` e portão. Nenhum processo novo |
| Arquitetura | A ferramenta é casca: todo cliente recebe, sem chave de configuração | `esquema.ts` não muda. O teste que garante é o mesmo padrão de `estilo.test.ts` |
| Arquitetura | Camada e nível andam juntos (regra 7) | A fase 4 não é opcional; sem ela a feature contraria o ADR |
| Arquitetura | O que muda o sentido do número sai da row (regra 8) | O aviso de borda é dado, e AT-007 testa a row, não a prosa |
| Idioma | Português em prosa, commits **e código** | Nomes de coluna, tipos, rotas e componentes em português |
| Python | Sempre `uv`; type hints obrigatórios; Ruff + pytest | Sem pip, sem venv global |
| Frontend | Portão: `format:check`, `lint`, `typecheck`, `test`, `build` em Node 20 | Rodar antes de dizer que terminou |
| Infra | VPS com 3,9 GB livres de 38 GB e 3,7 GB de RAM | Banco de desenhos é pequeno; o aperto é de disco, não desta feature |
| Operação | `systemctl restart` na VPS pede senha e só roda em terminal de verdade | O deploy da fase tem um passo manual do Guilherme |
| Dados | Geometrias em EPSG:4674 (SIRGAS 2000); metros por `geography` | Convenção do `servidor-dados-gis`, regra 2 da casa |

---

## Contexto técnico

| Aspecto | Valor | Notas |
|---------|-------|-------|
| **Frontend** | `web/src/map/` (desenho, geometria), `web/src/panels/` (lista e formulário) | O precedente é `map/medicao.ts`: geometria em módulo puro, testável sem navegador nem WebGL |
| **Renderização** | Fonte GeoJSON, no padrão de `map/selection.ts` | **Não** é PMTiles, **não** vai para o host de tiles |
| **Backend** | `agent/src/geo_agent/` — rotas novas + fachada de escrita nova | Não estender `query/`, que é o consumidor só-leitura |
| **Tool do agente** | `agent/src/geo_agent/tools.py`, seguindo o padrão das 15 existentes | Args Pydantic → JSON Schema, despacho por `TOOL_REGISTRY`, grounding vindo das rows |
| **Prompt** | `agent/src/geo_agent/prompts.py` | O escopo em prosa precisa aprender que "a área que o usuário desenhou" existe, senão o agente recusa dado que tem |
| **Banco** | `app_clientes` no mesmo servidor PostGIS | Schema e papel por cliente; DDL e grants são trabalho do `servidor-dados-gis` |
| **Deploy** | `deploy/clientes/<id>.env` ganha o DSN da aplicação | Mecanismo existente; nada novo |
| **KBs a consultar** | `.claude/kb/maplibre`, `.claude/kb/geospatial-etl` | Padrões de interação com o mapa e de geometria |
| **Impacto em infra** | **Recursos novos**: banco, schemas, papéis, grants e rotina de backup | Primeiro dado do sistema que recarga nenhuma traz de volta |

---

## Premissas

| ID | Premissa | Se estiver errada | Validada? |
|----|----------|-------------------|-----------|
| **A-001** | A VPS aguenta o cruzamento espacial dentro dos limites dos critérios 2 e 3 | Os números foram medidos **neste Mac**, não na VPS, que tem menos CPU e 3,7 GB de RAM disputados com Caddy, Postgres e dois agentes. Se não aguentar, entra cache do resultado por desenho — o que é barato, porque o desenho só muda quando alguém o edita | [ ] **Medir na VPS antes da fase 4** |
| **A-002** | ~500 desenhos por cliente é o teto realista | Acima disso a lista precisa de carregamento por viewport e busca no servidor. A API já nasce paginada para o ajuste ser de UI, não de banco | [ ] |
| **A-003** | O rateio areal é aceitável para o uso do cliente | Ele supõe população uniforme dentro do setor, o que é falso em setor rural grande com a vila num canto. O aviso na row existe justamente porque a premissa é falsa em casos identificáveis | [x] Decidido com o trade-off explícito |
| **A-004** | Um desenho tem dezenas ou centenas de vértices, não milhões | É o que permite passar o polígono como parâmetro da consulta em vez de `postgres_fdw`. Um KML importado com contorno detalhado de município pode ter milhares — ainda cabe, mas convém limitar o tamanho do payload | [ ] **Definir o teto no `/design`** |
| **A-005** | A senha compartilhada do portão é proteção suficiente para o dado do cliente | Ela é única por cliente, compartilhada por todos lá dentro, sem registro de quem fez o quê, e já se perdeu uma vez. Se não for suficiente, o gatilho da §8 dispara de verdade e a sessão entra | [x] Aceito e registrado na emenda à §8 |
| **A-006** | Existe backup do `app_clientes` antes de o primeiro desenho real ser criado | Sem ele, o primeiro dado insubstituível do sistema nasce sem rede de segurança — e "refaço do zero" deixou de valer | [ ] **Bloqueia a subida da fase 1 à VPS** |

---

## Detalhamento da pontuação de clareza

| Elemento | Nota | Justificativa |
|----------|------|---------------|
| Problema | 3 | Específico e verificável: nenhum dado da aplicação é do cliente hoje |
| Usuários | 3 | Três personas, duas delas o mesmo humano em papéis distintos — e a distinção importa, porque uma delas justifica a coluna `origem` |
| Objetivos | 3 | MUST/SHOULD/COULD mapeados nas quatro fases, com as fases 1 e 4 não negociáveis por regra do ADR |
| Sucesso | **2** | Os limites de tempo estão **medidos no Mac, não na VPS**. São ancorados em dado real, mas o dado é do ambiente errado — ver A-001. É o único elemento com número não verificado no alvo |
| Escopo | 3 | Oito exclusões explícitas, cada uma com a razão e com o gatilho de reabertura quando existe |
| **Total** | **14/15** | Acima do mínimo de 12 |

---

## Questões em aberto

| ID | Questão | Bloqueia o quê |
|----|---------|----------------|
| **Q-001** | **Onde e como o backup do `app_clientes` roda.** É o primeiro dado do sistema que recarga nenhuma refaz | Não bloqueia o `/design`. **Bloqueia a subida da fase 1 à VPS** (A-006) |
| **Q-002** | **Onde a credencial de cliente deve morar.** O ADR já registrava a pergunta; com dado guardado ela passa a ter consequência | Não bloqueia esta feature. É dívida com vencimento, registrada na emenda à §8 |
| **Q-003** | Qual o teto de vértices/payload de um desenho (A-004) | Decidir no `/design` |

Nenhuma delas impede o `/design` de começar.

---

## Histórico de revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-08-31 | sessão `/define` | Versão inicial, a partir do BRAINSTORM. Duas lacunas fechadas com o Guilherme (volume-alvo de ~500 desenhos; área grande passa com aviso em vez de limite rígido) e limites de tempo ancorados em medição real do `geodata` local |

---

## Próximo passo

**Pronto para:** `/design .claude/sdd/features/DEFINE_DESENHO_NO_MAPA.md`
