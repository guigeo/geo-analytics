/**
 * A tela de entrar — a primeira coisa que a pessoa vê.
 *
 * Não há "esqueci minha senha": não existe serviço de e-mail no sistema, e inventar um
 * para um punhado de pessoas por cliente traria chave, entregabilidade, token com
 * expiração e uma superfície de ataque que hoje não existe. Quem esquece fala com quem
 * opera, e o `criar-usuario.sh --resetar` resolve — o rodapé diz isso em vez de deixar
 * a pessoa procurando um link que não existe.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Moldura } from "./Moldura";
import { type Eu, ErroDeAuth, entrar } from "./api";

interface Props {
  aoEntrar: (eu: Eu) => void;
}

export function Entrar({ aoEntrar }: Props) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      aoEntrar(await entrar(email, senha));
    } catch (e) {
      // A mensagem vem do servidor de propósito: ela é a MESMA para senha errada e
      // para conta inexistente, e reescrevê-la aqui arriscaria distinguir as duas —
      // que é justamente o que o backend gasta um hash de descarte para não fazer.
      setErro(e instanceof ErroDeAuth ? e.message : "Não foi possível entrar.");
      setEnviando(false);
    }
  }

  return (
    <Moldura>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            E-mail
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="senha" className="text-sm font-medium">
            Senha
          </label>
          <Input
            id="senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>

        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}

        <Button type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Esqueceu a senha? Fale com quem administra o acesso.
        </p>
      </form>
    </Moldura>
  );
}
