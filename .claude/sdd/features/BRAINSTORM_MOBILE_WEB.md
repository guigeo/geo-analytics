# BRAINSTORM: MOBILE_WEB

> A aplicação passa a oferecer uma experiência útil em celular sem criar um segundo app.

## Decisão selecionada

**Uma composição responsiva da mesma aplicação.** O desktop mantém as três colunas; no
celular, o mapa ocupa a tela e camadas, chat e ferramentas aparecem em painéis sobre ele.
Tiles, MapLibre, agente, sessão e acervo continuam sendo os mesmos.

## Escopo confirmado

- Entram no MVP: login, mapa, busca, camadas, chat e leitura dos desenhos salvos.
- Desenho e medição permanecem disponíveis no desktop e ficam fora do primeiro fluxo móvel.
- Não haverá app nativo, URL alternativa, API nova nem mudança de infraestrutura.

## Validação planejada

- Navegador em 375 × 812, 393 × 852 e 768 × 1024, mais desktop em 1440 px.
- Celular físico na rede local para toque, teclado virtual e rotação.
- Portão completo do frontend e `make preview` antes de qualquer publicação.

## Próximo passo

Pronto para `DEFINE_MOBILE_WEB.md`.
