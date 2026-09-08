/**
 * Os blocos do Raio-X.
 *
 * Cada um recebe o pedaço do contrato que lhe cabe e não calcula nada além de
 * formatação: número, unidade, aviso e proveniência vêm do backend. É o que faz a
 * página, o mapa e o chat concordarem sem ninguém conferir.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  BlocoClasseSocial,
  BlocoContraste,
  BlocoEscala,
  BlocoPerfil,
  BlocoRegulacao,
  ComProveniencia,
  Qualidade,
  ReferenciaMunicipal,
} from "./api";
import { compararComMunicipio, decimal, inteiro, percentual, reais } from "./formato";
import { SEM_VALOR, type Escala } from "./escala";

/**
 * O contraste hoje é sempre renda, mas a métrica vem do backend como campo.
 * Formatar por `metrica` em vez de assumir moeda evita a falha silenciosa do dia em
 * que ela virar densidade e a tela passar a escrever R$ em hab/km².
 */
function formatadorDe(metrica: string): (valor: number | null | undefined) => string {
  if (metrica.startsWith("renda")) return reais;
  if (metrica.startsWith("pct_")) return percentual;
  if (metrica === "media_moradores") return decimal;
  return inteiro;
}

function Bloco({
  titulo,
  chamada,
  proveniencia,
  children,
}: {
  titulo: string;
  chamada?: string;
  proveniencia: ComProveniencia;
  children: ReactNode;
}) {
  return (
    <section className="raiox-bloco rounded-lg border bg-card p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {chamada ? <p className="mt-1 text-sm text-muted-foreground">{chamada}</p> : null}
      </header>
      {children}
      <Proveniencia dados={proveniencia} />
    </section>
  );
}

/**
 * O rodapé de origem, em todo bloco.
 *
 * Não é decoração de rigor acadêmico: é o que permite alguém discordar do número sem
 * ter de perguntar de onde ele veio. O relatório rural que serviu de referência faz o
 * mesmo em cada página, e é isso que o faz parecer confiável antes de ser lido.
 */
function Proveniencia({ dados }: { dados: ComProveniencia }) {
  return (
    <footer className="mt-4 border-t pt-3 text-xs text-muted-foreground">
      {dados.avisos.length > 0 && (
        <ul className="mb-2 space-y-1">
          {dados.avisos.map((aviso) => (
            <li key={aviso} className="text-amber-700 dark:text-amber-500">
              {aviso}
            </li>
          ))}
        </ul>
      )}
      <p>
        {dados.fonte} · {dados.periodo} · {dados.metodo}
      </p>
      <p className="mt-0.5">{dados.cobertura}</p>
    </footer>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{valor}</dd>
      {nota ? <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p> : null}
    </div>
  );
}

function ContraMunicipio({
  daArea,
  doMunicipio,
  municipio,
}: {
  daArea: number | null;
  doMunicipio: number | null;
  municipio: ReferenciaMunicipal;
}) {
  const { texto, sentido } = compararComMunicipio(daArea, doMunicipio);
  return (
    <p
      className={cn(
        "mt-0.5 text-xs",
        sentido === "acima" && "text-emerald-700 dark:text-emerald-500",
        sentido === "abaixo" && "text-orange-700 dark:text-orange-500",
        (sentido === "igual" || sentido === "indisponivel") && "text-muted-foreground",
      )}
      title={`${municipio.nm_mun}/${municipio.nm_uf}`}
    >
      {texto}
    </p>
  );
}

