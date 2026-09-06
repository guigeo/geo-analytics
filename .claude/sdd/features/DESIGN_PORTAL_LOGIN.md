# DESIGN: PORTAL_LOGIN

> Como o portão de `basic_auth` vira portal no agente: middleware que fecha por padrão,
> sessão em tabela, e o `/api/health` como única porta que fica aberta de propósito

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | PORTAL_LOGIN |
| **Data** | 2026-09-06 |
| **Autor** | design (sessão Claude Code) |
| **Status** | Ready for Build |
| **Entrada** | `DEFINE_PORTAL_LOGIN.md` (`2277c26`) |
| **Decisão de arquitetura** | Emenda de 2026-09-06 à §9 do ADR-0001 (`webgis` `5f023f4`) — **já tomada**, esta fase implementa |
| **Arquivos** | 34 (11 criados, 23 modificados), em 3 repositórios |

---

## Visão da arquitetura

```text
                         ANTES                               DEPOIS
  ┌──────────────────────────────────┐    ┌──────────────────────────────────────┐
  │ Caddy (bloco do cliente)         │    │ Caddy (bloco do cliente)             │
  │   basicauth  ←── TUDO passa aqui │    │   (sem basicauth — só remoção)       │
  │   /*      → file_server          │    │   /*      → file_server      ABERTO  │
  │   /api/*  → agente :8000         │    │   /api/*  → agente :8000             │
  └──────────────────────────────────┘    └──────────────────────────────────────┘
                                                            │
                                          ┌─────────────────▼────────────────────┐
                                          │ agente (FastAPI, 1 worker)           │
                                          │  ContextoDaRequisicao   (já existe)  │
                                          │  ExigeSessao            (NOVO)       │
                                          │    ├─ livre: /api/health             │
                                          │    ├─ livre: /api/auth/entrar        │
                                          │    └─ resto: exige cookie → 401      │
                                          │  rotas_auth  (NOVO)                  │
                                          │  rotas_desenhos / chat / geocode     │
                                          └───────────┬──────────────────────────┘
                                                      │ mesmo cluster :55432
                                       ┌──────────────┴───────────────┐
                                       ▼                              ▼
                            geodata (leitura)          app_clientes / cliente_<id>
                            papel geo_reader             papel app_<id>
                                                         ├─ desenho   (existe)
                                                         ├─ usuario   (NOVO)
                                                         └─ sessao    (NOVO)
```

**Fluxo de uma requisição autenticada:**

```text
navegador ──cookie sid──► Caddy ──► ExigeSessao
                                      │ sha256(sid)
                                      ▼
                          SELECT usuario_id FROM cliente_<id>.sessao
                           WHERE id_hash = $1 AND expira_em > now()
                                      │
                        ┌─────────────┴─────────────┐
                     achou                     não achou
                        │                           │
              renova expira_em              401 + limpa cookie
              segue para a rota             front mostra a tela de entrar
```

---

## Componentes

| Componente | Onde | Papel |
|------------|------|-------|
| `ExigeSessao` | `agent/src/geo_agent/sessao.py` | Middleware. **Fecha tudo em `/api/*` por padrão**; a lista de exceções é curta, explícita e testada |
| `Contas` | `agent/src/geo_agent/contas.py` | Fachada de conta e sessão no `app_clientes`. Irmã do `Acervo`, mesmo formato: exceção própria, `sql.Identifier` para o schema, o papel do Postgres é quem isola |
| `rotas_auth` | `agent/src/geo_agent/rotas_auth.py` | `POST /api/auth/entrar`, `POST /api/auth/sair`, `POST /api/auth/senha`, `GET /api/auth/eu` |
| Telas | `web/src/auth/` | `Entrar`, `TrocarSenha` e o `Portao` que decide entre elas e o app |
| `criar-usuario.sh` | `servidor-dados-gis/scripts/` | Cria e reseta conta. É **operação**, não carga — mora ao lado do `backup-acervo.sh` |
| DDL | `servidor-dados-gis/cargas/app_clientes.sh` | Fonte única de schema, papel e GRANTs. As duas tabelas nascem aqui |
| Verificação | `deploy/vigia-app.sh`, `webgis/scripts/verificar-vps.sh`, `deploy/deploy.sh` | Passam a **afirmar o par**: site aberto **e** `/api` fechado |

---

## Decisões

