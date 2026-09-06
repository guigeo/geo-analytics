# DEFINE: PORTAL_LOGIN

> O portão de `basic_auth` do Caddy vira portal de login no agente — conta por pessoa,
> sessão, sair da sessão e trocar a própria senha —, e passa a valer só no `/api`

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | PORTAL_LOGIN |
| **Data** | 2026-09-06 |
| **Autor** | define (sessão Claude Code) |
| **Status** | Ready for Design |
| **Clarity Score** | 15/15 |
| **Entrada** | `BRAINSTORM_PORTAL_LOGIN.md` (`9cb7ffa`) + emendas de 2026-09-05 à §8 e de 2026-09-06 à §9 do ADR-0001 (`webgis` `5f023f4`) |

---

## Problema

O portão de `basic_auth` guarda dado que o cliente produziu — os desenhos que ele grava no
`app_clientes` desde 2026-09-03 — com uma credencial **única por cliente, compartilhada
por todos lá dentro**, que a pessoa não consegue trocar e da qual não consegue sair. Ela
já se perdeu uma vez, na subida do cliente 2, e rotacionar saiu mais barato que caçar.

O que era tolerável enquanto a senha protegia dinheiro (cada pergunta ao `/api/chat` chama
um modelo) deixou de ser quando ela virou a única coisa entre um estranho e o dado do
cliente — dado que ele pode **apagar**.

---

## Usuários

| Usuário | Papel | Dor |
|---------|-------|-----|
| Pessoa do cliente 1 (`geo-intelligence.averisen.com`) | usa o mapa e o chat | Não sai da sessão num computador compartilhado; usa a mesma senha que os colegas; não pode trocá-la |
| Pessoa do cliente 2 (`app.ebprime.com.br`) | desenha e guarda áreas de prospecção | O mesmo, e com dado próprio dentro: quem tem a senha apaga o trabalho dela |
| Guilherme | opera os dois clientes | Rotacionar credencial hoje é editar arquivo, republicar e avisar todo mundo ao mesmo tempo; entrada e saída de pessoa não têm mecanismo |
| O vigia (`deploy/vigia-app.sh`) | verifica os dois clientes a cada 10 min | Hoje carrega `PORTAO_CREDENCIAL` para conseguir bater no site; precisa continuar enxergando saúde **sem** virar uma conta |

---

## Objetivos

| Prioridade | Objetivo |
|------------|----------|
| **MUST** | Entrar, sair da sessão e trocar a própria senha — as três telas, no visual do app |
| **MUST** | **Sair revoga de verdade**: o cookie antigo não volta a funcionar |
| **MUST** | Trocar a senha derruba as outras sessões daquela conta |
| **MUST** | O portão passa a valer **só no `/api`**; o site estático deixa de depender do agente (emenda de 2026-09-06 à §9) |
| **MUST** | **`/api/health` fica fora da sessão** — o vigia depende dele e não pode virar uma conta |
| **MUST** | O `vigia-app.sh` e o `verificar-vps.sh` passam a **afirmar o estado novo**: site 200 **e** `/api` 401 sem sessão |
| **MUST** | Sessão sobrevive ao `make ship-ia` + restart do systemd |
| **MUST** | Script de criar e resetar conta, no `servidor-dados-gis` |
| **MUST** | Senha provisória com troca obrigatória no primeiro login |
| **MUST** | Limite por IP no `/api/auth/entrar`, reaproveitando o `RateLimiter` que já existe |
| **MUST** | O isolamento entre clientes continua sendo do Postgres — papel por cliente, `USAGE` só no próprio schema |
| **SHOULD** | A tela de entrar traz a marca do cliente (é dado que já existe — ver "Correções ao brainstorm") |
| **SHOULD** | Sessão vencida devolve 401 e a tela de entrar, sem tela branca nem erro cru |
| **COULD** | Limpeza de sessão vencida por `DELETE` preguiçoso no login, em vez de cron |

