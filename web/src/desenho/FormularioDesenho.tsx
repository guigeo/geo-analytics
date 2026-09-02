import { useId, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TipoDesenho } from "./geometria";

export interface DadosDoFormulario {
  nome: string;
  categoria: string | null;
  cor: string;
  observacao: string | null;
}

interface Props {
  tipo: TipoDesenho;
  /** Área do traçado já formatada, quando há. Só informa — o número que fica é o do PostGIS. */
  area: string | null;
  /** Categorias já usadas por este cliente. Vira o autocomplete (AT-014). */
  categorias: readonly string[];
  salvando: boolean;
  /** Recusa do servidor, em texto. Fica ao lado do botão, não num alerta que some. */
  erro: string | null;
  onSalvar: (dados: DadosDoFormulario) => void;
  onCancelar: () => void;
}

/**
 * A cor sai de uma paleta fechada, e não de um seletor livre.
 *
 * São seis cores que sobrevivem ao basemap claro, ao escuro e à imagem de satélite —
 * a mesma exigência do laranja da medição. Um `<input type="color">` deixaria escolher
 * cinza sobre satélite, e a pessoa descobriria isso depois de salvar. Quem quiser o
 * seletor livre um dia acha esta lista num lugar só.
 *
 * O primeiro valor é o mesmo default do `DesenhoNovo` no backend: dois lugares para a
 * mesma cor, e é de propósito — o servidor precisa de default para a carga
 * administrativa, que não passa por este formulário.
 */
const PALETA = ["#2563eb", "#dc2626", "#16a34a", "#ea580c", "#9333ea", "#0891b2"] as const;

const ROTULO_DO_TIPO: Record<TipoDesenho, string> = {
  ponto: "ponto",
  poligono: "área",
  buffer: "raio",
};

/**
 * O que se pergunta depois que o traçado fecha: nome, categoria, cor e observação.
 *
 * Os campos são os quatro decididos no BRAINSTORM, e a categoria é o único que não é
 * fixo: ela **nasce do uso** — o autocomplete lista o que este cliente já digitou, sem
 * que ninguém precise publicar uma taxonomia antes. Foi a saída para o "e se se
 * bagunçar": lista fechada que ninguém mantém envelhece, e campo livre sem sugestão
 * vira "praça de pedágio", "Praça de Pedagio" e "pedágio" na mesma tabela.
 *
 * Ocupa o mesmo canto da barra de ferramentas, que se recolhe enquanto ele está
 * aberto: são dois passos do mesmo gesto, e mostrar os dois convidaria a trocar de
 * modo no meio de um salvamento.
 */
export function FormularioDesenho({
  tipo,
  area,
  categorias,
  salvando,
  erro,
  onSalvar,
  onCancelar,
}: Props) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [cor, setCor] = useState<string>(PALETA[0]);
  const [observacao, setObservacao] = useState("");
  const idBase = useId();
  const idLista = `${idBase}-categorias`;

  const nomeLimpo = nome.trim();

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!nomeLimpo || salvando) return;
    onSalvar({
      nome: nomeLimpo,
      categoria: categoria.trim() || null,
      cor,
      observacao: observacao.trim() || null,
    });
  };

  return (
    <form
      onSubmit={enviar}
      className="absolute right-4 top-4 z-10 w-[min(19rem,calc(100%-2rem))] rounded-lg border border-border bg-card/95 p-4 shadow-xl backdrop-blur"
      aria-label={`Salvar ${ROTULO_DO_TIPO[tipo]}`}
    >
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-primary">
        Salvar {ROTULO_DO_TIPO[tipo]}
      </p>
      {area && <p className="mt-1 text-xs text-muted-foreground">Área aproximada: {area}</p>}

      <label htmlFor={`${idBase}-nome`} className="mt-3 block text-xs font-medium">
        Nome
      </label>
      <Input
        id={`${idBase}-nome`}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        maxLength={200}
        required
        autoFocus
        placeholder="Ex.: Área de cobertura norte"
        className="mt-1"
      />

      <label htmlFor={`${idBase}-categoria`} className="mt-3 block text-xs font-medium">
        Categoria <span className="font-normal text-muted-foreground">(opcional)</span>
      </label>
      {/* `datalist` e não um combobox nosso: sugere sem impedir de digitar algo novo,
          que é exatamente o comportamento pedido — e é do navegador, sem dependência. */}
      <Input
        id={`${idBase}-categoria`}
        list={idLista}
        value={categoria}
        onChange={(e) => setCategoria(e.target.value)}
        maxLength={100}
        placeholder="Ex.: praça de pedágio"
        className="mt-1"
      />
      <datalist id={idLista}>
        {categorias.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium">Cor</legend>
        <div className="mt-1.5 flex gap-1.5">
          {PALETA.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-label={`Cor ${opcao}`}
              aria-pressed={cor === opcao}
              onClick={() => setCor(opcao)}
              style={{ background: opcao }}
              className={cn(
                "size-6 rounded-full ring-1 ring-black/10 transition-transform",
                cor === opcao && "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-card",
              )}
            />
          ))}
        </div>
      </fieldset>

      <label htmlFor={`${idBase}-observacao`} className="mt-3 block text-xs font-medium">
        Observação <span className="font-normal text-muted-foreground">(opcional)</span>
      </label>
      <textarea
        id={`${idBase}-observacao`}
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        maxLength={2000}
        rows={2}
        className="mt-1 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      />

      {erro && (
        <p role="alert" className="mt-2 text-[0.6875rem] leading-4 text-destructive">
          {erro}
        </p>
      )}

      <div className="mt-3 flex gap-1.5">
        <Button type="submit" size="sm" className="flex-1" disabled={!nomeLimpo || salvando}>
          {salvando && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
