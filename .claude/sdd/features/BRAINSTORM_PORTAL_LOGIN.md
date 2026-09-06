# BRAINSTORM: PORTAL_LOGIN

> Sessão exploratória para trocar o portão de `basic_auth` do Caddy por um portal de
> login de verdade — sessão, sair da sessão e trocar a própria senha

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | PORTAL_LOGIN |
| **Data** | 2026-09-06 |
| **Autor** | brainstorm (sessão Claude Code) |
| **Status** | Ready for Define |

---

## Ideia inicial

**Entrada bruta:** o `DESENHO_NO_MAPA` está em produção nos dois clientes desde
2026-09-03, e com ele o gatilho que a §8 do ADR-0001 nomeou há semanas — "o polígono que
ele desenha" — disparou. O portão de `basic_auth` passou a guardar dado que a pessoa
produziu, sem que ela consiga sair da sessão nem trocar a própria senha. O Guilherme
declarou o portal como próxima prioridade em 2026-09-05.

**O escopo já vinha definido pela emenda de 2026-09-05 à §8**, e é ele que mantém isto
pequeno: pessoas entram com conta própria, mas **não existe distinção entre elas dentro do
cliente**. Todo mundo da mesma empresa vê os mesmos desenhos e as mesmas camadas. Entra
sessão, logout e troca de senha. Não entra papel, permissão, dado por pessoa nem
visibilidade diferente entre colegas.

**Contexto levantado nesta sessão (medido, não presumido):**

- O portão de hoje é `basicauth` no bloco de Caddy de cada cliente
  (`deploy/Caddyfile.modelo`), com hash em `deploy/clientes/<id>.env`, protegendo **tudo**:
  `index.html`, assets e `/api`. É `basicauth` e não `basic_auth` porque o Caddy da VPS é
  2.6.2 — o nome novo faz o `validate` recusar o arquivo inteiro, que é compartilhado com
  os outros sites da máquina.
- **Os tiles já são públicos hoje.** O `tiles.averisen.com`
  (`webgis/infra/tiles/Caddyfile.prod`) não tem portão nenhum: só um filtro de CORS por
  `Origin`, que qualquer `curl` ignora. O dado do mapa nunca esteve atrás da senha — o que
  o portão protege de fato é o `/api` (a chave da OpenAI e os desenhos) e o `index.html`.
- O agente é FastAPI (`agent/src/geo_agent/main.py`), systemd por cliente, só em
  `127.0.0.1`. Já tem `RateLimiter` por IP nas rotas `/api/chat` e `/api/geocode`.
- O `app_clientes` já existe e já é o banco do dado não reconstruível
  (`agent/src/geo_agent/acervo.py`). **O isolamento entre clientes é do Postgres**, não da
  aplicação: o papel de cada cliente tem `USAGE` só no próprio schema, e o do vizinho
  recusa com `permission denied`.
- O `cargas/app_clientes.sh` do `servidor-dados-gis` é a fonte única de schema, papel e
  GRANTs — e o próprio script diz que essa definição **não pode existir em duas cópias**.
- O `scripts/backup-acervo.sh` faz `pg_dump -C` do banco inteiro e descobre os schemas
  `cliente_*` pelo catálogo, não por lista escrita à mão. **Tabela nova entra no backup
  sozinha.**
- Os clientes de API do front (`web/src/chat/api.ts`, `web/src/desenho/api.ts`) já
  distinguem tipo de falha por status — o 503 do acervo vira "indisponível" e o 422 vira
  "corrija o formulário". O 401 tem onde encaixar.

**Contexto técnico observado (para o /define):**

| Aspecto | Observação | Implicação |
|---------|-----------|------------|
| Local provável | `agent/src/geo_agent/`, `web/src/`, `deploy/`, `servidor-dados-gis/cargas/` e `scripts/` | Feature atravessa 3 repositórios |
| KBs relevantes | **nenhum cobre autenticação** — o acervo tem `maplibre`, `pmtiles-tippecanoe`, `geospatial-etl`, `agentes-llm` | Candidato a `/distill` depois do ship |
| Emenda de ADR | §8 (escopo, emendado em 2026-09-05) e **§9 (emendada em 2026-09-06 — a D-001)** | Feito: `webgis` `5f023f4` |
| Dependência nova | biblioteca de hash de senha (argon2) no agente | A única do projeto inteiro |