---

## Critérios de sucesso

- [ ] **3 telas** entregues: entrar, trocar senha, sair. Nenhuma quarta.
- [ ] **0 pessoas deslogadas** por um `make ship-ia` + restart.
- [ ] Com o agente parado: `/` responde **200**, o basemap e os tiles pintam, e a busca de
      município funciona. Chat e desenhos dizem que estão indisponíveis.
- [ ] Sem sessão: `/api/chat`, `/api/desenhos/*` e `/api/geocode` respondem **401**;
      `/api/health` responde **200**.
- [ ] Depois de sair da sessão, o cookie capturado antes responde **401** — verificado por
      `curl`, não por navegador.
- [ ] Depois de trocar a senha, a sessão aberta em outro navegador responde **401**.
- [ ] Força bruta no `/api/auth/entrar` bate no limite por IP e devolve `Retry-After`.
- [ ] A conta do cliente 1 **não** entra no cliente 2 — recusa vinda do papel do Postgres,
      não de um `if` da aplicação.
- [ ] **0 ocorrências** de `PORTAO_USUARIO`, `PORTAO_HASH` e `PORTAO_CREDENCIAL` nos dois
      repositórios ao fim da feature.
- [ ] O `caddy validate` aceita o arquivo renderizado dos dois clientes (o arquivo é
      compartilhado com os outros sites da VPS).
- [ ] `verificar-vps.sh` **falha** se o `/api/chat` de qualquer cliente responder 200 sem
      sessão.

---

## Testes de aceitação

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| AT-001 | Entrar | conta criada, senha já trocada | envia e-mail e senha certos | 200, cookie `HttpOnly; Secure; SameSite=Lax`, e o mapa abre com os desenhos do cliente |
| AT-002 | Senha errada | conta existente | envia senha errada | 401 com mensagem **que não diz se o e-mail existe** |
| AT-003 | E-mail inexistente | — | envia e-mail que não existe | 401 **idêntico** ao AT-002, e no mesmo tempo de resposta |
| AT-004 | Primeiro login | conta com senha provisória | entra | é levada à troca de senha e **não** alcança o mapa antes de trocar |
| AT-005 | **Sair revoga** | sessão aberta, cookie capturado | sai da sessão e repete a requisição com o cookie antigo | 401 — a linha da sessão não existe mais |
| AT-006 | **Trocar senha derruba as outras** | mesma conta aberta em dois navegadores | troca a senha no primeiro | o segundo passa a responder 401 |
| AT-007 | Deploy não desloga | sessão aberta | `make ship-ia` + `systemctl restart` | a mesma sessão continua valendo |
| AT-008 | **A §9, verificada** | agente parado (`systemctl stop`) | abre o site | `/` 200, basemap, tiles e busca de município funcionam; chat e desenhos avisam indisponibilidade; nada de 502 na navegação |
| AT-009 | Rotas fechadas | sem cookie | chama `/api/chat`, `/api/desenhos`, `/api/geocode` | 401 nas três |
| AT-010 | **O vigia continua enxergando** | sem cookie | chama `/api/health` | 200 (ou 503 se o `geodata` estiver fora), **nunca 401** |
| AT-011 | Força bruta | — | erra a senha acima do limite pelo mesmo IP | 429 com `Retry-After` |
| AT-012 | Fronteira de cliente | conta do cliente 1 | tenta entrar no domínio do cliente 2 | recusa; e o papel do Postgres do cliente 2 não alcança o schema do 1 |
| AT-013 | Sessão vencida | cookie com `expira_em` no passado | usa o app | 401 e a tela de entrar, sem tela branca |
| AT-014 | **A marca na tela de entrar** | build de cada cliente | abre `/` sem sessão | a tela traz `nome`, `subtitulo`, símbolo, fontes e paleta **daquele** cliente, e o `identidade.test.ts` continua provando que o nome de um não aparece no outro |
| AT-015 | **O verificador afirma o estado novo** | os dois clientes no ar | roda `webgis/scripts/verificar-vps.sh` | afirma `/` 200 **e** `/api/chat` 401 por cliente; **falha** se o `/api` responder 200 |
| AT-016 | Caddy aceita o arquivo | modelo renderizado dos dois clientes | `caddy validate` | aceita — nenhuma diretiva nova, só remoção |
| AT-017 | O `.env` não guarda mais portão | `deploy/clientes/*.env` | `grep PORTAO_` nos dois repositórios | nenhuma ocorrência, e o `carregar-cliente.sh` não exige as variáveis |
| AT-018 | Ordem de publicação | VPS com o portal ainda não publicado | tenta `ship-app` sem `ship-ia` feito | o deploy **para** — o site novo pediria sessão a um agente que não sabe emiti-la |

