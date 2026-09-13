import { inteiro, percentual, reais } from "./formato";
import type { RaioX } from "./api";

type Linha = {
  rotulo: string;
  primeiro: string;
  segundo: string;
};

/**
 * Comparar não calcula uma nota nem uma recomendação: deixa os dois diagnósticos
 * determinísticos lado a lado. Assim a escolha continua sendo de quem conhece o negócio.
 */
export function Comparador({
  primeiroNome,
  primeiro,
  segundoNome,
  segundo,
}: {
  primeiroNome: string;
  primeiro: RaioX;
  segundoNome: string;
  segundo: RaioX;
}) {
  const linhas: Linha[] = [
    {
      rotulo: "Área",
      primeiro: `${primeiro.escala.area_km2.toFixed(2)} km²`,
      segundo: `${segundo.escala.area_km2.toFixed(2)} km²`,
    },
    {
      rotulo: "População",
      primeiro: inteiro(primeiro.escala.populacao),
      segundo: inteiro(segundo.escala.populacao),
    },
    {
      rotulo: "Domicílios",
      primeiro: inteiro(primeiro.escala.domicilios_ocupados),
      segundo: inteiro(segundo.escala.domicilios_ocupados),
    },
    {
      rotulo: "Densidade",
      primeiro: `${inteiro(primeiro.escala.densidade_hab_km2)} hab/km²`,
      segundo: `${inteiro(segundo.escala.densidade_hab_km2)} hab/km²`,
    },
    {
      rotulo: "Renda média",
      primeiro: reais(primeiro.perfil.renda_media),
      segundo: reais(segundo.perfil.renda_media),
    },
    {
      rotulo: "Classe A",
      primeiro: percentual(primeiro.classe_social.pct_a),
      segundo: percentual(segundo.classe_social.pct_a),
    },
    {
      rotulo: "Classe B",
      primeiro: percentual(primeiro.classe_social.pct_b),
      segundo: percentual(segundo.classe_social.pct_b),
    },
    {
      rotulo: "Endereços de ensino",
      primeiro: equipamento(primeiro, "ensino"),
      segundo: equipamento(segundo, "ensino"),
    },
    {
      rotulo: "Endereços de saúde",
      primeiro: equipamento(primeiro, "saude"),
      segundo: equipamento(segundo, "saude"),
    },
  ];

  return (
    <section className="raiox-bloco rounded-lg border bg-card p-5">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Comparação</p>
        <h2 className="text-base font-semibold">Duas áreas, mesma régua</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Os números continuam sendo os diagnósticos individuais; a tabela não cria um score.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Indicador</th>
              <th className="pb-2 pr-4 font-medium">{primeiroNome}</th>
              <th className="pb-2 font-medium">{segundoNome}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.rotulo} className="border-b last:border-0">
                <th scope="row" className="py-2 pr-4 text-left font-medium">
                  {linha.rotulo}
                </th>
                <td className="py-2 pr-4 tabular-nums">{linha.primeiro}</td>
                <td className="py-2 tabular-nums">{linha.segundo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function equipamento(dados: RaioX, tipo: "ensino" | "saude"): string {
  if (!dados.equipamentos.disponivel) return "Fora da cobertura";
  return inteiro(dados.equipamentos[tipo].enderecos);
}
