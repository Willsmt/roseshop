import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.int.setup.ts"],
    include: ["src/test/db/produtos-medicao.int.test.ts"],
    testTimeout: 15_000,
    // Arquivos que fazem TRUNCATE em `categorias` não podem rodar em paralelo (feature 002, T007).
    fileParallelism: false,
  },
});
