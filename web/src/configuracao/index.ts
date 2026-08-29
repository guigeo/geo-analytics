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
 * Qual cliente é este build vem de `VITE_CLIENTE`, resolvido pelo alias
 * `cliente-ativo` no `vite.config.ts`. O padrão é `geo-analytics`, então quem
 * não passa nada continua com o comportamento de sempre.
 */
import { cliente } from "cliente-ativo";
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

export const configuracao = validar(cliente);

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