---

## Fora de escopo

Confirmado pela emenda de 2026-09-05 à §8 e pelos cortes do brainstorm:

- **Papel, permissão e visibilidade diferente entre pessoas do mesmo cliente.** A conta
  identifica quem entrou; o dado continua sendo do cliente.
- **Auditoria de quem desenhou o quê** — é dado por pessoa. Voltar exige reabrir a §8.
- **Recuperação de senha por e-mail**, e qualquer dependência de SMTP ou serviço
  transacional.
- **Tela de administração no app** — exigiria o papel que a §8 cortou.
- **2FA** e **lista de sessões ativas por dispositivo**.
- **Bloqueio de conta após N tentativas** — o limite por IP entrega o essencial sem criar
  o vetor de trancar o cliente de fora de propósito.
- **Regra de força de senha além de comprimento mínimo** — complexidade obrigatória
  empurra para senha anotada em papel.
- **Convite por link** — depende de e-mail.
- **Multi-tenancy em runtime.** Cada build continua conhecendo um cliente só.
- **Fechar o `tiles.averisen.com`.** Ele já é aberto hoje, e a emenda de 2026-09-06
  registrou isso. Fechá-lo é decisão própria, com custo próprio, e não é desta feature.

---

## Restrições

| Tipo | Restrição | Impacto |
|------|-----------|---------|
| Arquitetural | Atravessa **3 repositórios** | Agente e front no `geo-analytics`; tabelas e script de conta no `servidor-dados-gis`; `verificar-vps.sh` e VPS.md no `webgis` |
| Arquitetural | A decisão já é emenda de ADR (§9, 2026-09-06) | O `/design` implementa; não reabre |
| Arquitetural | Regra 1 — o que difere entre clientes é **dado** | Nenhum `.tsx` de login por cliente. A identidade já é dado |
| Arquitetural | Regra 4 — dado do cliente nunca entra no `geodata` | `usuario` e `sessao` vão para o schema do cliente no `app_clientes` |
| Arquitetural | Schema, papel e GRANTs **não podem existir em duas cópias** | As tabelas nascem no `cargas/app_clientes.sh`, nunca em migration à parte |
| Arquitetural | No `servidor-dados-gis` toda **carga** é reexecutável | O `app_clientes.sh` continua idempotente (cria estrutura, não toca linha). Criar conta é **operação**, não carga: vai para `scripts/`, ao lado do `backup-acervo.sh` |
| Técnica | Caddy 2.6.2 na VPS, arquivo compartilhado com outros sites | A mudança no Caddy é **só remoção** — nenhuma diretiva nova, nenhum risco de o `validate` recusar o arquivo inteiro |
| Técnica | VPS com 3,7 GB de RAM e 5,2 GB de disco livre | Nenhum processo novo por cliente; atenção ao custo de memória do hash de senha |
| Técnica | Site e `/api` no mesmo host | O cookie é first-party; não há CORS nem `SameSite=None` a resolver |
| Técnica | Dependência nova: argon2 no agente | A única da feature; instalação é `uv sync` **com** `--reinstall-package` na VPS (muda dependência) |
| Processo | `restart` do systemd pede senha | Só roda em terminal de verdade do Guilherme, nunca pelo agente |
| Processo | Antes de publish que toque o acervo: `backup-acervo.sh --origem vps` | O acervo passa a conter conta e hash |
| Processo | O `ZONEAMENTO_SP` está pronto na `main` e fora do ar de propósito | Qualquer `ship-app` desta feature exige conferir os tiles da VPS antes |
| Segurança | **O portão novo entra antes de o velho sair** | Tirar o `basicauth` com a sessão fora do ar expõe o `/api/chat` e a chave da OpenAI. É passo numerado do `/design`, não lembrete |

