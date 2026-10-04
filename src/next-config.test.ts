import { describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({ initOpenNextCloudflareForDev: vi.fn() }));

import config from "../next.config";

describe("next.config headers (US4-3, R8)", () => {
  it("/painel/:path* (cobre também /painel) recebe Cache-Control private, no-store", async () => {
    const regras = (await config.headers?.()) ?? [];
    const regra = regras.find((r) => r.source === "/painel/:path*");
    expect(regra).toBeDefined();
    expect(regra?.headers).toContainEqual({ key: "Cache-Control", value: "private, no-store" });
  });

  it("nenhuma regra cobre a raiz ou tudo (páginas públicas ficam fora)", async () => {
    const regras = (await config.headers?.()) ?? [];
    for (const r of regras) {
      expect(["/", "/:path*", "/(.*)"]).not.toContain(r.source);
    }
  });
});