### D-1: O middleware fecha por padrão; a exceção é que se escreve

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** a checagem de sessão pode entrar como dependência do FastAPI (`Depends`) em
cada rota, ou como middleware sobre `/api/*` com lista de exceções.

**Escolha:** **middleware** `ExigeSessao`, com allowlist de duas entradas —
`/api/health` e `/api/auth/entrar` — e um teste que afirma que a lista é exatamente essa.

**Racional:** com `Depends`, uma rota nova nasce **aberta** e só fecha se alguém lembrar do
decorador; com middleware, ela nasce **fechada** e só abre se alguém escrever o caminho na
lista. A diferença é o modo de falha: esquecer o `Depends` publica um endpoint sem portão e
não dá erro nenhum — é a mesma classe de falha silenciosa que a correção 2 do DEFINE achou
no `verificar-vps.sh`. Esquecer a allowlist quebra alto, no primeiro request.

**Alternativas recusadas:**

1. `Depends(sessao_valida)` por rota — rota nova nasce aberta.
2. Middleware sem allowlist, com o `/api/health` movido para fora de `/api` — mudaria a URL
   que o vigia e o `verificar-vps.sh` já usam, em três arquivos, para não escrever duas
   linhas de exceção.

**Consequências:** a lista de exceções vira artefato de revisão — quem a aumentar tem de
alterar o teste, o que é exatamente o atrito desejado.

---

### D-2: O `ACERVO_DSN` deixa de ser opcional, e o agente recusa subir sem ele

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** hoje o `Acervo` é opcional no boot (`main.py`): sem ele o agente sobe, o chat
funciona inteiro e só os desenhos somem — comportamento escrito para honrar a §9. Com a
sessão no mesmo banco, "acervo ausente" passa a significar **ninguém entra**.

**Escolha:** o `lifespan` passa a **exigir** `ACERVO_DSN` e conexão viva, como já exige a
`OPENAI_API_KEY`. Sem isso, o processo não sobe.

**Racional:** a alternativa é o agente subir e recusar todo login com 401 — indistinguível,
para quem olha de fora, de "todo mundo errou a senha". O `Restart=on-failure` +
`RestartSec=5` do systemd já cobre o caso benigno (banco ainda subindo depois de um reboot):
o agente tenta de novo até o Postgres responder. Falhar alto e cedo é o que o próprio
`main.py` já faz com a chave da OpenAI.

**Consequências:** o comentário do `config.py` que promete "vazio não derruba o processo"
deixa de ser verdade e tem de mudar junto — comentário desatualizado neste repositório é o
que faz o próximo agente errar.

---

### D-3: A sessão no `app_clientes` **não** cria ponto de falha novo — medido

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** a D-2 deixa o login dependente do `app_clientes`. A pergunta óbvia é se isso
não reintroduz, por outra porta, o ponto único de falha que a emenda de 2026-09-06 à §9
recusou.

**Escolha:** aceitar a dependência, sem cache e sem mecanismo de contorno.

**Racional, medido nesta sessão:** `GEODATA_DSN` e `ACERVO_DSN` apontam para **o mesmo
cluster** — `localhost:55432`, bancos e papéis diferentes (`agent/.env.example:29` e `:41`).
Um Postgres fora do ar já mata o chat hoje: o `/api/health` devolve 503 e nenhuma tool
responde. Os domínios de falha **já coincidem**, então pôr a sessão ali não amplia o raio.

O caso residual é estreito: `app_clientes` quebrado **individualmente** (papel revogado,
banco derrubado) com o `geodata` de pé. Aí ninguém entra, e o mapa continua funcionando —
que é a §9 se comportando como prometido, não uma violação dela.

**Alternativa recusada:** cache em memória das sessões validadas, para sobreviver a
oscilação do banco. Recusada porque o cenário que ela cobre é o cluster oscilando — e nesse
cenário o chat já está morto pelo `geodata`. Complexidade que compra nada.

**Consequências:** o `/api/health` ganha uma terceira resposta a dar. Ele já reporta
`geodata` e `acervo` separadamente; `acervo: erro` passa a significar também "ninguém
consegue entrar", e o vigia deve dizer isso na mensagem.

---

### D-4: O banco guarda o **hash** do id de sessão, nunca o id

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** o `backup-acervo.sh` faz `pg_dump` do banco inteiro, e o DEFINE já registrou
que o backup passa a conter hash de senha. Se a tabela guardasse o `sid` em claro, o dump
passaria a conter também **sessões utilizáveis**: quem lesse o arquivo entraria sem senha.

