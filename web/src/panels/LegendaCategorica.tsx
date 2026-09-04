import type { PinturaPorCategoria } from "@/configuracao";

/** Legenda de valores categóricos, agrupada na mesma família da paleta do mapa. */
export function LegendaCategorica({ pintura }: { pintura: PinturaPorCategoria }) {
  const familias = new Map<string, typeof pintura.entradas>();
  for (const entrada of pintura.entradas) {
    familias.set(entrada.familia, [...(familias.get(entrada.familia) ?? []), entrada]);
  }

  return (
    <div className="ml-7 mt-1 grid gap-1 pb-1" role="group" aria-label="Legenda categórica">
      {[...familias].map(([familia, entradas]) => (
        <div key={familia}>
          <p className="text-xs font-medium text-muted-foreground">{familia}</p>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {entradas.map((entrada) => (
              <span key={entrada.codigo} className="flex items-center gap-1 text-xs">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm ring-1 ring-black/10"
                  style={{ background: entrada.cor }}
                />
                {entrada.codigo}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
