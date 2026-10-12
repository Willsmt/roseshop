import { defineConfig } from "vitest/config";

// Medição manual da IA (feature 004, SF13): `npm run test:ia`, só pelo humano, com a chave dev.
// Fora do check, do test:int e do CI.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/lib/ai/medicao.ia.test.ts"],
    fileParallelism: false,
  },
});
