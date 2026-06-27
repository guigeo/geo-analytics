# geo-analytics — Frontend do mapa

Mapa interativo (MapLibre GL JS) que renderiza as camadas geográficas do Brasil e
as antenas de telefonia a partir de **PMTiles** servidos estaticamente, sobre um
basemap **Protomaps** auto-hospedado. 100% estático — sem backend em runtime.

## Pré-requisitos

- Os tiles gerados pelo ETL em `web/public/tiles/` (ver [`../pipeline/README.md`](../pipeline/README.md)).
  Sem eles, o mapa carrega vazio.
- **Docker** (recomendado) ou Node.js 20+ instalado.

## Uso

### Via Docker (recomendado — não exige Node na máquina)

```bash
# Na raiz do repositório:
docker compose up web        # http://localhost:5173 (faz npm install na 1a vez)
docker compose down          # parar
```

### Nativo (se tiver Node 20+)

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # gera web/dist/ (estático, pronto para nginx/Caddy no VPS)
npm run typecheck  # checagem de tipos
```

## Funcionalidades (Fase 1)

- Pan/zoom sobre basemap Protomaps (tema claro).
- 5 camadas alternáveis (painel esquerdo): UF, Município, Bairro, Setor censitário, Antenas.
  - Pesadas (Bairro, Setor) começam **desligadas** por performance.
- Clique em uma feição → atributos no painel direito.
- Espaço reservado à direita para o **chat com IA (Fase 2)**.

## Estrutura

```text
web/
├── public/tiles/          # *.pmtiles (gerados pelo ETL)
├── src/
│   ├── App.tsx            # layout + estado (visibilidade, seleção)
│   ├── lib/pmtiles.ts     # registra o protocolo pmtiles://
│   ├── map/
│   │   ├── basemap.ts     # source + layers do Protomaps
│   │   ├── layers.ts      # definição das 5 camadas de dados
│   │   └── MapView.tsx    # componente MapLibre + clique
│   └── panels/
│       ├── LayerPanel.tsx     # toggle de camadas
│       └── AttributePanel.tsx # atributos + placeholder do chat
```

## Notas

- As **fontes/sprites** do tema vêm dos assets públicos do Protomaps
  (`protomaps.github.io`) — a única dependência externa em runtime. Podem ser
  auto-hospedadas no futuro para operação 100% offline.
- Adicionar uma camada nova: gerar o `.pmtiles` no ETL e adicionar uma entrada em
  [`src/map/layers.ts`](./src/map/layers.ts).
