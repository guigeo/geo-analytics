import type maplibregl from "maplibre-gl";

// Id do ícone de antena registrado no mapa (referenciado pela camada `antenas`).
export const ANTENNA_ICON = "antenna-tower";

// Torre de antena (base do ícone "radio-tower" do lucide, MIT). Desenhada em duas
// passadas: traço branco grosso atrás (halo p/ contraste em basemap claro e escuro)
// e traço vermelho na frente. Cor batendo com a legenda da camada (#d7263d).
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

const ICON_PX = 48;

// Rasteriza o SVG uma vez para ImageData via <canvas>. Mais portável que
// createImageBitmap(svgBlob), que falha em Safari/Firefox e parte do Chrome.
export async function createAntennaImage(): Promise<ImageData> {
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ANTENNA_SVG);
  const img = new Image(ICON_PX, ICON_PX);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("falha ao carregar o ícone de antena"));
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

// Garante o ícone no style atual. Idempotente — seguro chamar a cada (re)carregamento
// de style (o setStyle do toggle de tema descarta as imagens registradas).
export function ensureAntennaIcon(
  map: maplibregl.Map,
  image: ImageData | null,
): void {
  if (!image || map.hasImage(ANTENNA_ICON)) return;
  map.addImage(ANTENNA_ICON, image, { pixelRatio: 2 });
}
