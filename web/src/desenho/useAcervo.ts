import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apagarDesenho,
  buscarGeometrias,
  criarDesenho,
  listarCategorias,
  listarDesenhos,
  ErroDoAcervo,
  type DesenhoNovo,
  type PaginaDeDesenhos,
} from "./api";
import { COLECAO_VAZIA } from "./fonte";

const DEBOUNCE_MS = 300;

export interface Acervo {
  /** Tudo, para o mapa. Vem vazio quando o acervo está fora do ar. */
  desenhos: GeoJSON.FeatureCollection;
  /** A página atual da lista, ou `null` enquanto nunca carregou. */
  pagina: PaginaDeDesenhos | null;
  categorias: string[];
  carregando: boolean;
  erro: ErroDoAcervo | null;
  busca: string;
  buscar: (texto: string) => void;
  categoria: string | null;
  filtrarCategoria: (categoria: string | null) => void;
  irParaPagina: (numero: number) => void;
  recarregar: () => void;
  /** Grava e recarrega. Deixa o `ErroDoAcervo` subir: quem chamou é quem tem tela para mostrá-lo. */
  salvar: (novo: DesenhoNovo) => Promise<void>;
  apagar: (id: string) => Promise<void>;
}

/**
 * Todo o diálogo com o acervo, num lugar só.
 *
 * Existe para o `App` seguir sendo composição. A alternativa era espalhar seis
 * `useState` e dois `useEffect` de busca no meio do estado do mapa, do chat e da
 * medição — e a primeira coisa que se perderia ali seria a distinção que o AT-012
 * cobra: **acervo fora do ar não é lista vazia**. Aqui o erro é um campo, e some
 * dos dados em vez de virar zero desenhos.
 *
 * São duas cargas com ritmos diferentes: o mapa quer tudo (`/geometrias`, sem
 * paginação, senão um desenho sumiria ao virar de página) e a lista quer a página
 * filtrada. Um `useEffect` cada, e a `versao` é o que faz gravar/apagar recarregar
 * os dois sem um chamar o outro.
 */
export function useAcervo(): Acervo {
  const [desenhos, setDesenhos] = useState<GeoJSON.FeatureCollection>(COLECAO_VAZIA);
  const [pagina, setPagina] = useState<PaginaDeDesenhos | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroDoAcervo | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [numeroDaPagina, setNumeroDaPagina] = useState(1);
  // Muda a cada gravação, remoção ou "tentar de novo". É o que dispara as duas
  // cargas sem que uma precise conhecer a outra.
  const [versao, setVersao] = useState(0);

  // Digitar não pode virar uma requisição por tecla: o mesmo debounce da busca de
  // endereço, e pelo mesmo motivo.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [busca]);

  // Mudar o filtro e continuar na página 4 mostraria "nenhum resultado" para uma
  // busca que tem resultados na página 1.
  useEffect(() => setNumeroDaPagina(1), [buscaAplicada, categoria]);

  // Descarta resposta de requisição vencida: sem isso, uma busca lenta pode chegar
  // depois de uma rápida e repintar a lista com o filtro antigo.
  const requisicaoDaLista = useRef(0);

  useEffect(() => {
    const minha = ++requisicaoDaLista.current;
    setCarregando(true);
    listarDesenhos({ pagina: numeroDaPagina, categoria, q: buscaAplicada || null })
      .then((p) => {
        if (minha !== requisicaoDaLista.current) return;
        setPagina(p);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (minha !== requisicaoDaLista.current) return;
        setPagina(null);
        setErro(comoErroDoAcervo(e));
      })
      .finally(() => {
        if (minha === requisicaoDaLista.current) setCarregando(false);
      });
  }, [numeroDaPagina, categoria, buscaAplicada, versao]);

  useEffect(() => {
    let cancelado = false;
    Promise.all([buscarGeometrias(), listarCategorias()])
      .then(([colecao, cats]) => {
        if (cancelado) return;
        setDesenhos(colecao);
        setCategorias(cats);
      })
      .catch(() => {
        // O erro da lista já conta a história na tela. Aqui o que importa é o mapa
        // não ficar com desenhos velhos depois de o acervo cair.
        if (!cancelado) setDesenhos(COLECAO_VAZIA);
      });
    return () => {
      cancelado = true;
    };
  }, [versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  const salvar = useCallback(async (novo: DesenhoNovo) => {
    await criarDesenho(novo);
    setNumeroDaPagina(1);
    setVersao((v) => v + 1);
  }, []);

  const apagar = useCallback(async (id: string) => {
    await apagarDesenho(id);
    setVersao((v) => v + 1);
  }, []);

  return useMemo(
    () => ({
      desenhos,
      pagina,
      categorias,
      carregando,
      erro,
      busca,
      buscar: setBusca,
      categoria,
      filtrarCategoria: setCategoria,
      irParaPagina: setNumeroDaPagina,
      recarregar,
      salvar,
      apagar,
    }),
    [desenhos, pagina, categorias, carregando, erro, busca, categoria, recarregar, salvar, apagar],
  );
}

/** Tudo que sobe daqui é `ErroDoAcervo`; o resto é defeito de programação e vira 0. */
function comoErroDoAcervo(e: unknown): ErroDoAcervo {
  return e instanceof ErroDoAcervo ? e : new ErroDoAcervo("Falha inesperada no acervo.", 0);
}
