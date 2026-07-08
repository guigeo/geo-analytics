import { useEffect, useRef, useState } from "react";
import { Bot, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Destaques } from "@/map/highlight";
import { sendChat, type ContextoMapa } from "./api";

interface Msg {
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
}

interface Props {
  /** Destaques da última resposta — o App repassa ao MapView pintar. */
  onDestaques: (destaques: Destaques | null) => void;
  /** Contexto do mapa no momento do envio (viewport + camadas ativas). */
  getContexto: () => ContextoMapa | null;
}

const SUGESTOES = [
  "Top 10 municípios do Brasil por população",
  "Quais métricas você consegue consultar?",
  "Qual a população de Curitiba?",
];

export function ChatPanel({ onDestaques, getContexto }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Sessão vive na memória do componente: some no refresh (MVP), como definido.
  const sessionId = useRef(crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function ask(pergunta: string) {
    if (!pergunta.trim() || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: pergunta }]);
    setInput("");
    setLoading(true);
    try {
      const res = await sendChat({
        pergunta,
        session_id: sessionId.current,
        contexto_mapa: getContexto(),
      });
      setMessages((prev) => [...prev, { role: "assistant", text: res.resposta }]);
      onDestaques(res.destaques);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Erro inesperado no chat.";
      setMessages((prev) => [...prev, { role: "assistant", text, isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-border">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Bot className="size-3.5" />
        </span>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Chat IA — Censo 2022
        </h2>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2 pb-3">
            <p className="text-xs text-muted-foreground">
              Pergunte sobre os dados do Censo 2022 — a resposta pinta o mapa.
            </p>
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="rounded-lg border border-dashed border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2 pb-3">
            {messages.map((m, i) => (
              <li
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : m.isError
                        ? "max-w-[85%] rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                        : "max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm"
                  }
                >
                  {m.text}
                </div>
              </li>
            ))}
            {loading && (
              <li className="flex justify-start">
                <div className="animate-pulse rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Consultando os dados…
                </div>
              </li>
            )}
            <div ref={bottomRef} />
          </ul>
        )}
      </ScrollArea>

      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte ao mapa…"
          disabled={loading}
          className="h-9 text-sm"
        />
        <Button type="submit" size="icon" className="size-9 shrink-0" disabled={loading}>
          <SendHorizonal className="size-4" />
        </Button>
      </form>
    </section>
  );
}