**Escolha:** o cookie leva `sid` aleatório de 32 bytes; a tabela guarda
`sha256(sid)` na coluna `id_hash`, que é a chave primária.

**Racional:** SHA-256 basta — o `sid` já tem 256 bits de entropia, então não há o que um
ataque de dicionário faça. Argon2 aqui só custaria CPU a cada requisição, e é para senha
escolhida por gente, não para segredo sorteado por máquina.

**Consequências:** um dump vazado expõe hash de senha (custoso de quebrar) e hashes de
sessão (inúteis). Nenhuma sessão sobrevive ao vazamento do backup.

---

### D-5: Resposta idêntica para senha errada e conta inexistente — inclusive no tempo

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** o AT-002 e o AT-003 exigem respostas indistinguíveis. Corpo igual não basta:
se a conta não existe, o código pula a verificação do hash e responde em microssegundos,
enquanto a senha errada custa o argon2 inteiro. A diferença de tempo **é** a resposta.

**Escolha:** quando a conta não existe, verificar a senha enviada contra um **hash de
descarte** fixo, gerado no boot, e só então recusar.

**Racional:** é o padrão da própria biblioteca (`argon2` expõe isso), custa uma linha, e
sem ele o AT-003 passa no corpo da resposta e falha no relógio.

---

### D-6: O `Secure` do cookie é configuração, porque o `make dev-ia` é HTTP

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** cookie com `Secure` não é enviado por HTTP. Em produção tudo é HTTPS; o
`make dev-ia` roda em `http://localhost:5173`, e um `Secure` cravado deixaria o
desenvolvimento sem login nenhum.

**Escolha:** `settings.cookie_secure: bool = True` (padrão seguro), com
`COOKIE_SECURE=false` no `agent/.env.example` para desenvolvimento.

**Racional:** derivar do `X-Forwarded-Proto` seria automático e frágil — o header é
controlado por quem está na frente, e um proxy mal configurado desligaria o `Secure` em
produção sem avisar. Padrão seguro com desligamento explícito falha para o lado certo.

**Alternativa recusada:** detectar `request.url.scheme` — atrás do Caddy ele é `http`, então
a detecção desligaria o `Secure` justamente em produção.

---

### D-7: O `push_app` para se o agente ainda não sabe emitir sessão

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** o AT-018 e a restrição de segurança do DEFINE exigem que o portão novo entre
antes de o velho sair. O risco concreto é publicar o frontend novo contra um agente antigo:
a tela de entrar aparece, o `POST /api/auth/entrar` dá 404, e ninguém usa o produto — ou,
pior, publicar o Caddy sem `basicauth` antes do agente, deixando o `/api/chat` aberto.

**Escolha:** o `push_app` do `deploy/deploy.sh` ganha uma checagem contra a VPS **antes** de
copiar o bundle: `GET https://$DOMINIO/api/auth/eu` tem de responder **401**. Se responder
404, o agente é antigo e o deploy para.

**Racional:** é a mesma forma das três checagens paranoicas que o `build_app` já faz, e pelo
mesmo motivo: transformar "lembrar da ordem" em "o script não deixa". 401 é o único
resultado que prova as duas coisas ao mesmo tempo — a rota existe **e** está fechada.

**Nota:** esta **não** é a quarta checagem pendente do `ZONEAMENTO_SP` (toda camada do
bundle tem `.pmtiles` no host). São checagens diferentes, no mesmo arquivo, e nenhuma
substitui a outra.

---

### D-8: Os parâmetros do argon2 são configuração, para a A-001 se resolver sem código

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** a premissa A-001 do DEFINE — o custo do argon2 na VPS de 3,7 GB — só se mede
lá, e a medição pode pedir ajuste.

**Escolha:** `argon2_memoria_kib`, `argon2_iteracoes` e `argon2_paralelismo` no `Settings`,
com os padrões da biblioteca. Medir na VPS é passo do `/build`.

**Racional:** sem isso, "o hash está caro demais" vira mudança de código, PR e redeploy;
com isso, vira uma linha no `.env` e um restart. O projeto já trata número medido como
configuração (`rate_limit_max`, `session_ttl_s`).

**Consequência aceita:** hash gravado com parâmetros antigos continua verificável — o
argon2 guarda os parâmetros dentro do próprio hash. Trocar o custo não invalida senha.

