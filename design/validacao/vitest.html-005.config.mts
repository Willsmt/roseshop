import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("../../src", import.meta.url));

// Só a geração do HTML novo da 005 para o diff (design/validacao/html-005.diff.test.tsx). Fica fora
// do `npm test`, que inclui apenas src/, cloudflare/ e scripts/.
export default defineConfig({
  plugins: [react()],
  // design/ está fora do tsconfig (ADR-005), então o alias "@/" vem declarado aqui.
  resolve: { tsconfigPaths: true, alias: { "@": src } },
  test: {
    root: ".",
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["design/validacao/html-005.diff.test.tsx"],
  },
});
