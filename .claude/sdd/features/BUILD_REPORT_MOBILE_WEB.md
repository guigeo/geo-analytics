# BUILD REPORT: MOBILE_WEB

## Resultado

O frontend ganhou uma composição móvel sem API, tile, agente ou alteração de deploy. Em tela
de toque ou abaixo de 768 px, o mapa ocupa a área principal; Camadas, Chat e Mais aparecem
em gavetas sobre ele. Desktop mantém a grade anterior de três colunas.

## Arquivos entregues

| Arquivo | Resultado |
|---|---|
| `web/src/App.tsx` | Escolhe a composição e mantém um único estado para as duas. |
| `web/src/layout/MobileLayout.tsx` | Barra inferior e gavetas móveis. |
| `web/src/hooks/use-mobile.ts` | Breakpoint e detecção de toque, inclusive em paisagem. |
| `web/src/components/Header.tsx` | Cabeçalho compacto com busca. |
| `web/src/components/SearchBox.tsx` | Busca visível na composição móvel. |
| `web/src/layout/MobileLayout.test.tsx` | Cobertura de mapa persistente e troca de gavetas. |

## Validação local

| Portão | Resultado |
|---|---|
| `npm run format:check` | passou |
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm run test` | 233 testes passaram |
| `npm run build` | passou |
| `curl -I http://127.0.0.1:5173/` | 200, Vite local respondeu |

## Pendência antes de publicar

Conferir o fluxo no celular físico: teclado virtual, toque, rotação e aparência do mapa com
tiles reais. Nenhum `ship` foi executado.
