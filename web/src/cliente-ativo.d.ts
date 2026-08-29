/**
 * O módulo virtual do cliente ativo.
 *
 * O caminho real é resolvido no `vite.config.ts` a partir de `VITE_CLIENTE`.
 * Aqui só se declara o formato — e cada arquivo de cliente é conferido contra
 * `ConfiguracaoCliente` no próprio arquivo, então nada deixa de ser tipado.
 */
declare module "cliente-ativo" {
  import type { ConfiguracaoCliente } from "@/configuracao/esquema";
  export const cliente: ConfiguracaoCliente;
}
