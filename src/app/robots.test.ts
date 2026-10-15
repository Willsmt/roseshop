import { describe, expect, it } from "vitest";

import robots from "./robots";

// T053 (research D9): allow "/" para todos, sem disallow e sem sitemap.
describe("robots.txt", () => {
  it("é exatamente allow / para todos os agentes", () => {
    expect(robots()).toEqual({ rules: [{ userAgent: "*", allow: "/" }] });
  });

  it("não tem disallow nem sitemap", () => {
    const r = robots();
    expect(r).not.toHaveProperty("sitemap");
    expect(JSON.stringify(r)).not.toMatch(/disallow/i);
  });
});