---

### D-9: Sessão de 30 dias, renovada a cada uso, limpa preguiçosamente

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** a premissa A-004 ficou para esta fase.

**Escolha:** `expira_em = now() + 30 dias`, renovado a cada requisição autenticada; a
limpeza das vencidas é um `DELETE` no caminho do login, não um cron.

**Racional:** é um app que o cliente abre semanas depois; sessão curta transformaria o
portal numa cerimônia. Renovar a cada uso faz a expiração medir **inatividade**, que é o que
se quer dizer. E cron seria mais um serviço a instalar e vigiar por cliente, para apagar
algumas dezenas de linhas — o login já toca a tabela e pode varrer no mesmo caminho.

**Consequência aceita:** um cookie roubado vale até 30 dias de inatividade. Mitigação que já
existe: trocar a senha derruba tudo, e o Guilherme reseta a conta por script.

---

## Manifesto de arquivos

### `geo-analytics` — agente

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 1 | `agent/pyproject.toml` | Modificar | Dependência `argon2-cffi` | — |
| 2 | `agent/src/geo_agent/contas.py` | Criar | Fachada de conta e sessão. Espelha `acervo.py` | 1 |
| 3 | `agent/src/geo_agent/sessao.py` | Criar | Middleware `ExigeSessao` + `LIVRES` (allowlist) | 2 |
| 4 | `agent/src/geo_agent/rotas_auth.py` | Criar | As quatro rotas de `/api/auth` | 2, 3 |
| 5 | `agent/src/geo_agent/schemas.py` | Modificar | `Entrar`, `TrocaDeSenha`, `Eu` | — |
| 6 | `agent/src/geo_agent/config.py` | Modificar | `cookie_secure`, `sessao_dias`, argon2, limite do login; e o comentário do `acervo_dsn`, que a D-2 tornou falso | — |
| 7 | `agent/src/geo_agent/main.py` | Modificar | Acervo obrigatório (D-2), monta `Contas`, registra middleware e router | 2, 3, 4, 6 |
| 8 | `agent/.env.example` | Modificar | Entram as novas; **sai `PORTAO_CREDENCIAL`** (8º ponto de toque, não listado no DEFINE) | 6 |
| 9 | `agent/tests/test_contas.py` | Criar | Hash, revogação, expiração, troca de senha derrubando as outras | 2 |
| 10 | `agent/tests/test_sessao.py` | Criar | **Inclui o teste que congela a allowlist** e o de rota nova nascendo fechada | 3 |
| 11 | `agent/tests/test_rotas_auth.py` | Criar | Os 4 endpoints, incluindo AT-002/AT-003 (resposta e tempo) | 4 |

### `geo-analytics` — frontend

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 12 | `web/src/auth/api.ts` | Criar | Cliente das rotas de auth, no formato do `desenho/api.ts` | — |
| 13 | `web/src/auth/sessao.tsx` | Criar | Contexto de sessão + `Portao`, que decide entre tela e app | 12 |
| 14 | `web/src/auth/Entrar.tsx` | Criar | Tela de entrar, com a identidade do cliente (`Simbolo`, `nome`, `subtitulo`) | 13 |
| 15 | `web/src/auth/TrocarSenha.tsx` | Criar | Troca voluntária e a obrigatória do primeiro login | 13 |
| 16 | `web/src/main.tsx` | Modificar | `<Portao><App/></Portao>` | 13 |
| 17 | `web/src/components/Header.tsx` | Modificar | Sair e trocar senha | 13 |
| 18 | `web/src/chat/api.ts` | Modificar | 401 → sessão caiu | 13 |
| 19 | `web/src/desenho/api.ts` | Modificar | 401 → sessão caiu | 13 |
| 20 | `web/src/search/geocode.ts` | Modificar | 401 → sessão caiu (**o terceiro consumidor**, correção 3 do DEFINE) | 13 |
| 21 | `web/src/auth/auth.test.tsx` | Criar | Tela, 401 e a marca do cliente (AT-014) | 12–15 |

