import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.int.setup.ts"],
    include: ["src/**/*.int.test.{ts,tsx}"],
    exclude: configDefaults.exclude,
    testTimeout: 15_000,
  },
});
