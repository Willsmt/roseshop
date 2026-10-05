import { defineConfig } from "vitest/config";

// Roda SOMENTE o probe do db.batch contra o Neon dev no CI (feature 002, T062; ADR-008).
// O include é literal para que nenhum teste com TRUNCATE rode no banco do dev.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    // só mock de server-only e env; não adicionar reset ou escrita de banco aqui,
    // o probe roda no Neon dev
    setupFiles: ["./vitest.int.setup.ts"],
    include: ["src/lib/db/batch-transacao.int.test.ts"],
  },
});
