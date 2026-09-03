import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apagarDesenho,
  buscarGeometrias,
  criarDesenho,
  listarCategorias,
  ErroDoAcervo,
  type DesenhoNovo,
} from "./api";
import { COLECAO_VAZIA } from "./fonte";

export interface Acervo {
  /** Tudo. Alimenta o mapa E a árvore do painel — uma carga, uma verdade. */
  desenhos: GeoJSON.FeatureCollection;
  /** O vocabulário já usado, para o autocompletar do formulário. */
  categorias: string[];
  carregando: boolean;
  erro: ErroDoAcervo | null;
  recarregar: () => void;
  /** Grava e recarrega. Deixa o `ErroDoAcervo` subir: quem chamou é quem tem tela para mostrá-lo. */
  salvar: (novo: DesenhoNovo) => Promise<void>;
  apagar: (id: string) => Promise<void>;
}

/**
 * Todo o diálogo com o acervo, num lugar só.
 *
 * Foi de duas cargas para uma. Havia a lista paginada do painel de baixo e a coleção
 * inteira do mapa, com ritmos diferentes — e painel e mapa podiam discordar sobre o
 * que existe. Com a árvore lendo a mesma coleção que o mapa desenha, a paginação, a
 * busca por nome e o filtro por categoria deixaram de ter dono: saíram.
 *
 * O que NÃO saiu é a distinção que o AT-012 cobra: **acervo fora do ar não é acervo
 * vazio**. O erro continua sendo um campo, e some dos dados em vez de virar zero
 * desenhos — é a única coisa que decide se vale tentar de novo.
 */
export function useAcervo(): Acervo {
  const [desenhos, setDesenhos] = useState<GeoJSON.FeatureCollection>(COLECAO_VAZIA);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroDoAcervo | null>(null);
  // Muda a cada gravação, remoção ou "tentar de novo". É o que dispara a recarga.
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    Promise.all([buscarGeometrias(), listarCategorias()])
      .then(([colecao, cats]) => {
        if (cancelado) return;
        setDesenhos(colecao);
        setCategorias(cats);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        // O mapa não pode ficar com desenhos velhos depois de o acervo cair.
        setDesenhos(COLECAO_VAZIA);
        setErro(e instanceof ErroDoAcervo ? e : new ErroDoAcervo("Falha inesperada no acervo.", 0));
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  const salvar = useCallback(async (novo: DesenhoNovo) => {
    await criarDesenho(novo);
    setVersao((v) => v + 1);
  }, []);

  const apagar = useCallback(async (id: string) => {
    await apagarDesenho(id);
    setVersao((v) => v + 1);
  }, []);

  return useMemo(
    () => ({ desenhos, categorias, carregando, erro, recarregar, salvar, apagar }),
    [desenhos, categorias, carregando, erro, recarregar, salvar, apagar],
  );
}
