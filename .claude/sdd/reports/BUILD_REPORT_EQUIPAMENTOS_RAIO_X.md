# BUILD REPORT: Equipamentos no Raio-X

## Metadata

| Atributo | Valor |
|---|---|
| Feature | `EQUIPAMENTOS_RAIO_X` |
| Data | 2026-09-13 |
| Status | Pronto para publicação |

## Entregas

- Derivado reexecutável de 35.702 pontos no lab, com cobertura explícita de 37 municípios.
- Transporte lab → Mac → VPS por staging, assinatura por espécie/qualidade e troca atômica.
- Consulta pontual exata, com zero, cobertura parcial e indisponibilidade distintos.
- Contrato Pydantic/TypeScript e bloco imprimível com cards de Ensino e Saúde.
- Regra do agente para não chamar os endereços de equipamentos públicos.

## Verificação

| Verificação | Resultado |
|---|---|
| Derivação no lab | 17.337 ensino; 18.365 saúde; 37 municípios |
| Transporte e réplica | Contagens, assinatura, privilégios e linhagem conferidos |
| Query real | 14 testes contra PostGIS local |
| Query unitária | 7 passaram; 61 integrações puladas sem DSN |
| Agente | 84 passaram; 88 pulados; 34 benchmarks fora do portão |
| Frontend | Prettier, ESLint, TypeScript, 270 testes e build passaram |
| Dados | Verificador estático e auditoria de dados passaram |

## Ocorrências

- O primeiro SQL de cobertura revelou que `LEAST(100, NULL)` no PostgreSQL retorna 100;
  o `COALESCE` foi movido para dentro de `LEAST`, e Brasília passou a responder fora da
  cobertura em vez de zero medido.
- Um teste antigo ainda usava o município inteiro de São Paulo depois da adoção do teto de
  50 km²; ele passou a usar um buffer denso sob o limite e preservou a intenção original.

## Estado

Código e dado estão prontos. Falta medir o contrato completo na VPS, publicar agentes e
frontends e então arquivar a feature.

