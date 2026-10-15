import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "cloudflare/**/*.test.ts", "scripts/**/*.test.ts"],
    // Medição da IA roda só em `npm run test:ia` (vitest.ia.config.mts).
    exclude: [...configDefaults.exclude, "src/**/*.int.test.{ts,tsx}", "src/**/*.ia.test.ts"],
  },
});
