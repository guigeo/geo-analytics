/**
 * O portão do lado do navegador: decide entre a tela de entrar e a aplicação.
 *
 * Ele NÃO é o que protege nada — quem protege é o middleware do agente, e o `/api`
 * responde 401 a quem não tem sessão, independentemente do que esta tela mostre. Aqui
 * se resolve só o que a pessoa vê.
 *
 * A distinção importa porque, desde a emenda de 2026-09-06 à §9 do ADR-0001, o site
 * estático é servido sem portão nenhum: qualquer um baixa este arquivo. Ele não guarda
 * segredo e não decide acesso; se decidisse, o portão estaria no lugar errado.
 */
import { useCallback, useEffect, useState } from "react";
import { Entrar } from "./Entrar";
import { TrocarSenha } from "./TrocarSenha";
import { ContextoDeSessao } from "./contexto";
import { type Eu, quemSouEu, registrarPerdaDeSessao, sair as sairDaSessao } from "./api";

type Estado = { fase: "verificando" } | { fase: "fora" } | { fase: "dentro"; eu: Eu };

export function ProvedorDeSessao({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" });

  // Uma pergunta ao agente no primeiro render. É ela que faz recarregar a página com
  // sessão válida cair direto no mapa, em vez de pedir a senha de novo.
  useEffect(() => {
    let vivo = true;
    quemSouEu()
      .then((eu) => vivo && setEstado(eu ? { fase: "dentro", eu } : { fase: "fora" }))
      // Falha de rede ou 503 não é "sem sessão", mas a tela de entrar é o único lugar
      // com onde exibir isso — e tentar entrar é a ação certa quando o serviço voltar.
      .catch(() => vivo && setEstado({ fase: "fora" }));
    return () => {
      vivo = false;
    };
  }, []);

  // Qualquer 401 vindo de qualquer cliente de API cai aqui. Um assinante só, e é este.
  useEffect(() => {
    registrarPerdaDeSessao(() => setEstado({ fase: "fora" }));
    return () => registrarPerdaDeSessao(null);
  }, []);

  const sair = useCallback(async () => {
    // O estado local muda mesmo se a chamada falhar: quem clicou em sair espera sair.
    // A revogação de verdade é do servidor, e a linha da sessão vence sozinha se a
    // requisição não chegou.
    try {
      await sairDaSessao();
    } finally {
      setEstado({ fase: "fora" });
    }
  }, []);

  const atualizar = useCallback((eu: Eu) => setEstado({ fase: "dentro", eu }), []);

  // Nada é pintado enquanto não se sabe. Mostrar a tela de entrar antes da resposta
  // faria o portal piscar a cada recarga para quem já está dentro.
  if (estado.fase === "verificando") return null;

  if (estado.fase === "fora") {
    return <Entrar aoEntrar={(eu) => setEstado({ fase: "dentro", eu })} />;
  }

  // Senha ainda provisória: a troca é a única tela alcançável. É o que impede que uma
  // senha entregue por mensagem continue valendo depois da primeira entrada.
  if (estado.eu.trocar_senha) {
    return <TrocarSenha obrigatoria eu={estado.eu} aoTrocar={atualizar} aoSair={sair} />;
  }

  return (
    <ContextoDeSessao.Provider value={{ eu: estado.eu, sair, atualizar }}>
      {children}
    </ContextoDeSessao.Provider>
  );
}
