/**
 * A página do Raio-X.
 *
 * Sobrepõe a aplicação em vez de substituí-la: o mapa continua vivo por baixo,
 * pintado com os setores deste diagnóstico, e fechar devolve a pessoa exatamente onde
 * ela estava. Uma rota de verdade descartaria o estado do mapa e obrigaria a
 * reconstruí-lo na volta.
 *
 * Nada aqui chama o agente. É o que sustenta a promessa da §9 do ADR-0001: com o chat
 * fora do ar, o diagnóstico continua de pé — só as perguntas guiadas degradam.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buscarRaioX, ErroDoRaioX, type RaioX } from "./api";
import { escalaDe } from "./escala";
import type { PinturaRaioX } from "@/map/pinturaRaioX";
import {
  BlocoDeClasseSocial,
  BlocoDeContraste,
  BlocoDeEscala,
  BlocoDePerfil,
  BlocoDeQualidade,
  BlocoDeRegulacao,
} from "./blocos";
import "./impressao.css";

/** As perguntas guiadas. Específicas de propósito: pergunta vaga faz o agente pedir
 *  esclarecimento em vez de responder — medido no `lib/novidades.ts`. */
function perguntasDe(nome: string): string[] {
  return [
    `No Raio-X da área "${nome}", explique por que a renda varia tanto entre os setores.`,
    `Compare a área "${nome}" com a média do município em renda e densidade.`,
    `O que a leitura do Raio-X da área "${nome}" NÃO permite concluir?`,
  ];
}

export function PaginaRaioX({
  desenhoId,
  nome,
  aoFechar,
  aoPintarMapa,
  aoFocalizarSetor,
  aoPerguntar,
}: {
  desenhoId: string;
  /** O nome vem do acervo, que a aplicação já tem — poupa um campo no contrato. */
  nome: string;
  aoFechar: () => void;
  aoPintarMapa: (pintura: PinturaRaioX | null) => void;
  aoFocalizarSetor: (codSetor: string) => void;
  aoPerguntar: (pergunta: string) => void;
}) {
  const [dados, setDados] = useState<RaioX | null>(null);
  const [erro, setErro] = useState<ErroDoRaioX | null>(null);
  const aoPintarRef = useRef(aoPintarMapa);
  aoPintarRef.current = aoPintarMapa;

  useEffect(() => {
    const controle = new AbortController();
    setDados(null);
    setErro(null);
    buscarRaioX(desenhoId, controle.signal)
      .then(setDados)
      .catch((e: unknown) => {
        if (controle.signal.aborted) return;
        setErro(
          e instanceof ErroDoRaioX ? e : new ErroDoRaioX("Não foi possível gerar o Raio-X.", 500),
        );
      });
    return () => controle.abort();
  }, [desenhoId]);

  const escala = useMemo(
    () => escalaDe((dados?.contraste.setores ?? []).map((s) => s.valor)),
    [dados],
  );

  // A pintura do mapa é efeito da página, e some com ela: um Raio-X fechado que
  // deixasse setores pintados atrás de si viraria um mapa que ninguém sabe desfazer.
  useEffect(() => {
    if (!dados) return;
    const cores: Record<string, string> = {};
    for (const setor of dados.contraste.setores) cores[setor.cod_setor] = escala.cor(setor.valor);
    aoPintarRef.current({ camada: "setor", cores });
    return () => aoPintarRef.current(null);
  }, [dados, escala]);

  return (
    <div className="raiox-pagina absolute inset-0 z-30 overflow-y-auto bg-background/98 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl p-6 pb-16">
        <header className="raiox-cabecalho mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Raio-X da área</p>
            <h1 className="truncate text-2xl font-semibold">{nome}</h1>
            {dados ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {dados.sintese}
              </p>
            ) : null}
          </div>
          <div className="raiox-sem-impressao flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={!dados}
            >
              <Printer /> Imprimir
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={aoFechar}
              aria-label="Fechar o Raio-X"
            >
              <X />
            </Button>
          </div>
        </header>

        {erro ? <Falha erro={erro} aoFechar={aoFechar} /> : null}

        {!dados && !erro ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" /> Cruzando o desenho com o Censo…
          </p>
        ) : null}

        {dados ? (
          <div className="space-y-4">
            <BlocoDeEscala dados={dados.escala} />
            <BlocoDeContraste
              dados={dados.contraste}
              escala={escala}
              aoFocalizarSetor={aoFocalizarSetor}
            />
            <BlocoDePerfil dados={dados.perfil} />
            <BlocoDeClasseSocial dados={dados.classe_social} />
            <BlocoDeRegulacao dados={dados.regulacao} />
            <BlocoDeQualidade dados={dados.qualidade} />

            {/*
              A degradação prometida pelo ADR acontece um nível abaixo do que parece.
              O agente serve ESTA rota e o chat, então se o processo cai, cai tudo. O
              que cai separado é o modelo: a rota do Raio-X não chama a OpenAI, então
              com a chave errada ou o provedor fora do ar o diagnóstico continua de pé
              e só a resposta do chat falha — no próprio chat, que já sabe dizer isso.
            */}
            {
              <section className="raiox-sem-impressao rounded-lg border bg-card p-5">
                <h2 className="text-base font-semibold">Aprofundar no chat</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {perguntasDe(nome).map((pergunta) => (
                    <Button
                      key={pergunta}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => aoPerguntar(pergunta)}
                    >
                      {pergunta
                        .replace(/^No Raio-X da área ".*?", /, "")
                        .replace(/^Compare a área ".*?" /, "Compare ")}
                    </Button>
                  ))}
                </div>
              </section>
            }

            <p className="pt-2 text-center text-xs text-muted-foreground">
              Gerado em {new Date(dados.gerado_em).toLocaleString("pt-BR")} · cálculo{" "}
              {dados.versao_calculo}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * As três falhas pedem coisas diferentes, e a tela precisa dizer qual é qual.
 *
 * 422 é o único caso em que a pessoa pode agir sozinha — desenhar menor, ou escolher um
 * polígono no lugar de um ponto —, e é por isso que a mensagem do backend aparece
 * inteira: ela traz o limite e a área pedida.
 */
function Falha({ erro, aoFechar }: { erro: ErroDoRaioX; aoFechar: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5">
      <p className="text-sm font-medium">
        {erro.indisponivel
          ? "Os dados territoriais estão fora do ar."
          : erro.recusado
            ? "Este desenho não serve para o Raio-X."
            : erro.sumiu
              ? "Este desenho não existe mais."
              : "Não foi possível gerar o Raio-X."}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{erro.message}</p>
      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={aoFechar}>
        Voltar ao mapa
      </Button>
    </div>
  );
}
