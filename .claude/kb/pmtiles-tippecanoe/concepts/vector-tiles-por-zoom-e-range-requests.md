<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Vector tiles por-zoom e HTTP range requests

> **Propósito**: Entender por que detalhar tiles não polui o zoom-out e por que um arquivo grande não pesa na banda por usuário.
> **Confiança**: 0.95
> **Validado**: 2026-06-27

## Visão geral

Dois fatos definem o trade-off de tamanho de tiles e moldam a decisão de `maxzoom`:

1. **Tiles são por-zoom.** Cada nível de zoom tem seu próprio conjunto de tiles, com
   geometria já simplificada para aquela escala. Subir o `maxzoom` adiciona detalhe
   **apenas** nos níveis próximos; a visão ampla continua simples automaticamente.
   Logo, "detalhe ao aproximar" não significa "poluição ao afastar".

2. **PMTiles é lido por HTTP range requests.** O cliente baixa só os bytes dos tiles do
   viewport/zoom atual, não o arquivo inteiro. Um `.pmtiles` de vários GB **não** vira
   um download de vários GB por usuário — cada um puxa só o que vê.

## O padrão

```text
maxzoom alto  ->  + detalhe no zoom próximo
              ->  + tamanho do arquivo (custo de DISCO e tempo de geração)
              ->  banda POR USUÁRIO ~inalterada (range requests)
```

## Referência rápida

| Sobe `maxzoom` | Efeito |
|----------------|--------|
| Detalhe no zoom próximo | aumenta |
| Visão ampla (zoom-out) | inalterada |
| Tamanho do `.pmtiles` | cresce (pode ir a GB) |
| Banda por acesso | ~inalterada |

## Erros comuns

### Errado

> "O basemap detalhado ficou com 1+ GB, então cada usuário vai baixar 1 GB." — falso.

### Certo

> O cliente baixa só os tiles do viewport via range requests. O 1 GB é custo de
> **disco** no servidor e de **tempo de geração**, não de banda por usuário.

## Relacionados

- [geoparquet-para-pmtiles](../patterns/geoparquet-para-pmtiles.md)
- [extrair-recorte-basemap](../patterns/extrair-recorte-basemap.md)
