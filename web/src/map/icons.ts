import type maplibregl from "maplibre-gl";

// Ids dos ícones registrados no mapa (referenciados por camadas em layers.ts).
export const ANTENNA_ICON = "antenna-tower";
export const SCHOOL_ICON = "school";
export const HEALTH_ICON = "health-cross";

const ICON_PX = 48;

// Padrão dos glyphs stroke: halo branco grosso atrás + traço colorido na frente,
// pra contraste tanto no basemap claro quanto no escuro. Cores batem com a legenda.

// Torre de antena (base "radio-tower" do lucide, MIT) — #d7263d.
const ANTENNA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="#ffffff" stroke-width="4.5">
      <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/>
      <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/>
      <path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/>
      <path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/>
      <path d="M9.5 18h5"/>
      <path d="m8 22 4-11 4 11"/>
    </g>
    <g stroke="#d7263d" stroke-width="2">
      <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/>
      <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/>
      <path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/>
      <path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/>
      <path d="M9.5 18h5"/>
      <path d="m8 22 4-11 4 11"/>
    </g>
    <circle cx="12" cy="9" r="2" fill="#d7263d" stroke="#ffffff" stroke-width="1.5"/>
  </g>
</svg>`;

const SCHOOL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="#ffffff" stroke-width="4.5">
      <path d="M14 22v-4a2 2 0 1 0-4 0v4"/>
      <path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/>
      <path d="M18 5v17"/>
      <path d="m4 6 8-4 8 4"/>
      <path d="M6 5v17"/>
      <circle cx="12" cy="9" r="2"/>
    </g>
    <g stroke="#c2410c" stroke-width="2">
      <path d="M14 22v-4a2 2 0 1 0-4 0v4"/>
      <path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/>
      <path d="M18 5v17"/>
      <path d="m4 6 8-4 8 4"/>
      <path d="M6 5v17"/>
      <circle cx="12" cy="9" r="2"/>
    </g>
  </g>
</svg>`;

const HEALTH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="#ffffff" stroke-width="4.5">
      <path d="M12 6v4"/>
      <path d="M14 14h-4"/>
      <path d="M14 18h-4"/>
      <path d="M14 8h-4"/>
      <path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/>
      <path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/>
    </g>
    <g stroke="#0e7490" stroke-width="2">
      <path d="M12 6v4"/>
      <path d="M14 14h-4"/>
      <path d="M14 18h-4"/>
      <path d="M14 8h-4"/>
      <path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/>
      <path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/>
    </g>
  </g>
</svg>`;

export const ICON_SVGS: Record<string, string> = {
  [ANTENNA_ICON]: ANTENNA_SVG,
  [SCHOOL_ICON]: SCHOOL_SVG,
  [HEALTH_ICON]: HEALTH_SVG,
};

// Rasteriza um SVG para ImageData via <canvas>. Mais portável que
// createImageBitmap(svgBlob), que falha em Safari/Firefox e parte do Chrome.
async function rasterize(svg: string): Promise<ImageData> {
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = new Image(ICON_PX, ICON_PX);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("falha ao carregar ícone SVG"));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = ICON_PX;
  canvas.height = ICON_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");
  ctx.drawImage(img, 0, 0, ICON_PX, ICON_PX);
  return ctx.getImageData(0, 0, ICON_PX, ICON_PX);
}

// Rasteriza todos os ícones uma vez (id -> ImageData).
export async function loadIcons(): Promise<Map<string, ImageData>> {
  const out = new Map<string, ImageData>();
  await Promise.all(
    Object.entries(ICON_SVGS).map(async ([id, svg]) => {
      out.set(id, await rasterize(svg));
    }),
  );
  return out;
}

// Garante um ícone no style atual. Idempotente — seguro a cada (re)carregamento de style
// (o setStyle do toggle de tema descarta as imagens registradas).
export function ensureIcon(map: maplibregl.Map, id: string, image: ImageData | null): void {
  if (!image || map.hasImage(id)) return;
  map.addImage(id, image, { pixelRatio: 2 });
}