---

## Contexto técnico

| Aspecto | Valor | Notas |
|---------|-------|-------|
| **Local** | `agent/src/geo_agent/` (rotas, sessão, hash), `web/src/` (3 telas + tratamento de 401), `deploy/` (Caddy, vigia, carregar-cliente, deploy.sh), `servidor-dados-gis/cargas/app_clientes.sh` e `scripts/`, `webgis/scripts/verificar-vps.sh` e `docs/VPS.md` | Feature atravessa 3 repositórios |
| **KBs** | **Nenhum cobre autenticação.** O acervo tem `maplibre`, `pmtiles-tippecanoe`, `geospatial-etl`, `agentes-llm` | Primeiro assunto do projeto sem KB de apoio — candidato a `/distill` depois do ship |
| **Impacto de infra** | Duas tabelas novas no `app_clientes`; **nenhum** processo, porta ou unit novos | O bloco de Caddy encolhe |
| **Consumidores do `/api`** | **Três** no front (`chat/api.ts`, `desenho/api.ts`, `search/geocode.ts`) + o vigia (`/api/health`) | Medido nesta sessão — ver correção 3 |

---

## Premissas

| ID | Premissa | Se estiver errada | Validada? |
|----|----------|-------------------|-----------|
| A-001 | O custo do argon2 cabe na VPS de 3,7 GB de RAM com os parâmetros padrão | Tunar memória/tempo, ou trocar por bcrypt. Login é raro, mas o padrão do argon2id reserva dezenas de MB por chamada | [ ] **Medir na VPS**, como A-001 do `CENSO_H3` — os tempos deste Mac não valem lá |
| A-002 | Os três consumidores do `/api` no front são os únicos, e todos passam a tratar 401 | Um caminho esquecido dá tela branca em vez de tela de entrar | [x] Medido: 4 `fetch` no `web/src`, 3 batem no `/api`, o quarto é índice estático |
| A-003 | Não há consumidor do `/api` fora do front e do vigia | Integração externa quebraria no dia da publicação | [x] Medido: `grep` nos dois repositórios só acha o vigia e a linha de teste do `setup-agente-vps.sh` |
| A-004 | 30 dias de sessão é o que o uso pede | Sessão curta faz relogar num app aberto uma vez por mês; longa demais aumenta a janela de cookie roubado | [ ] Decisão do `/design`; sem medição possível antes do uso |
| A-005 | O papel do cliente alcança as tabelas novas pelo `ALTER DEFAULT PRIVILEGES` que já existe | Faltaria GRANT explícito e o agente não leria a própria tabela de conta | [ ] Confirmar no `/design` — e decidir se tabela de senha deve mesmo herdar o mesmo privilégio das outras |

---

## Clarity Score

| Elemento | Nota | Motivo |
|----------|------|--------|
| Problema | 3 | Nomeado, datado e com o incidente real (a senha perdida na subida do cliente 2) |
| Usuários | 3 | Quatro perfis com dor específica, incluindo o vigia — que é quem quebraria em silêncio |
| Objetivos | 3 | 11 MUST, 2 SHOULD, 1 COULD, todos derivados de emenda do ADR ou de restrição medida |
| Sucesso | 3 | 11 critérios, todos verificáveis por `curl` ou `grep`, incluindo a §9 |
| Escopo | 3 | 10 exclusões explícitas, cada uma com o motivo e o gatilho de volta |
| **Total** | **15/15** | |