---

## Perguntas de descoberta e respostas

| # | Pergunta | Resposta | Impacto |
|---|----------|----------|---------|
| 1 | Onde a sessão mora, e o que o portão passa a proteger? | **Portão só no `/api`** — a sessão vive no agente, o site estático fica aberto | A §9 continua verdadeira; o `index.html` e a config do cliente deixam de estar atrás de senha |
| 2 | Como nasce uma conta, e o que acontece quando alguém esquece a senha? | **Script na VPS**, o Guilherme é o caminho de recuperação; senha provisória por fora, troca obrigatória no primeiro login | Três telas em vez de seis; sem admin, sem e-mail, sem token |
| 3 | Cookie assinado sem estado, ou tabela de sessão no banco? | **Tabela `sessao` no `app_clientes`** | Logout revoga de verdade; trocar a senha derruba as outras sessões; restart do agente não desloga ninguém |
| 4 | A tela de entrar segue o visual do app ou uma referência externa? | **O visual do próprio app** — Tailwind v4, shadcn/ui, tema claro/escuro, identidade "Geo Intelligence" | Sem dependência nova e sem decisão de design pendente para o `/design` |

---

## Inventário de amostras

> O que existe no repositório e serve de referência concreta, para o `/design` não inventar
> padrão novo onde já há um.

| Tipo | Local | Notas |
|------|-------|-------|
| Rota FastAPI com acervo | `agent/src/geo_agent/rotas_desenhos.py` | O padrão de router, `_protegido` e tradução de exceção em status |
| Fachada de escrita no Postgres | `agent/src/geo_agent/acervo.py` | Conexão, `sql.Identifier` para schema, exceções próprias (`AcervoIndisponivel`, `DesenhoInvalido`) |
| Limite por IP | `agent/src/geo_agent/main.py` (`RateLimiter`, `_limite_estourado`) | Reaproveitado no `/api/auth/entrar`, com `Retry-After` |
| Cliente de API no front | `web/src/desenho/api.ts` | Erro tipado por status; é onde o 401 entra |
| Criação de schema/papel/GRANT | `servidor-dados-gis/cargas/app_clientes.sh` | **A fonte** das tabelas novas — não criar migration à parte |
| Backup do acervo | `servidor-dados-gis/scripts/backup-acervo.sh` | Já cobre schema novo pelo catálogo |
| Bloco de Caddy por cliente | `deploy/Caddyfile.modelo` + `deploy/clientes/<id>.env` | É de onde o `basicauth` sai |

**Não há amostra de tela de login** — o visual sai dos tokens de tema que o app já usa.

---

## Abordagens exploradas

### Abordagem A: portão só no `/api`, sessão no agente ⭐ Escolhida

**Descrição:** o login, a sessão e a troca de senha vivem no agente. O Caddy para de
proteger o site estático e passa a exigir o cookie apenas nas rotas `/api/*`. Quem chega
sem sessão baixa o app e cai na tela de entrar; o `/api` responde 401.

**Prós:**

- **Preserva a §9 literalmente.** Agente fora do ar: o site carrega, o basemap e os tiles
  aparecem, e chat e desenhos degradam — que é exatamente a promessa registrada.
- Não cria processo novo na VPS (3,7 GB de RAM, 5,2 GB de disco livre em 2026-09-05).
- O `/api/chat` continua protegido, que é o que a §8 disse ser o motivo real do portão:
  custo, não sigilo.

**Contras:**

- O `index.html`, o bundle e a config do cliente (nome, camadas, extensão inicial) ficam
  públicos. **Atenuante medido:** os tiles já são públicos hoje, então o dado do mapa não
  regride — o que passa a ser visível é a composição da aplicação daquele cliente.
- Um estranho consegue ver que a aplicação existe e para quem ela é. Antes, a caixa do
  navegador escondia isso.

