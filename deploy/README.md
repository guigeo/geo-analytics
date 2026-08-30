# Deploy — as aplicações derivadas na VPS

Site **estático** (app MapLibre) mais o agente de IA, servidos pelo **Caddy**
(HTTPS automático).

> **Desde 2026-08-30 o deploy é por cliente** (fase 6 do passo 5 do ADR-0001 do
> `webgis`). Tudo que era do cliente 1 — domínio, caminhos, unit do systemd,
> porta e portão — mora em `deploy/clientes/<id>.env`, e `CLIENTE` escolhe:
>
> ```bash
> make ensaio                      # ENSAIA o deploy sem tocar a VPS
> make ensaio CLIENTE=eb-prime
> make ship                        # cliente 1 (o de sempre)
> make ship CLIENTE=eb-prime       # cliente 2
> ```
>
> O texto histórico abaixo descreve a primeira subida do cliente 1, em junho de
> 2026. Onde ele diz `/var/www/geo`, `geo-intelligence.averisen.com` ou
> `geo-agent`, leia "o valor do `deploy/clientes/<id>.env` daquele cliente".

```text
navegador ──HTTPS──> Caddy (VPS Hetzner) ──> /var/www/geo  (app)
                                          └──> /var/www/geo/tiles/*.pmtiles
```

## Ambiente real (apurado em 2026-06-28)

| Item | Valor |
|------|-------|
| VPS  | Hetzner `91.99.176.140`, Ubuntu 26.04, 28 GB livres |
| SSH  | `ssh hetzner-gramos` (usuário `gramos`; `sudo` pede senha) |
| Caddy| **já instalado (2.6.2)**, servindo `invest-certo-dash.averisen.com` |
| DNS  | `averisen.com` no **Cloudflare** |
| Alvo | `geo-intelligence.averisen.com` |

> ⚠️ O Caddy é **compartilhado**: a config nova é **acrescentada**, nunca substitui o arquivo.

---

## Fase 2 — DNS no Cloudflare

No painel do Cloudflare → `averisen.com` → **DNS** → **Add record**:

| Campo | Valor |
|-------|-------|
| Type  | `A` |
| Name  | `geo-intelligence` |
| IPv4  | `91.99.176.140` |
| Proxy | **DNS only** (nuvem **cinza**, não laranja) |
| TTL   | Auto |

> A nuvem **cinza** é importante: deixa o Caddy emitir o certificado Let's Encrypt
> direto (o site existente já funciona assim). Proxy laranja fica pra depois (Fase 7).

Confira (na sua máquina):
```bash
dig +short geo-intelligence.averisen.com    # tem que retornar 91.99.176.140
```
✅ **Pronto quando** o `dig` devolve `91.99.176.140`.

---

## Fase 3 — Pasta do site na VPS  (você roda — tem `sudo`)

```bash
ssh hetzner-gramos
sudo mkdir -p /var/www/geo/tiles
sudo chown -R gramos:gramos /var/www/geo   # p/ o rsync escrever sem sudo
exit
```
✅ **Pronto quando** `/var/www/geo` existe e é do `gramos`.
*(Caddy já instalado e portas 80/443 já abertas — nada a fazer aqui.)*

---

## Fase 4 — Enviar app + tiles  (eu rodo, na sua máquina)

```bash
VPS_HOST=hetzner-gramos ./deploy/deploy.sh        # build + app do cliente 1
CLIENTE=eb-prime ./deploy/deploy.sh               # o mesmo, para o cliente 2
# alvos: app | ia | all   (tiles não: são do `webgis`, `make ship-tiles` de lá)
```
O `rsync` usa o atalho `hetzner-gramos` do seu `~/.ssh/config` (chave, sem senha).
A 1ª remessa dos tiles (~2 GB) depende do seu **upload**; o rsync é incremental e retoma se cair.

✅ **Pronto quando** `ssh hetzner-gramos 'ls /var/www/geo'` mostra `index.html`, `assets/`, `tiles/`.

---

## Fase 5 — Acrescentar o site ao Caddy  (você roda — tem `sudo`)

Desde a fase 6 isto não é mais colar à mão: o bloco é **renderizado** do modelo
versionado, e o `setup-agente-vps.sh` acrescenta, valida e recarrega — guardando
um `.bak` e revertendo sozinho se a config não validar. Ele **não mexe** num bloco
que já existe; atualizar é outra operação, e ela mora em `webgis/docs/VPS.md`.

```bash
# na sua máquina, depois de `CLIENTE=<id> ./deploy/deploy.sh ia`
ssh -t hetzner-gramos 'sudo bash ~/projects/eb-prime/deploy/setup-agente-vps.sh eb-prime'

# para ver o que ele vai escrever, antes:
./deploy/renderizar.sh deploy/Caddyfile.modelo eb-prime

# acompanhe a emissão do certificado
ssh hetzner-gramos 'journalctl -u caddy -f'
```
✅ **Pronto quando** o log mostra o certificado de `geo-intelligence.averisen.com` emitido, sem erro.

---

## Fase 6 — Validar

```bash
curl -I https://geo-intelligence.averisen.com     # 200 OK + HTTPS
```
Abra **https://geo-intelligence.averisen.com**:
- mapa + basemap carregam;
- ligue as camadas (UF, Município, Antenas de telefonia…) → tiles vêm de `/tiles/*`;
- clique numa feição → painel de atributos; teste o toggle 🌗.

Se algo falhar, **DevTools (F12) → Network**: `/tiles/*.pmtiles` em 404 (não enviado)
ou 403 (permissão da pasta).

---

## Fluxo de trabalho (dia a dia)

```bash
make dev       # desenvolve com HMR em :5173
make preview   # valida o build de produção em :8080 (Caddy local = VPS)
make ship-app  # manda só o frontend  (ou: make ship / make ship-tiles)
```

> **Sempre rode `make preview` antes de `ship`** — é a única forma de ver, localmente,
> exatamente o que o Caddy da VPS vai servir (Range nos tiles, compressão só fora de
> `/tiles`) — e, desde a fase 5, o **portão**: o preview pede credencial
> (`previa` / `previa-local`). O `deploy/Caddyfile.local` espelha o
> comportamento do `deploy/Caddyfile.modelo`.

## Redeploys futuros
- **Só código:** `make ship-app [CLIENTE=<id>]`  (= `CLIENTE=<id> ./deploy/deploy.sh app`)
- **Só o agente:** `make ship-ia [CLIENTE=<id>]`, e depois o `restart` do unit daquele
  cliente (pede senha do sudo — passo do Guilherme, num terminal de verdade).
- **Re-gerou tiles:** `make ship-tiles` **no repositório `webgis`** — o host de tiles é
  compartilhado e não pertence a nenhuma aplicação.
- **Antes de qualquer um deles:** `make ensaio [CLIENTE=<id>]`, que faz o caminho
  inteiro contra um diretório local, sem tocar a VPS.

## Otimizações opcionais (Fase 7)
- **Encolher o basemap** (z13→z12): ~1.4 GB → ~400 MB. `pipeline/datasets.yaml` (`basemap.maxzoom`)
  + `docker compose run --rm pipeline build --basemap-only`.
- **Setor censitário** (593 MB) é a 2ª camada mais pesada — avalie se entra no deploy público.
- **Proxy do Cloudflare** (nuvem laranja) p/ CDN/DDoS — exige ajuste de SSL (Full) e cache.