### `geo-analytics` — deploy

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 22 | `deploy/Caddyfile.modelo` | Modificar | **Só remoção**: sai o bloco `basicauth` e o `{{#SE PORTAO_USUARIO}}` | — |
| 23 | `deploy/clientes/geo-analytics.env` | Modificar | Saem `PORTAO_USUARIO` e `PORTAO_HASH` | 22 |
| 24 | `deploy/clientes/eb-prime.env` | Modificar | Idem | 22 |
| 25 | `deploy/carregar-cliente.sh` | Modificar | Deixa de exigir as variáveis | 23, 24 |
| 26 | `deploy/vigia-app.sh` | Modificar | Sem credencial; passa a **afirmar o par** (site 200 **e** `/api/chat` 401) e a dizer "ninguém entra" quando o acervo cai | 23, 24 |
| 27 | `deploy/setup-agente-vps.sh` | Modificar | A linha de teste com `curl -u` deixa de existir | — |
| 28 | `deploy/deploy.sh` | Modificar | D-7: `push_app` exige 401 em `/api/auth/eu`; e o comentário sobre `PORTAO_CREDENCIAL` sai | 4 |
| 29 | `deploy/README.md` | Modificar | A receita de cliente novo passa a incluir criar a primeira conta | 31 |

### `servidor-dados-gis`

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 30 | `cargas/app_clientes.sh` | Modificar | `usuario` e `sessao` no schema do cliente, com índices e GRANTs — **fonte única** | — |
| 31 | `scripts/criar-usuario.sh` | Criar | Cria e reseta conta, imprime a senha provisória. É operação, não carga | 30 |
| 32 | `scripts/backup-acervo.sh` | Modificar | O texto embutido passa a dizer que o dump contém hash de senha | 30 |

### `webgis`

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 33 | `scripts/verificar-vps.sh` | Modificar | **Correção 2 do DEFINE**: afirma `/` 200 **e** `/api/chat` 401. Sem isso o portão pode sumir e o verificador aplaudir | 22 |
| 34 | `docs/VPS.md` | Modificar | A seção do portão descreve o portal, não o `basicauth` | 33 |

**E o `AGENTS.md` do `geo-analytics`**, na entrega: a seção "Estado atual" perde a prioridade
declarada e ganha o portal no ar.

---

## Padrões de código

### DDL — as duas tabelas (arquivo 30)

```sql
CREATE TABLE IF NOT EXISTS ${SCHEMA}.usuario (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Guardado em minuscula: e-mail nao diferencia caixa na pratica, e sem isto
    -- "Maria@" e "maria@" viram duas contas com a mesma pessoa atras.
    email         text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
    -- Hash argon2id COM os parametros embutidos. Trocar o custo depois nao
    -- invalida senha existente — e por isso que a D-8 pode deixar isto no .env.
    senha_hash    text NOT NULL,
    -- A senha nasce provisoria e entregue por canal inseguro (WhatsApp). Esta
    -- coluna e o que impede que ela continue valendo depois da primeira entrada.
    trocar_senha  boolean NOT NULL DEFAULT true,
    criado_em     timestamptz NOT NULL DEFAULT now(),
    ultimo_acesso timestamptz
);

CREATE TABLE IF NOT EXISTS ${SCHEMA}.sessao (
    -- sha256 do sid, nunca o sid. O backup-acervo.sh faz pg_dump deste banco: com
    -- o id em claro, o arquivo de backup viraria um molho de sessoes utilizaveis.
    id_hash    text PRIMARY KEY,
    usuario_id uuid NOT NULL REFERENCES ${SCHEMA}.usuario(id) ON DELETE CASCADE,
    criado_em  timestamptz NOT NULL DEFAULT now(),
    -- Renovado a cada requisicao: a expiracao mede INATIVIDADE, nao idade.
    expira_em  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessao_usuario_idx ON ${SCHEMA}.sessao (usuario_id);
CREATE INDEX IF NOT EXISTS sessao_expira_idx  ON ${SCHEMA}.sessao (expira_em);
```

`ON DELETE CASCADE` é o que faz apagar a conta apagar as sessões dela sem o script precisar
saber que a tabela `sessao` existe.

### O middleware que fecha por padrão (arquivo 3)