**Por que foi escolhida:** é a única das três que não troca a feiura por um ponto único de
falha, e a objeção registrada em 2026-08-31 ("pôr o portão no agente tranca o site
inteiro") foi feita contra a abordagem B, não contra esta. Aqui o portão está no agente e
o site **não** depende dele.

---

### Abordagem B: `forward_auth` do Caddy para o agente

**Descrição:** o Caddy pergunta ao agente, a cada requisição — inclusive do HTML —, se o
cookie vale. O site inteiro continua fechado, como hoje.

**Prós:**

- Nada fica público: mesma superfície de hoje, com tela bonita.
- É o meio-termo que a §8 nomeou e reabriu.

**Contras:**

- **O agente vira ponto único de falha.** Agente fora do ar tranca o site inteiro, e a
  propriedade da §9 deixa de ser verdade — é a objeção exata que a emenda de 2026-08-31
  registrou e que a de 2026-09-05 mandou resolver.
- Toda requisição de asset passa pelo agente, inclusive as que hoje o Caddy serve sozinho.

---

### Abordagem C: serviço de autenticação separado

**Descrição:** um terceiro processo systemd por cliente, mínimo, só para login e sessão; o
Caddy faz `forward_auth` contra ele. O site continua fechado e não depende do agente.

**Prós:**

- Junta o fechamento total da B com a independência do agente da A.

**Contras:**

- Mais um processo, mais um deploy, mais um vigia e mais um `.env` **por cliente**, numa
  VPS que já está com 86% do disco usado — para um portal que o escopo definiu como
  pequeno.
- Troca um ponto único de falha por outro: o serviço de auth cai e tranca tudo igual.

---

## Abordagem selecionada

| Atributo | Valor |
|----------|-------|
| **Escolhida** | Abordagem A — portão só no `/api`, sessão no agente |
| **Confirmação** | 2026-09-06, pelo Guilherme, nesta sessão |
| **Razão** | É a única que resolve a pergunta da §8 sem quebrar a promessa da §9 |

---

## Forma da solução

**Postgres** (`app_clientes`, schema `cliente_<id>`), pelo `cargas/app_clientes.sh`:

- `usuario` — e-mail, hash da senha, `trocar_senha`, timestamps.
- `sessao` — id opaco, `usuario_id`, `expira_em`.

**Agente** (`agent/src/geo_agent/`):

- `POST /api/auth/entrar`, `POST /api/auth/sair`, `POST /api/auth/senha`,
  `GET /api/auth/eu`.
- Uma dependência do FastAPI exige sessão em `/api/chat`, `/api/desenhos/*` e
  `/api/geocode`.
- `RateLimiter` no `/api/auth/entrar`.
- Dependência nova: argon2.

**Caddy** (`deploy/Caddyfile.modelo`): sai o bloco `basicauth`; saem `PORTAO_USUARIO` e
`PORTAO_HASH` de `deploy/clientes/<id>.env`. A CSP não muda — a tela é do mesmo `self`.

**Front** (`web/src/`): telas de entrar, trocar senha e sair; o 401 nos clientes de API
existentes volta para a tela de entrar.

**`servidor-dados-gis`**: `scripts/criar-usuario.sh`, que cria e reseta conta.

---

## Decisões desta sessão

| # | Decisão | Razão | Alternativa recusada |
|---|---------|-------|----------------------|
| **D-001** | O portão passa a valer **só no `/api`**; o site estático fica aberto | Mantém verdadeira a promessa da §9 de que a queda do agente degrada e não derruba | `forward_auth` para o HTML (B) e serviço de auth separado (C) |
| **D-002** | Conta nasce e reseta por **script na VPS**; o Guilherme é o caminho de recuperação | Não exige papel de admin (cortado pela emenda de 2026-09-05) nem serviço de e-mail | Tela de admin no app; recuperação por e-mail com token |
| **D-003** | Sessão em **tabela no `app_clientes`**, cookie com id opaco | Logout revoga de verdade, trocar senha derruba as outras sessões, e o restart do agente não desloga ninguém — e restart é rotina de todo `make ship-ia` | Cookie assinado sem estado; sessão na memória do processo |
| **D-004** | Tabelas novas nascem no **`cargas/app_clientes.sh`**, não em migration à parte | O próprio script determina que schema, papel e GRANTs não existam em duas cópias | Migration própria no `geo-analytics` |
| **D-005** | Senha provisória com **troca obrigatória no primeiro login** | É o que permite entregar a senha por canal inseguro (WhatsApp) sem que ela continue valendo | Senha definitiva escolhida pelo Guilherme |
| **D-006** | A tela segue o **visual do próprio app** | Tailwind v4, shadcn/ui e o tema claro/escuro já existem; a primeira tela já parece o produto | Referência externa; marca por cliente |

---

## ✅ Emenda ao ADR-0001 (`webgis`) — FEITA em 2026-09-06

**A D-001 não se resolvia nesta sessão.** Ela muda o bloco de Caddy — que é do `webgis` — e
altera o enunciado da §9: hoje a propriedade é "o site sobrevive à queda do agente porque
tudo que o usuário vê vem de arquivo estático"; com a D-001 ela passa a ser "o site
sobrevive à queda do agente, e o que exige sessão degrada com 401".

Também vale registrar lá o achado que sustenta a decisão: **o `tiles.averisen.com` nunca
teve portão**, só filtro de CORS. A frase da §8 sobre os tiles serem "dado público do IBGE
e vazá-los custar banda" está correta, mas o ADR nunca disse em texto que o portão não os
cobre — e a D-001 fica difícil de justificar sem esse fato à vista.

Conforme o `AGENTS.md`, isso foi tratado como emenda no `webgis`, e não aqui:

- **`webgis` `5f023f4`** — emenda de 2026-09-06 à §9 (o portão sai do site e fica só no
  `/api`), o achado dos tiles registrado, a linha da tabela de riscos reescrita, e o
  ponteiro da §8 para onde a pergunta foi respondida.
- No mesmo commit, a §8 foi **reordenada**: a emenda de 2026-08-31 (b), que argumenta que
  o gatilho não disparou, vinha depois da de 2026-09-05, que diz que disparou. Quem lesse
  em ordem lia a negação por último.
- O `webgis/AGENTS.md` deixou de dizer que a pergunta da sessão está em aberto.

**Não há mais bloqueio para o `/build`.**

---

## Cortado por YAGNI

| Item | Razão | Dá para voltar? |
|------|-------|-----------------|
| "Lembrar de mim" | A sessão longa (ver "em aberto") já entrega o efeito sem caixa de seleção | Sim |
| 2FA | Universo de poucas pessoas por cliente; nada no escopo pede | Sim |
| Lista de sessões ativas por dispositivo | É informação por pessoa, e a emenda de 2026-09-05 cortou distinção entre pessoas | Sim |
| Bloqueio de conta após N tentativas | O `RateLimiter` por IP já barra força bruta, e bloquear conta cria o vetor de trancar o cliente de fora de propósito | Sim |
| Auditoria de quem desenhou o quê | É dado **por pessoa** — o escopo diz que a conta identifica quem entrou, mas o dado é do cliente | Sim, mas exige reabrir a §8 |
| Regra de força de senha além de comprimento mínimo | Complexidade obrigatória empurra para senha anotada em papel; comprimento é o que mede | Sim |
| Convite por link | Depende de e-mail, que a D-002 recusou | Sim |

---

## Em aberto para o `/design`

- **Duração da sessão.** Proposta: 30 dias com renovação a cada uso. A alternativa curta
  faz o cliente relogar toda semana num app que ele abre uma vez por mês.
- **Limpeza de sessão vencida:** cron na VPS ou `DELETE` preguiçoso no login. O segundo não
  cria mais um serviço a vigiar.
- **Onde a credencial de banco do agente encosta na tabela `usuario`:** o papel do cliente
  já tem `SELECT/INSERT/UPDATE/DELETE` em todas as tabelas do schema por
  `ALTER DEFAULT PRIVILEGES`, então a tabela nova é alcançada sozinha — confirmar que é
  isso mesmo que se quer para uma tabela de senha.

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| **A ordem de publicação inverter.** Tirar o `basicauth` do Caddy com a sessão ainda não de pé deixa o `/api/chat` — e a chave da OpenAI — aberto na internet, protegido só por limite de IP | O portão novo entra **antes** de o velho sair. Vira passo numerado no `/design`, como foi no `ZONEAMENTO_SP` |
| **O backup do acervo passa a conter hash de senha** | O `backup-acervo.sh` já cobre a tabela sozinho, mas o arquivo deixa de ser algo que se guarda com displicência. Registrar no README do script |
| A senha do portão de hoje já se perdeu uma vez (item 2 da subida do cliente 2) | A migração é a oportunidade de rotacionar tudo: ninguém herda a senha antiga |
| Sessão perdida no meio de um desenho não salvo | O 401 volta para a tela de entrar; o `/design` decide se o desenho em curso sobrevive ao relogin |
| Não há KB de autenticação no acervo | `/distill` depois do ship — é o primeiro assunto do projeto sem KB de apoio |

---

## Requisitos sugeridos para o `/define`

### Problema (rascunho)

O portão de `basic_auth` guarda dado que o cliente produziu, mas não deixa a pessoa sair da
sessão nem trocar a própria senha — e a senha é única por cliente, compartilhada por todos
lá dentro, e já se perdeu uma vez.

### Usuários (rascunho)

| Usuário | Dor |
|---------|-----|
| Pessoa do cliente 1 / cliente 2 | Não consegue sair da sessão nem trocar a senha; a senha é a mesma dos colegas |
| Guilherme | Rotacionar credencial hoje significa editar arquivo e avisar todo mundo ao mesmo tempo |

### Critérios de sucesso (rascunho)

- [ ] A pessoa entra com conta própria, sai da sessão e troca a própria senha, nas três
      telas do app.
- [ ] Sair da sessão **revoga** — o cookie antigo não volta a funcionar.
- [ ] Trocar a senha derruba as outras sessões daquela conta.
- [ ] `make ship-ia` + restart **não** desloga ninguém.
- [ ] Com o agente parado, o site carrega, o basemap e os tiles aparecem, e chat e desenhos
      dizem que estão indisponíveis (a §9, verificada na prática).
- [ ] `/api/chat`, `/api/desenhos/*` e `/api/geocode` respondem 401 sem sessão.
- [ ] Força bruta no `/api/auth/entrar` bate no limite por IP com `Retry-After`.
- [ ] Nenhum cliente enxerga o schema do vizinho — verificado pelo papel do Postgres, como
      já se faz com o `desenho`.

### Restrições

- Caddy 2.6.2 na VPS: é `basicauth` que sai, e nada no bloco pode usar sintaxe de 2.8+ — o
  `validate` recusa o arquivo inteiro, compartilhado com os outros sites.
- VPS com 3,7 GB de RAM e 5,2 GB de disco livre: nada de processo novo por cliente.
- O restart do systemd pede senha e **só roda num terminal de verdade do Guilherme**.
- Antes de qualquer publish que toque o acervo: `backup-acervo.sh --origem vps`.
- O `.env` da VPS às vezes é mais novo que o local — comparar mtimes antes do `ship-ia`.
- O `ZONEAMENTO_SP` está pronto na `main` e fora do ar de propósito: **qualquer `ship-app`
  desta feature exige conferir os tiles da VPS antes.**

### Fora de escopo (confirmado)

- Papel, permissão e visibilidade diferente entre pessoas do mesmo cliente.
- Dado por pessoa: os desenhos continuam sendo do cliente.
- Recuperação de senha por e-mail; qualquer dependência de e-mail.
- Tela de administração dentro do app.
- Multi-tenancy em runtime: cada build continua conhecendo um cliente só.

---

## Resumo da sessão

| Métrica | Valor |
|---------|-------|
| Perguntas feitas | 4 |
| Abordagens exploradas | 3 |
| Decisões registradas | 6 (+1 pendente de emenda no `webgis`) |
| Cortes por YAGNI | 7 |
| Validações | 2 |

---

## Próximo passo

**Pronto para:** `/define .claude/sdd/features/BRAINSTORM_PORTAL_LOGIN.md`

**Emenda ao ADR:** feita em 2026-09-06 (`webgis` `5f023f4`). Nada bloqueia o `/build`.
