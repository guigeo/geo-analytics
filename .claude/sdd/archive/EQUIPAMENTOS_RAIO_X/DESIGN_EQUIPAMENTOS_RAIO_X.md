# DESIGN: Equipamentos no Raio-X

> ✅ Publicada e arquivada em 2026-09-13.

## Arquitetura

```text
CNEFE bruto no lab
  → derivado de pontos + cobertura
  → staging e validação no Mac
  → réplica de leitura na VPS
  → GeoQuery (interseção exata)
  → contrato RaioX determinístico
  → cards de Ensino e Saúde
```

## Decisões

1. **Pontos, não H3.** O recorte tem só ~9 MB e a geometria pontual preserva a contagem
   exata na borda do desenho.
2. **Cobertura é dado separado.** Uma tabela com os 37 códigos municipais permite separar
   zero real, cobertura parcial e indisponibilidade mesmo que um município tenha zero ponto.
3. **Sem total combinado.** Trinta e oito endereços aparecem nas duas espécies; somar os
   cartões produziria uma terceira métrica ambígua.
4. **Qualidade viaja com o número.** Níveis 3–6 são contados na consulta e viram aviso no
   mesmo bloco, conforme a regra 8 do ADR-0001.
5. **Sem tile nesta fase.** A capacidade é do relatório, não uma nova camada do mapa.

## Contrato

`RaioX.equipamentos` contém `disponivel`, `cobertura_pct`, `ensino`, `saude` e a
proveniência comum. Cada indicador contém `enderecos` e `coordenadas_imprecisas`.
Cobertura zero deixa o bloco indisponível; cobertura entre zero e 100% mantém as contagens
e acrescenta aviso; cobertura integral aceita zero como valor medido.

## Manifesto

| Componente | Alteração |
|---|---|
| `servidor-dados-gis/cargas/derivado_cnefe_equipamentos.sh` | Derivação reexecutável no lab |
| `servidor-dados-gis/scripts/lab-trazer-cnefe-equipamentos.sh` | Transporte atômico ao Mac |
| `servidor-dados-gis/scripts/vps-publicar-cnefe-equipamentos.sh` | Réplica atômica na VPS |
| `query/src/geo_query/queries.py` | Contagem, cobertura e montagem do bloco |
| `agent/src/geo_agent/schemas.py` | Contrato Pydantic |
| `web/src/raiox/api.ts` | Espelho TypeScript |
| `web/src/raiox/PaginaRaioX.tsx` | Cards e ressalvas imprimíveis |
| testes e documentação | Aceitação, linhagem e operação |

## Verificação

- `bash -n` e verificação estática no repositório de dados.
- Execução real da derivação no lab; transporte com assinaturas por tipo e nível.
- Testes de integração PostGIS para cobertura, zero e interseção.
- Ruff/pytest de query e agente; portão completo do frontend.
- Medição quente na VPS no desenho de 49,949 km² antes do deploy.