```python
# A lista e curta de proposito, e o teste em test_sessao.py a congela: aumenta-la
# exige alterar o teste, que e o atrito desejado.
#
# /api/health  — o vigia bate aqui a cada 10 min, nos dois clientes. Fechado, ele
#                alertaria queda do agente para sempre, sem nada estar errado.
# /api/auth/entrar — quem entra ainda nao tem sessao. Obvio, e por isso perigoso
#                de esquecer.
LIVRES = frozenset({"/api/health", "/api/auth/entrar"})


class ExigeSessao(BaseHTTPMiddleware):
    """Middleware, e nao Depends por rota, pela direcao do erro.

    Com Depends, rota nova nasce ABERTA e so fecha se alguem lembrar do decorador —
    e esquecer nao da erro nenhum, publica um endpoint sem portao. Aqui rota nova
    nasce FECHADA e so abre se alguem escrever o caminho em LIVRES.
    """

    async def dispatch(self, request: Request, call_next):
        caminho = request.url.path
        if not caminho.startswith("/api/") or caminho in LIVRES:
            return await call_next(request)

        sid = request.cookies.get(NOME_DO_COOKIE)
        usuario = estado["contas"].usuario_da_sessao(sid) if sid else None
        if usuario is None:
            # Limpa o cookie na recusa: sessao morta que fica no navegador faz o
            # front tentar de novo a cada carga, e o usuario ve piscar.
            resp = JSONResponse({"detail": "Sessão expirada."}, status_code=401)
            resp.delete_cookie(NOME_DO_COOKIE, path="/")
            return resp

        request.state.usuario = usuario
        return await call_next(request)
```

### Entrar, sem contar se a conta existe (arquivo 4)

```python
@router.post("/entrar")
def entrar(dados: Entrar, request: Request, response: Response) -> Eu:
    ip = _client_ip(request)
    if not estado["limiter_login"].allow(ip):
        raise _limite_estourado(estado["limiter_login"], ip)

    usuario = estado["contas"].por_email(dados.email)
    if usuario is None:
        # Verificar contra um hash de descarte, e nao devolver logo. Sem isto a
        # recusa por conta inexistente volta em microssegundos e a por senha errada
        # custa o argon2 inteiro — e o RELOGIO conta o que a mensagem esconde.
        _verificar(HASH_DE_DESCARTE, dados.senha)
        raise HTTPException(status_code=401, detail=MSG_CREDENCIAL)
    if not _verificar(usuario.senha_hash, dados.senha):
        raise HTTPException(status_code=401, detail=MSG_CREDENCIAL)

    sid, expira = estado["contas"].abrir_sessao(usuario.id)
    response.set_cookie(
        NOME_DO_COOKIE, sid,
        httponly=True,
        secure=settings.cookie_secure,  # D-6: falso so em desenvolvimento
        samesite="lax",
        path="/",
        expires=expira,
    )
    return Eu(email=usuario.email, trocar_senha=usuario.trocar_senha)
```

### Sair e trocar senha — a revogação que o AT-005 e o AT-006 cobram

```python
def sair(self, sid: str) -> None:
    """DELETE, nao UPDATE de flag: a linha some, e cookie antigo nao acha nada."""
    self._exec("DELETE FROM {}.sessao WHERE id_hash = %s", (_hash(sid),))

def trocar_senha(self, usuario_id: str, novo_hash: str, sid_atual: str) -> None:
    """Derruba as OUTRAS sessoes, mantendo esta.

    Quem troca a senha porque desconfia de vazamento espera exatamente isto: o
    intruso cai, e quem trocou continua trabalhando. Deslogar tambem quem trocou
    seria seguro e hostil.
    """
    with self.con.transaction():
        self._exec("UPDATE {}.usuario SET senha_hash = %s, trocar_senha = false WHERE id = %s",
                   (novo_hash, usuario_id))
        self._exec("DELETE FROM {}.sessao WHERE usuario_id = %s AND id_hash <> %s",
                   (usuario_id, _hash(sid_atual)))
```

### A checagem de ordem no deploy (arquivo 28)

```bash
# O portao novo entra ANTES de o velho sair. Publicar o bundle novo contra um
# agente que ainda nao sabe emitir sessao deixa a tela de entrar batendo em 404.
# 401 e o unico resultado que prova as duas coisas: a rota existe E esta fechada.
cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMINIO/api/auth/eu")"
[ "$cod" = "401" ] || {
  echo "✗ /api/auth/eu respondeu $cod (esperado 401) — rode 'make ship-ia' e reinicie o agente ANTES do app" >&2
  exit 1
}
```

### O verificador que passa a afirmar o par (arquivo 33)

