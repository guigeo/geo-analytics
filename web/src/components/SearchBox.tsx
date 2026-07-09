import { useRef, useState } from "react";
import { Landmark, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buscar, loadIndex, type SearchHit } from "@/search";

interface Props {
  onSelect: (hit: SearchHit) => void;
}

export function SearchBox({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  // Índice carregado no 1º foco (asset ~356 KB com hash; cacheado pelo browser).
  const entriesRef = useRef<Awaited<ReturnType<typeof loadIndex>> | null>(null);

  async function ensureIndex() {
    if (!entriesRef.current) {
      try {
        entriesRef.current = await loadIndex();
      } catch (err) {
        console.error(err);
      }
    }
    return entriesRef.current;
  }

  async function update(q: string) {
    setQuery(q);
    const entries = await ensureIndex();
    const found = entries ? buscar(entries, q) : [];
    setHits(found);
    setActive(0);
    setOpen(found.length > 0);
  }

  function select(hit: SearchHit) {
    onSelect(hit);
    setQuery(`${hit.rotulo} (${hit.detalhe})`);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative ml-2 hidden max-w-sm flex-1 sm:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        placeholder="Buscar município ou UF…"
        className="pl-9"
        onChange={(e) => void update(e.target.value)}
        onFocus={() => {
          void ensureIndex();
          if (hits.length) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-label="Buscar município ou UF"
      />
      {open && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {hits.map((h, i) => (
            <li key={`${h.tipo}-${h.cdMun ?? h.rotulo}`}>
              <button
                type="button"
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                  i === active ? "bg-accent" : ""
                }`}
                // mousedown: seleciona ANTES do blur do input fechar o dropdown
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(h);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {h.tipo === "uf" ? (
                  <Landmark className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{h.rotulo}</span>
                <span className="text-xs text-muted-foreground">{h.detalhe}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
