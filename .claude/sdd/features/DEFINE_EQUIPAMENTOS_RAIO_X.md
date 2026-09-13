# DEFINE: Equipamentos no Raio-X

## Metadata

| Atributo | Valor |
|---|---|
| Feature | `EQUIPAMENTOS_RAIO_X` |
| Data | 2026-09-13 |
| Status | Pronto para build |
| Clareza | 15/15 |

## Problema e objetivo

O Raio-X descreve população, renda, saneamento e regulação, mas não informa a presença de
endereços de ensino e saúde. O CNEFE 2022 já contém 17.337 registros de ensino e 18.365 de
saúde nos 37 municípios carregados no lab, com coordenada e nome preenchido.

O relatório deve contar por ponto os endereços dos dois tipos dentro da área desenhada,
sem rateio e sem LLM, declarando fonte, período, cobertura e qualidade da coordenada.

## Critérios de sucesso

- A contagem dentro do desenho é uma interseção exata de pontos PostGIS.
- Zero medido dentro da cobertura nunca é confundido com ausência de cobertura.
- Cobertura parcial e coordenadas dos níveis 3–6 geram avisos junto dos números.
- A tela usa “endereços de estabelecimentos”, pois o CNEFE não distingue público/privado
  nem garante uma unidade por registro.
- O Raio-X de 49,949 km² continua abaixo de 1 segundo com cache quente na VPS.

## Testes de aceitação

| ID | Cenário | Resultado esperado |
|---|---|---|
| AT-001 | Área coberta com pontos | Contagens separadas de ensino e saúde |
| AT-002 | Área coberta sem pontos | Dois zeros medidos, bloco disponível |
| AT-003 | Área fora dos 37 municípios | Bloco indisponível, nunca dois zeros |
| AT-004 | Área cruza o limite da cobertura | Contagens e percentual coberto com aviso |
| AT-005 | Ponto com `nv_geo_coord >= 3` | Aviso quantifica coordenadas imprecisas |
| AT-006 | Transporte lab → Mac → VPS | Contagem por tipo e nível fecha exatamente |
| AT-007 | Área de 49,949 km² na VPS | Contrato completo responde em menos de 1 s quente |

## Fora de escopo

- Mapa ou tile de pontos; classificação público/privado; distância ao equipamento mais
  próximo; limpeza dos nomes; comércio; obras; agregação H3; comparação entre áreas.

## Contexto técnico

O dado universal e as cargas reexecutáveis ficam em `../servidor-dados-gis`; consulta,
contrato e interface ficam neste repositório. Não há recurso novo de infraestrutura nem
mudança arquitetural no `webgis`. O site institucional só é atualizado depois da feature
estar publicada.

## Premissas validadas

- Ambos os tipos cobrem os mesmos 37 municípios.
- O recorte tem 35.702 linhas e cerca de 9 MB sem índices.
- Há 38 endereços presentes nos dois tipos; por isso não existe cartão de “total”.
- Ensino tem 236 coordenadas imprecisas; saúde, 249 (cerca de 1,36% em cada tipo).