```bash
# ANTES: "o .env define PORTAO_USUARIO, entao o site tem de responder 401".
# Sem a variavel, essa regra passaria a esperar 200 de todo mundo — e 200 e
# exatamente o que um site COM o portao removido por engano responde. O
# verificador aplaudiria o defeito que ele existe para achar.
#
# DEPOIS: afirma o PAR. Site aberto e /api fechado sao duas verdades, e so as
# duas juntas descrevem o estado certo.
site="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$dominio/")"
api="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST "https://$dominio/api/chat")"

[ "$site" = "200" ] || erro "$dominio deveria servir o app (200) e respondeu $site"
[ "$api" = "401" ]  || erro "$dominio: /api/chat respondeu $api sem sessão — o portão sumiu"
```

---

## Fluxo de dados

```text
1. PRIMEIRO ACESSO
   Guilherme ──► scripts/criar-usuario.sh eb-prime maria@empresa.com
                 └─► INSERT usuario (senha provisória, trocar_senha = true)
                 └─► imprime a senha na tela; entrega por fora (WhatsApp)

2. ENTRADA
   maria ──► GET /            ──► Caddy ──► file_server        200  (sem agente)
         ──► GET /api/auth/eu ──► ExigeSessao                   401
         ──► tela de entrar (marca do cliente, vinda de web/src/clientes/<id>.ts)
         ──► POST /api/auth/entrar ──► argon2 ──► INSERT sessao ──► Set-Cookie
         ──► trocar_senha = true ──► tela de troca, obrigatória
         ──► POST /api/auth/senha ──► UPDATE + DELETE das outras sessões
         ──► o app abre

3. USO
   toda chamada a /api/* ──► ExigeSessao ──► SELECT ... WHERE id_hash = sha256(sid)
                                          ──► UPDATE expira_em = now() + 30d
                                          ──► segue para chat / desenhos / geocode

4. SAÍDA
   maria ──► POST /api/auth/sair ──► DELETE da linha ──► cookie apagado
         o cookie capturado antes agora acha nada: 401 (AT-005)

5. O VIGIA, A CADA 10 MIN, SEM CONTA NENHUMA
   GET /api/health   ──► LIVRES ──► 200 (ou 503 se o cluster caiu)
   GET /             ──► 200
   POST /api/chat    ──► 401   ← o par que prova que o portão está lá
```

---

## Pontos de integração

| Ponto | Direção | Contrato |
|-------|---------|----------|
| Caddy → agente | `/api/*` | Nenhuma mudança de diretiva; só a remoção do `basicauth` |
| Agente → `app_clientes` | psycopg, papel do cliente | Mesma conexão do `Acervo` (mesmo banco, mesmo papel) |
| Vigia → agente | `/api/health` (livre) e `/api/chat` (401 esperado) | Sem credencial |
| `verificar-vps.sh` → sites | `/` e `/api/chat` | O par |
| `deploy.sh push_app` → VPS | `/api/auth/eu` | 401 obrigatório antes de publicar o bundle |
| Front → agente | cookie `sid` | First-party (mesmo host); sem CORS |

---

## Estratégia de teste

| Tipo | Escopo | Ferramenta | Cobre |
|------|--------|------------|-------|
| Unidade | `contas.py` — hash, revogação, expiração, cascade | `pytest` (`cd agent && uv run pytest`) | AT-005, AT-006, AT-013 |
| Unidade | `sessao.py` — **allowlist congelada**, rota nova nasce fechada | `pytest` | AT-009, AT-010, D-1 |
| Unidade | `rotas_auth.py` — 4 rotas; AT-002 e AT-003 no corpo **e no tempo** | `pytest` | AT-001..004, AT-011 |
| Unidade | Front — tela, 401, marca do cliente | `vitest` (`docker compose exec web npm test`) | AT-014 |
| Integração | Contra `app_clientes` local; pula sem `ACERVO_DSN`, como os testes do acervo já fazem | `pytest` | AT-012 |
| Manual, na VPS | **Parar o agente** e navegar: mapa, basemap, tiles, busca | navegador + `curl` | **AT-008 (a §9)** |
| Manual, na VPS | Medir o custo do argon2 | `time` no shell do agente | **A-001** |
| Script | `verificar-vps.sh` e o vigia | os próprios | AT-015 |
| `grep` | `PORTAO_` nos dois repositórios | `grep -rn` | AT-017 |
| Build | `caddy validate` no arquivo renderizado | `make ensaio` | AT-016 |

**O AT-008 não tem substituto automatizado.** Ele é a promessa da §9, e a única forma
honesta de verificá-la é parar o processo e olhar.

---

## Tratamento de erro

