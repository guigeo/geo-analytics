// O portão do lado do navegador: o que a pessoa vê antes de entrar, e o que acontece
// quando a sessão cai no meio do uso.
//
// O que este arquivo NÃO testa, e a ausência é deliberada: se o portal protege alguma
// coisa. Ele não protege — quem protege é o middleware do agente, e o `/api` responde
// 401 a quem não tem sessão independentemente do que esta tela mostre. Testar proteção
// aqui daria uma confiança falsa sobre o lugar errado.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorDeSessao } from "./sessao";
import { sessaoCaiu } from "./api";
import { identidade } from "@/configuracao";
import { cliente as ebPrime } from "@/clientes/eb-prime";
import { cliente as geoAnalytics } from "@/clientes/geo-analytics";

const DENTRO = { email: "pessoa@exemplo.com", trocar_senha: false };

function respostaDe(status: number, corpo?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo ?? {},
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function respondeCom(...respostas: Response[]) {
  const f = fetch as unknown as ReturnType<typeof vi.fn>;
  for (const r of respostas) f.mockResolvedValueOnce(r);
}

describe("o portão", () => {
  it("mostra a tela de entrar quando não há sessão", async () => {
    respondeCom(respostaDe(401));
    render(
      <ProvedorDeSessao>
        <p>o mapa</p>
      </ProvedorDeSessao>,
    );
    expect(await screen.findByLabelText("E-mail")).toBeTruthy();
    expect(screen.queryByText("o mapa")).toBeNull();
  });

  it("não monta a aplicação antes de saber se há sessão", () => {
    // Nunca resolve: é o instante entre a página carregar e o agente responder.
    // Mostrar a tela de entrar aqui faria o portal piscar a cada recarga para quem
    // já está dentro.
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <ProvedorDeSessao>
        <p>o mapa</p>
      </ProvedorDeSessao>,
    );
    expect(container.textContent).toBe("");
  });

  it("mostra a aplicação quando a sessão vale", async () => {
    respondeCom(respostaDe(200, DENTRO));
    render(
      <ProvedorDeSessao>
        <p>o mapa</p>
      </ProvedorDeSessao>,
    );
    expect(await screen.findByText("o mapa")).toBeTruthy();
  });

  it("obriga a trocar a senha provisória antes de chegar ao mapa", async () => {
    respondeCom(respostaDe(200, { ...DENTRO, trocar_senha: true }));
    render(
      <ProvedorDeSessao>
        <p>o mapa</p>
      </ProvedorDeSessao>,
    );
    expect(await screen.findByText("Defina sua senha")).toBeTruthy();
    expect(screen.queryByText("o mapa")).toBeNull();
  });

  it("volta para a tela de entrar quando a sessão cai no meio do uso", async () => {
    // O caminho que os TRÊS consumidores do /api usam ao receber 401. Sem ele, a
    // aplicação ficaria meio dentro e meio fora: o mapa aberto e todo painel dizendo
    // erro, sem ninguém explicar que basta entrar de novo.
    respondeCom(respostaDe(200, DENTRO));
    render(
      <ProvedorDeSessao>
        <p>o mapa</p>
      </ProvedorDeSessao>,
    );
    await screen.findByText("o mapa");

    sessaoCaiu();

    await waitFor(() => expect(screen.queryByText("o mapa")).toBeNull());
    expect(screen.getByLabelText("E-mail")).toBeTruthy();
  });

  it("repete a mensagem do servidor na recusa, sem reescrevê-la", async () => {
    // A mensagem é a MESMA para senha errada e para conta inexistente, e o backend
    // gasta um hash de descarte para que os dois casos custem o mesmo tempo. Reescrever
    // aqui arriscaria distinguir de novo o que lá se juntou de propósito.
    respondeCom(respostaDe(401), respostaDe(401, { detail: "E-mail ou senha incorretos." }));
    render(
      <ProvedorDeSessao>
        <p>o mapa</p>
      </ProvedorDeSessao>,
    );
    fireEvent.change(await screen.findByLabelText("E-mail"), {
      target: { value: "pessoa@exemplo.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "chute" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "E-mail ou senha incorretos.",
    );
  });
});

describe("a marca do cliente na tela de entrar", () => {
  it("usa a identidade do cliente do build, que já é dado", async () => {
    // A regra 1 do ADR-0001 obriga que o que difere entre clientes seja dado, e por
    // isso nome, subtítulo, símbolo, fontes e paletas já vivem em `clientes/<id>.ts`.
    // A tela de entrar não escolhe nada: ela usa o que está lá, e cliente novo traz o
    // próprio arquivo e ganha o portal com a cara certa, sem trabalho de design.
    respondeCom(respostaDe(401));
    render(
      <ProvedorDeSessao>
        <p>o mapa</p>
      </ProvedorDeSessao>,
    );
    expect(await screen.findByRole("heading", { name: identidade.nome })).toBeTruthy();
  });

  it("não deixa o nome de um cliente aparecer no portal do outro", async () => {
    // O mesmo que `identidade.test.ts` guarda para o `<head>`, e pelo mesmo motivo: foi
    // por vazamento de nome entre clientes que aquele teste nasceu. A tela de entrar é
    // a primeira coisa que se vê, então é o pior lugar possível para repetir o erro.
    respondeCom(respostaDe(401));
    render(
      <ProvedorDeSessao>
        <p>o mapa</p>
      </ProvedorDeSessao>,
    );
    await screen.findByLabelText("E-mail");

    const outro =
      identidade.nome === ebPrime.identidade.nome
        ? geoAnalytics.identidade.nome
        : ebPrime.identidade.nome;
    expect(document.body.textContent).not.toContain(outro);
  });
});
