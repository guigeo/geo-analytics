import type { Destaques } from "@/map/highlight";

// Espelho dos schemas Pydantic do backend (agent/src/geo_agent/schemas.py).
export interface ContextoMapa {
  bbox?: [number, number, number, number];
  zoom?: number;
  centro?: [number, number];
  camadas_ativas: string[];
}

export interface ChatRequest {
  pergunta: string;
  session_id: string;
  contexto_mapa?: ContextoMapa | null;
}

export interface ChatResponse {
  resposta: string;
  destaques: Destaques | null;
  dados: Record<string, unknown>[] | null;
}

// Em dev o Vite faz proxy de /api para o backend (host.docker.internal:8000).
export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b: { detail?: string }) => b.detail)
      .catch(() => undefined);
    throw new Error(detail ?? `Falha no chat (HTTP ${res.status})`);
  }
  return res.json();
}
