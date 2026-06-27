import { useState } from "react";
import { MapView, type SelectedFeature } from "./map/MapView";
import { LayerPanel } from "./panels/LayerPanel";
import { AttributePanel } from "./panels/AttributePanel";
import { LAYERS } from "./map/layers";

const initialVisibility = Object.fromEntries(
  LAYERS.map((l) => [l.id, l.defaultVisible]),
) as Record<string, boolean>;

export function App() {
  const [visible, setVisible] = useState<Record<string, boolean>>(initialVisibility);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);

  const toggle = (id: string) =>
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="layout">
      <LayerPanel visible={visible} onToggle={toggle} />
      <MapView visible={visible} onSelect={setSelected} />
      <AttributePanel selected={selected} />
    </div>
  );
}