---

## Correções ao brainstorm

| O que mudou | Por quê |
|-------------|---------|
| **1. `/api/health` fica fora da sessão, e virou MUST** | O `deploy/vigia-app.sh` bate em `/api/health` a cada 10 minutos usando `PORTAO_CREDENCIAL`. Com a sessão aplicada a `/api/*` inteiro, ele passaria a receber 401 e a alertar que o agente caiu — a cada 10 minutos, nos dois clientes, sem nada estar errado. O brainstorm listou as rotas a fechar e não listou a que não pode fechar |
| **2. O `verificar-vps.sh` do `webgis` inverte de sentido, e virou MUST** | Ele afirma hoje: *"o `.env` define `PORTAO_USUARIO` ⇒ o site tem de responder 401"*. Sem `PORTAO_USUARIO`, ele passa a esperar 200 — e um site 200 vira o resultado esperado para todo cliente. Ou seja: **o portão poderia sumir inteiro e o verificador diria que está tudo certo.** É a mesma classe de falha silenciosa da quarta checagem do `build_app` no `ZONEAMENTO_SP`, e a correção é a mesma: o verificador passa a afirmar o par — `/` 200 **e** `/api/chat` 401 |
| **3. São três consumidores do `/api` no front, não dois** | O inventário do brainstorm listou `chat/api.ts` e `desenho/api.ts`. O `search/geocode.ts` chama `/api/geocode` **direto**, sem passar por cliente compartilhado. Esquecê-lo daria tela branca na busca em vez de tela de entrar |
| **4. A marca do cliente na tela de entrar volta ao escopo — e de graça** | A D-006 apresentou "visual do app" e "marca por cliente" como opções distintas, e recusou a segunda por exigir logo e paleta de cada cliente. **Elas já existem.** O `web/src/clientes/<id>.ts` traz `nome`, `subtitulo`, `marca`, `marcaEscura`, `simbolo` (o logo descrito em traços SVG, porque a regra 1 proíbe logo em `.tsx`), `fontes`, `raio` e as duas paletas. A tela construída com os componentes do app **já sai** com a identidade do cliente. As duas opções eram a mesma |
| **5. A mudança no Caddy é só remoção** | O brainstorm tratou o Caddy 2.6.2 como risco. Não é: o bloco `basicauth` sai e nada entra — o matcher `@api` e o `reverse_proxy` já existem. Nenhuma diretiva nova num arquivo compartilhado com os outros sites da máquina |
| **6. `PORTAO_*` tem 7 pontos de toque, não 2** | Além do `Caddyfile.modelo` e dos dois `.env`: `vigia-app.sh`, `setup-agente-vps.sh`, `carregar-cliente.sh`, `deploy.sh` e — no `webgis` — `verificar-vps.sh` e `docs/VPS.md`. Vira critério de sucesso contável: zero ocorrências ao fim |

---

## Questões em aberto

**Nenhuma que bloqueie o design.** Três premissas seguem por validar e viram tarefa da fase
de build, não pergunta ao dono:

- **A-001** — custo do argon2 na VPS, que só se mede lá.
- **A-004** — duração da sessão; proposta de 30 dias com renovação, a fechar no `/design`.
- **A-005** — se a tabela de senha deve herdar o mesmo privilégio das outras do schema.

---

## Histórico de revisão

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-06 | define | Versão inicial, a partir do BRAINSTORM e das emendas às §8 e §9 do ADR-0001 |

---

## Próximo passo

**Pronto para:** `/design .claude/sdd/features/DEFINE_PORTAL_LOGIN.md`
