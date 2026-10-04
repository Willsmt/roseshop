import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Feature 002, FR-015 (segunda camada; a primeira é src/test/conformance/categorias-acesso.test.ts).
// No flat config a última entrada que casa com o arquivo substitui a opção da regra,
// por isso cada zona declara o conjunto completo do que proíbe.
const SRC = "src/**/*.{ts,tsx,js,jsx,mjs}";
const MSG = "Acesso a categorias fora da fronteira (FR-015, contracts/categorias.md §1-§2).";

const proibirDbCategorias = {
  group: ["@/lib/db/categorias", "**/db/categorias"],
  message: `${MSG} Use o barrel "@/lib/categorias".`,
};
const proibirSchemaCategorias = {
  group: ["@/lib/db/schema", "**/db/schema"],
  importNames: ["categorias"],
  message: `${MSG} O schema de categorias só é usado em src/lib/categorias/ e src/lib/db/.`,
};
const proibirActions = {
  group: ["@/lib/categorias/actions", "**/categorias/actions"],
  message: `${MSG} As actions de categorias só são importadas por src/app/painel/.`,
};
const proibirPainel = {
  group: ["@/lib/categorias/painel", "**/categorias/painel"],
  message: `${MSG} A leitura do painel só é importada por src/app/painel/ e src/lib/categorias/.`,
};

const restringir = (...patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [SRC],
    rules: restringir(proibirDbCategorias, proibirSchemaCategorias, proibirActions, proibirPainel),
  },
  {
    files: ["src/app/painel/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: restringir(proibirDbCategorias, proibirSchemaCategorias),
  },
  {
    // Dentro do próprio módulo o import costuma ser relativo ("./actions"), que o
    // padrão "**/categorias/actions" não alcança.
    files: ["src/lib/categorias/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: restringir({ ...proibirActions, group: [...proibirActions.group, "./actions", "./actions.*"] }),
  },
  {
    files: ["src/lib/db/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: restringir(proibirActions, proibirPainel),
  },
  {
    // Mesma exceção, por arquivo, do teste de conformidade: os testes unitários das
    // Server Actions (T030, T044) moram ao lado de actions.ts e precisam importá-lo.
    files: ["src/lib/categorias/actions.test.ts", "src/lib/categorias/actions.remocao.test.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "node_modules/**",
    "cloudflare-env.d.ts",
    "references/**",
  ]),
]);
