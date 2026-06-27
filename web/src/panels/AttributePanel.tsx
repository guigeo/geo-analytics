import type { SelectedFeature } from "../map/MapView";
import { LAYERS } from "../map/layers";

interface Props {
  selected: SelectedFeature | null;
}

export function AttributePanel({ selected }: Props) {
  const layer = selected
    ? LAYERS.find((l) => l.id === selected.layerId)
    : undefined;

  return (
    <aside className="panel panel--right">
      <h2 className="panel__title">Atributos</h2>
      {!selected || !layer ? (
        <p className="panel__empty">Clique em uma feição no mapa.</p>
      ) : (
        <>
          <p className="panel__subtitle">{layer.label}</p>
          <dl className="attr-list">
            {layer.attributes.map((field) => (
              <div key={field.key} className="attr-row">
                <dt>{field.label}</dt>
                <dd>{formatValue(selected.properties[field.key])}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <div className="chat-placeholder">
        <span>Chat com IA — Fase 2</span>
      </div>
    </aside>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
