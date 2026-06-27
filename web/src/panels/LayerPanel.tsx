import { LAYERS, type DataLayer } from "../map/layers";

interface Props {
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
}

export function LayerPanel({ visible, onToggle }: Props) {
  return (
    <aside className="panel panel--left">
      <h2 className="panel__title">Camadas</h2>
      <ul className="layer-list">
        {LAYERS.map((l) => (
          <li key={l.id} className="layer-item">
            <label>
              <input
                type="checkbox"
                checked={!!visible[l.id]}
                onChange={() => onToggle(l.id)}
              />
              <Swatch layer={l} />
              {l.label}
            </label>
          </li>
        ))}
      </ul>
      <p className="panel__hint">Clique numa feição para destacá-la e ver atributos.</p>
    </aside>
  );
}

// Legenda: o swatch reflete a geometria — ponto (antenas), contorno (UF) ou área.
function Swatch({ layer }: { layer: DataLayer }) {
  if (layer.geometry === "point") {
    return <span className="layer-swatch layer-swatch--dot" style={{ background: layer.color }} />;
  }
  if (layer.fillOpacity === 0 && layer.outline) {
    return (
      <span
        className="layer-swatch layer-swatch--outline"
        style={{ borderColor: layer.outline.color }}
      />
    );
  }
  return (
    <span
      className="layer-swatch"
      style={{ background: layer.color, borderColor: layer.outline?.color ?? layer.color }}
    />
  );
}