export function BlocoDeEscala({ dados }: { dados: BlocoEscala }) {
  const m = dados.municipio;
  return (
    <Bloco
      titulo="Escala"
      chamada={`O recorte toca ${inteiro(dados.setores)} setores censitários.`}
      proveniencia={dados}
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Numero rotulo="Área" valor={`${decimal(dados.area_km2 * 100)} ha`} />
        {/* População não ganha comparação municipal: total de área contra total de
            cidade não é razão que signifique alguma coisa. Quem compara é a densidade. */}
        <Numero rotulo="População" valor={inteiro(dados.populacao)} />
        <Numero rotulo="Domicílios" valor={inteiro(dados.domicilios_ocupados)} />
        <div>
          <Numero rotulo="Densidade" valor={`${inteiro(dados.densidade_hab_km2)} hab/km²`} />
          <ContraMunicipio
            daArea={dados.densidade_hab_km2}
            doMunicipio={m.densidade_hab_km2}
            municipio={m}
          />
        </div>
      </dl>

      {/*
        A população partida é o coração da honestidade deste bloco. Um número único
        esconderia que, num buffer urbano típico, três quartos dos setores entram
        cortados e a parte rateada supõe população uniforme dentro do setor — que é
        falso ao lado de parque, de borda de favela ou de lote industrial.
      */}
      <div className="mt-5 rounded-md bg-muted/50 p-3 text-sm">
        <p className="font-medium">Como esta população se compõe</p>
        <p className="mt-1 text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {inteiro(dados.populacao_contida)}
          </span>{" "}
          vêm de setores inteiramente dentro do desenho.{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {inteiro(dados.populacao_rateada)}
          </span>{" "}
          são estimados por rateio nos {inteiro(dados.setores_parciais)} setores cortados pela
          borda.
        </p>
      </div>
    </Bloco>
  );
}

export function BlocoDeContraste({
  dados,
  escala,
  aoFocalizarSetor,
}: {
  dados: BlocoContraste;
  escala: Escala;
  aoFocalizarSetor: (codSetor: string) => void;
}) {
  const homogeneo = escala.maximo - escala.minimo === 0;
  const valor = formatadorDe(dados.metrica);
  return (
    <Bloco
      titulo="Contraste interno"
      chamada={
        homogeneo
          ? `Os setores deste recorte têm ${dados.rotulo.toLowerCase()} praticamente igual.`
          : `Dentro do desenho, ${dados.rotulo.toLowerCase()} vai de ${valor(dados.minimo)} a ${valor(dados.maximo)}.`
      }
      proveniencia={dados}
    >
      <Legenda escala={escala} rotulo={dados.rotulo} valor={valor} />

      {dados.faixas.length > 0 && (
        <dl className="mt-4 space-y-1.5">
          {dados.faixas.map((faixa) => (
            <div key={faixa.faixa} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-sm ring-1 ring-black/10"
                style={{ background: escala.cor(faixa.inferior) }}
              />
              <dt className="flex-1 text-muted-foreground">
                {valor(faixa.inferior)} a {valor(faixa.superior)}
              </dt>
              <dd className="tabular-nums">{inteiro(faixa.populacao)} hab.</dd>
            </div>
          ))}
        </dl>
      )}

      {dados.truncada && dados.aviso ? (
        <p className="mt-4 text-xs text-amber-700 dark:text-amber-500">{dados.aviso}</p>
      ) : null}

      {dados.setores.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs text-muted-foreground">
            Clique num setor para localizá-lo no mapa.
          </p>
          <ul className="raiox-lista-setores max-h-72 space-y-0.5 overflow-y-auto pr-1">
            {dados.setores.map((setor) => (
              <li key={setor.cod_setor}>
                <button
                  type="button"
                  onClick={() => aoFocalizarSetor(setor.cod_setor)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
                >
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-sm ring-1 ring-black/10"
                    style={{ background: escala.cor(setor.valor) }}
                  />
                  <span className="flex-1 truncate font-mono text-xs">{setor.cod_setor}</span>
                  <span className="tabular-nums">{valor(setor.valor)}</span>
                  {/* Fração < 1 é setor de borda: o valor dele entrou rateado, e quem
                      lê a lista precisa distinguir isso de um setor inteiro. */}
                  {setor.fracao < 0.999 ? (
                    <span className="w-12 text-right text-xs text-muted-foreground">
                      {percentual(setor.fracao * 100)}
                    </span>
                  ) : (
                    <span className="w-12" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Bloco>
  );
}

function Legenda({
  escala,
  rotulo,
  valor,
}: {
  escala: Escala;
  rotulo: string;
  valor: (v: number | null | undefined) => string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1">
        {escala.cortes.map((corte, i) => (
          <div key={corte} className="flex-1">
            <div className="h-2.5 rounded-sm" style={{ background: escala.cor(corte - 0.001) }} />
            <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
              {i === escala.cortes.length - 1 ? valor(escala.maximo) : valor(corte)}
            </p>
          </div>
        ))}
        <div className="w-12">
          <div className="h-2.5 rounded-sm" style={{ background: SEM_VALOR }} />
          <p className="mt-1 text-[10px] text-muted-foreground">sem dado</p>
        </div>
      </div>
      {/*
        A escala é deste desenho. Dizer isso não é excesso de cautela: sem a frase, duas
        telas com o mesmo azul-escuro seriam lidas como o mesmo valor, e não são.
      */}
      <p className="mt-2 text-xs text-muted-foreground">
        A escala vai do menor ao maior {rotulo.toLowerCase()} <strong>deste desenho</strong> — as
        cores não são comparáveis com as de outro Raio-X.
      </p>
    </div>
  );
}

export function BlocoDePerfil({ dados }: { dados: BlocoPerfil }) {
  const m = dados.municipio;
  return (
    <Bloco titulo="Perfil" proveniencia={dados}>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <Numero rotulo="Renda média do responsável" valor={reais(dados.renda_media)} />
          <ContraMunicipio daArea={dados.renda_media} doMunicipio={m.renda_media} municipio={m} />
        </div>
        <div>
          <Numero rotulo="Moradores por domicílio" valor={decimal(dados.media_moradores)} />
          <ContraMunicipio
            daArea={dados.media_moradores}
            doMunicipio={m.media_moradores}
            municipio={m}
          />
        </div>
        <Numero
          rotulo="Composição por sexo"
          valor={`${inteiro(dados.pop_feminino)} / ${inteiro(dados.pop_masculino)}`}
          nota="mulheres / homens"
        />
      </dl>
    </Bloco>
  );
}

export function BlocoDeClasseSocial({ dados }: { dados: BlocoClasseSocial }) {
  const classes = [
    { rotulo: "A", daArea: dados.pct_a, doMunicipio: dados.municipio.pct_classe_a },
    { rotulo: "B", daArea: dados.pct_b, doMunicipio: dados.municipio.pct_classe_b },
    { rotulo: "C", daArea: dados.pct_c, doMunicipio: dados.municipio.pct_classe_c },
    { rotulo: "DE", daArea: dados.pct_de, doMunicipio: dados.municipio.pct_classe_de },
  ];
  return (
    <Bloco
      titulo="Classe social (estimada)"
      chamada="Quatro classes, na mesma régua do Critério Brasil — a partir da renda domiciliar estimada."
      proveniencia={dados}
    >
      <dl className="space-y-3">
        {classes.map((classe) => (
          <div key={classe.rotulo}>
            <div className="flex items-baseline justify-between text-sm">
              <dt className="font-medium">Classe {classe.rotulo}</dt>
              <dd className="tabular-nums">{percentual(classe.daArea)}</dd>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, classe.daArea ?? 0))}%` }}
              />
            </div>
            <ContraMunicipio
              daArea={classe.daArea}
              doMunicipio={classe.doMunicipio}
              municipio={dados.municipio}
            />
          </div>
        ))}
      </dl>
      {dados.situacao ? (
        <p className="mt-4 text-sm text-muted-foreground">{dados.situacao}</p>
      ) : null}
    </Bloco>
  );
}

export function BlocoDeQualidade({ dados }: { dados: Qualidade }) {
  return (
    <Bloco
      titulo="Qualidade da leitura"
      chamada="O que estes números descrevem, e o que eles não permitem concluir."
      proveniencia={dados}
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Numero rotulo="Setores cortados pela borda" valor={inteiro(dados.setores_parciais)} />
        <Numero rotulo="População vinda de rateio" valor={inteiro(dados.populacao_rateada)} />
        <Numero
          rotulo="Menor cobertura de setor"
          valor={percentual((dados.fracao_menor ?? 0) * 100)}
          nota="quanto do menor setor entrou no desenho"
        />
      </dl>
    </Bloco>
  );
}

export function BlocoDeRegulacao({ dados }: { dados: BlocoRegulacao }) {
  return (
    <Bloco titulo="Regulação de uso do solo" proveniencia={dados}>
      {/*
        Bloco ausente é bloco PRESENTE que afirma a ausência. Sumir da tela seria a
        mesma mentira por omissão que o `ibge.bairro` cometeu em São Paulo: a camada
        ligada, pintando nada, e ninguém sabendo se era falta de dado ou defeito.
      */}
      {dados.disponivel ? (
        <ul className="space-y-2">
          {dados.zonas.map((zona) => (
            <li key={zona.cod_zona} className="flex items-baseline gap-3 text-sm">
              <span className="font-mono text-xs font-semibold">{zona.cod_zona}</span>
              <span className="flex-1 text-muted-foreground">
                {/* Praça e canteiro entram no polígono como qualquer zona, mas não
                    regulam uso. Dizer isso vale mais que repetir o código. */}
                {zona.nome_zona ?? (zona.e_zona === false ? "não regula uso do solo" : "—")}
              </span>
              <span className="tabular-nums">{percentual(zona.percentual)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{dados.aviso}</p>
      )}
    </Bloco>
  );
}