| Situação | Resposta | Por quê |
|----------|----------|---------|
| Sem cookie, ou sessão vencida/revogada | **401** + cookie apagado | O front sabe voltar para a tela de entrar |
| Senha errada **ou** conta inexistente | **401**, corpo e tempo idênticos | D-5 |
| Excesso de tentativas por IP | **429** + `Retry-After` | Mesmo formato do `/api/chat` |
| `app_clientes` fora do ar durante o login | **503**, "tente de novo", não 500 | Mesma distinção que o `AcervoIndisponivel` já faz: 500 convida a desistir, 503 diz que o banco reiniciou |
| `ACERVO_DSN` ausente no boot | **o processo não sobe** | D-2 |
| Senha nova abaixo do mínimo | **422** | É erro de formulário, não de servidor |

---

## Configuração

```bash
# agent/.env  (novas)
COOKIE_SECURE=true          # false só em desenvolvimento (D-6)
SESSAO_DIAS=30              # D-9
LOGIN_RATE_LIMIT_MAX=10     # tentativas por IP
LOGIN_RATE_LIMIT_WINDOW_S=300
ARGON2_MEMORIA_KIB=65536    # medir na VPS antes de fixar (D-8, A-001)
ARGON2_ITERACOES=3
ARGON2_PARALELISMO=4

# agent/.env.<cliente>
ACERVO_DSN=...              # deixa de ser opcional (D-2)
# PORTAO_CREDENCIAL         ← REMOVIDO
```

---

## Segurança

- **Cookie:** `HttpOnly` (JS não lê), `Secure` (D-6), `SameSite=Lax`, `Path=/`.
- **A CSP não muda.** A tela é do mesmo `self`, sem script ou fonte externos novos.
- **O banco nunca guarda `sid` em claro** (D-4) — nem no dump.
- **O isolamento entre clientes continua sendo do Postgres.** O papel do cliente 2 não
  alcança o schema do 1; nenhuma linha de Python decide isso.
- **A senha provisória viaja por canal inseguro de propósito**, e é o `trocar_senha` que
  limita a janela — ela só serve uma vez.
- **O backup do acervo passa a ser material sensível.** Contém hash de senha. O texto do
  `backup-acervo.sh` (arquivo 32) passa a dizer isso onde quem roda vai ler.
- **O `/api/health` continua aberto**, e o que ele revela é que existe um agente e se o banco
  responde — o mesmo que já revelava atrás de um `basic_auth` compartilhado por dezenas.

---

## Observabilidade

- O `ContextoDaRequisicao` continua sendo o primeiro middleware: um 401 do `ExigeSessao`
  sai com `X-Request-ID` e duração, como qualquer outra resposta.
- **Logar tentativa de login com falha** (IP e e-mail), sem a senha. É o que permite
  distinguir "o cliente esqueceu a senha" de "alguém está tentando entrar".
- **Nunca logar o `sid`**, nem inteiro nem em prefixo.
- O `/api/health` ganha leitura nova: `acervo: erro` passa a significar também "ninguém
  consegue entrar", e o vigia deve dizer isso na mensagem que envia (D-3).

---

## Ordem de execução (não pode inverter)

1. **Backup:** `backup-acervo.sh --origem vps` — o acervo vai ganhar tabela.
2. `cargas/app_clientes.sh` nos dois clientes, local e VPS (idempotente: cria estrutura,
   não toca linha).
3. `scripts/criar-usuario.sh` — as contas de cada cliente.
4. `make ship-ia` + **restart** (terminal do Guilherme) — o agente passa a emitir sessão.
   Neste ponto o `basicauth` **ainda está de pé**: portão novo por dentro, velho por fora.
5. Verificar: `/api/auth/eu` responde 401.
6. Publicar o bloco de Caddy sem `basicauth` + `make ship-app`. O `push_app` só deixa
   passar se o passo 5 estiver verdadeiro (D-7).
7. `verificar-vps.sh` — afirma o par nos dois clientes.
8. **Conferir os tiles da VPS antes de qualquer `ship-app`** — o `ZONEAMENTO_SP` está na
   `main` e fora do ar de propósito.

---

## Histórico de revisão

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-06 | design | Versão inicial, a partir do DEFINE e da emenda de 2026-09-06 à §9 |

---

## Próximo passo

**Pronto para:** `/build .claude/sdd/features/DESIGN_PORTAL_LOGIN.md`
