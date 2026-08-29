// Lint do frontend. Portado do `webgis-core` — o inventário de herança marca o CI
// como "copiar", e a configuração que o alimenta vem junto. Ver
// ../../webgis/docs/HERANCA.md, §1.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // `src/components/ui/` é shadcn/ui vendorizado: os arquivos exportam o
    // componente e as variantes juntos, que é a forma em que eles chegam. A regra
    // de fast refresh cobraria uma reorganização de código que não é nosso, e que
    // teria de ser refeita a cada atualização do upstream.
    files: ["src/components/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Testes rodam em Node (vitest), não no navegador.
    files: ["**/*.test.{ts,tsx}", "**/testes/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
