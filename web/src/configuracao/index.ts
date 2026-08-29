/**
 * A configuração ativa da aplicação.
 *
 * Um lugar só onde o resto do código pergunta "de que cliente é esta
 * aplicação?". Quem precisa de camada, identidade, mapa ou chat importa daqui e
 * não conhece cliente nenhum pelo nome.
 *
 * A validação roda na importação, ou seja, no boot: configuração inválida
 * derruba a aplicação com a mensagem do Zod dizendo o campo e o porquê. É
 * deliberado — configuração errada que só aparece quando alguém liga uma camada
 * custa mais caro do que aplicação que não sobe.
 *
 * **Fase 2 mexe aqui.** Hoje existe um cliente só e a escolha é estática. Com o
 * segundo, este arquivo passa a resolver o cliente por `VITE_CLIENTE`, mantendo
 * o `geo-analytics` como padrão para quem não passa nada.
 */
import { clienteGeoAnalytics } from "@/clientes/geo-analytics";
import { EsquemaCliente, type ConfiguracaoCliente } from "./esquema";

function validar(bruta: unknown): ConfiguracaoCliente {
  const resultado = EsquemaCliente.safeParse(bruta);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `  ${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("\n");
    throw new Error(`configuração de cliente inválida:\n${problemas}`);
  }
  return resultado.data;
}

export const configuracao = validar(clienteGeoAnalytics);

export const identidade = configuracao.identidade;
export const configuracaoMapa = configuracao.mapa;
export const camadas = configuracao.camadas;
export const configuracaoChat = configuracao.chat;

export type {
  ConfiguracaoCliente,
  ConfiguracaoChat,
  ConfiguracaoMapa,
  DefinicaoCamada,
  Identidade,
} from "./esquema";
