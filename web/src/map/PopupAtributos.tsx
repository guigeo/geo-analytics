/**
 * O popup do MapLibre com conteúdo React dentro, por portal.
 *
 * Portal, e não HTML montado à mão: o conteúdo carrega nome de desenho, que é texto
 * do cliente — montar string de HTML com isso seria abrir XSS numa tela que hoje não
 * tem. E o posicionamento fica com o MapLibre, que já sabe acompanhar o pan e o zoom,
 * virar a seta perto da borda e sumir quando o ponto sai da tela. Reimplementar isso
 * em React seria refazer, pior, o que a biblioteca faz.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";

export function PopupAtributos({
  map,
  lngLat,
  children,
}: {
  map: maplibregl.Map;
  lngLat: [number, number];
  children: React.ReactNode;
}) {
  // O container é criado UMA vez e vive enquanto o componente viver: recriá-lo a cada
  // render faria o React remontar a árvore inteira do popup a cada pan do mapa.
  const [container] = useState(() => document.createElement("div"));
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // A posição inicial vem por ref, e não da dependência do efeito: como dependência,
  // cada pan recriaria o popup inteiro — e com ele a árvore React lá dentro.
  const inicialRef = useRef(lngLat);
  inicialRef.current = lngLat;

  useEffect(() => {
    const popup = new maplibregl.Popup({
      // O ✕ é nosso, dentro do conteúdo: o do MapLibre não segue o tema e fica
      // pendurado fora da moldura.
      closeButton: false,
      // Fechar no clique do mapa é trabalho do próprio clique, que já limpa a
      // seleção. Com os dois ligados, o popup fecharia duas vezes.
      closeOnClick: false,
      maxWidth: "20rem",
      offset: 12,
      className: "popup-atributos",
    })
      .setDOMContent(container)
      .setLngLat(inicialRef.current)
      .addTo(map);
    popupRef.current = popup;
    return () => {
      popup.remove();
      popupRef.current = null;
    };
  }, [map, container]);

  // Só o ponto muda quando se clica noutra feição — mover é mais barato que recriar,
  // e evita o piscar de remover e adicionar no mesmo quadro.
  const [lng, lat] = lngLat;
  useEffect(() => {
    popupRef.current?.setLngLat([lng, lat]);
  }, [lng, lat]);

  return createPortal(children, container);
}
