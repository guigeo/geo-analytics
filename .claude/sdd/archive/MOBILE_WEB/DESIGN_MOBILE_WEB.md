# DESIGN: MOBILE_WEB

## Decisão 1 — duas composições, um estado

`App` continua dono do estado de mapa, camadas, chat, seleção, sessão e acervo. Em tela
larga ele monta a grade existente; em tela móvel monta uma casca própria. Assim a lógica de
negócio não se duplica e o desktop não recebe CSS que altere sua geometria.

## Decisão 2 — painel móvel é sobreposto

O mapa é a base do celular. Camadas e chat abrem como painel ancorado ao rodapé, com botão
de fechar e fundo que não desloca o canvas. A barra inferior escolhe qual painel está ativo.

## Decisão 3 — cabeçalho móvel prioriza localização

Marca e busca formam a barra superior. As ferramentas do desktop ficam no painel “Mais”;
desenho e medição aparecem indisponíveis nesta primeira versão, em vez de aceitarem um gesto
que o MVP não valida.

## Manifesto inicial

| Arquivo | Ação | Propósito |
|---|---|---|
| `web/src/App.tsx` | Modificar | Seleciona composição e compartilha estado. |
| `web/src/layout/MobileLayout.tsx` | Criar | Mapa, barra inferior e painéis móveis. |
| `web/src/layout/DesktopLayout.tsx` | Criar | Extrai a grade desktop sem mudar comportamento. |
| `web/src/hooks/use-mobile.ts` | Criar | Observa breakpoint com `matchMedia`. |
| `web/src/components/Header.tsx` | Modificar | Variante compacta ou ações recebidas pelo layout. |
| `web/src/styles.css` | Modificar | Altura dinâmica e área segura. |
| testes dos layouts | Criar | Congela os fluxos de 375 px e desktop. |

## Validação

Vitest cobre a troca de composição e os fluxos de painel. O portão do frontend cobre tipos,
lint, formato, testes e build. A validação visual usa o servidor local e um aparelho físico.
