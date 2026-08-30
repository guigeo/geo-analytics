/**
 * Pinta o símbolo do cliente descrito na configuração.
 *
 * Um componente para todos: o desenho é dado (`tema.simbolo`), não código. O
 * traço usa `currentColor`, então o mesmo símbolo serve escuro sobre claro e
 * branco sobre a cor da marca, sem segundo arquivo.
 */
import { useId } from "react";
import type { Simbolo as DefinicaoSimbolo } from "@/configuracao/esquema";

interface Props {
  simbolo: DefinicaoSimbolo;
  className?: string;
}

export function Simbolo({ simbolo, className }: Props) {
  // Dois símbolos na mesma página não podem dividir o id do recorte.
  const recorte = `recorte-simbolo-${useId().replace(/:/g, "")}`;
  const livres = simbolo.tracos.filter((t) => !t.aparado);
  const aparados = simbolo.tracos.filter((t) => t.aparado);

  return (
    <svg
      className={className}
      viewBox={simbolo.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={simbolo.espessura}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {simbolo.apara && (
        <clipPath id={recorte}>
          <circle cx={simbolo.apara.cx} cy={simbolo.apara.cy} r={simbolo.apara.r} />
        </clipPath>
      )}
      {livres.map((traco) => (
        <path key={traco.d} d={traco.d} />
      ))}
      {aparados.length > 0 && (
        <g clipPath={`url(#${recorte})`}>
          {aparados.map((traco) => (
            <path key={traco.d} d={traco.d} />
          ))}
        </g>
      )}
    </svg>
  );
}
