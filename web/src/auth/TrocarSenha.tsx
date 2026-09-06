/**
 * Trocar a própria senha. Serve a dois momentos, e a diferença é o `obrigatoria`.
 *
 * Obrigatória: a senha ainda é a provisória, entregue por mensagem. Enquanto ela valer,
 * esta é a única tela alcançável — é o que impede que uma senha que viajou por canal
 * inseguro continue de pé. O botão de sair fica visível mesmo aqui, porque prender
 * alguém numa tela sem saída seria pior que o problema que ela resolve.
 *
 * Voluntária: aberta pelo cabeçalho, com o mapa atrás.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Moldura } from "./Moldura";
import { type Eu, ErroDeAuth, trocarSenha } from "./api";

const MIN_SENHA = 10;

interface Props {
  eu: Eu;
  obrigatoria?: boolean;
  aoTrocar: (eu: Eu) => void;
  aoSair?: () => void;
  aoCancelar?: () => void;
}

export function TrocarSenha({ eu, obrigatoria, aoTrocar, aoSair, aoCancelar }: Props) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    // Conferido aqui porque o servidor não recebe a confirmação: ela existe para pegar
    // erro de digitação, e erro de digitação se pega perto de quem digitou.
    if (nova !== confirmacao) {
      setErro("As duas senhas novas não são iguais.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      aoTrocar(await trocarSenha(atual, nova));
    } catch (e) {
      setErro(e instanceof ErroDeAuth ? e.message : "Não foi possível trocar a senha.");
      setEnviando(false);
    }
  }

  return (
    <Moldura>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">
            {obrigatoria ? "Defina sua senha" : "Trocar senha"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {obrigatoria
              ? "Sua senha atual é provisória. Escolha uma nova para continuar."
              : eu.email}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="atual" className="text-sm font-medium">
            {obrigatoria ? "Senha provisória" : "Senha atual"}
          </label>
          <Input
            id="atual"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nova" className="text-sm font-medium">
            Nova senha
          </label>
          <Input
            id="nova"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_SENHA}
            value={nova}
            onChange={(e) => setNova(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Pelo menos {MIN_SENHA} caracteres.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmacao" className="text-sm font-medium">
            Repita a nova senha
          </label>
          <Input
            id="confirmacao"
            type="password"
            autoComplete="new-password"
            required
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
          />
        </div>

        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}

        <Button type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar"}
        </Button>

        {/* Trocar a senha derruba as outras sessões, e quem faz isso por desconfiar de
            vazamento precisa saber que funcionou. Dizer antes é melhor que a pessoa
            descobrir quando o outro navegador cair. */}
        <p className="text-center text-xs text-muted-foreground">
          Ao trocar a senha, você sai de todos os outros aparelhos.
        </p>

        {obrigatoria && aoSair ? (
          <Button type="button" variant="ghost" onClick={aoSair}>
            Sair
          </Button>
        ) : null}
        {!obrigatoria && aoCancelar ? (
          <Button type="button" variant="ghost" onClick={aoCancelar}>
            Cancelar
          </Button>
        ) : null}
      </form>
    </Moldura>
  );
}
