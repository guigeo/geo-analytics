import { useEffect, useState } from "react";

/**
 * A largura decide a COMPOSIÇÃO, não só um detalhe visual. Abaixo de 768 px as
 * colunas laterais deixariam o mapa sem área útil, então o App monta a casca móvel.
 * O ponteiro de toque mantém a composição ao girar um telefone para paisagem: largura
 * sozinha o classificaria como desktop e recriaria o mapa no meio da navegação.
 */
const CONSULTA_MOVEL = "(max-width: 767px), (hover: none) and (pointer: coarse)";

export function useMobile() {
  const [movel, setMovel] = useState(() =>
    typeof window === "undefined" || !("matchMedia" in window)
      ? false
      : window.matchMedia(CONSULTA_MOVEL).matches,
  );

  useEffect(() => {
    if (!("matchMedia" in window)) return;
    const consulta = window.matchMedia(CONSULTA_MOVEL);
    const atualizar = () => setMovel(consulta.matches);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);

  return movel;
}
