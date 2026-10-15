import { describe, expect, it } from "vitest";

import { validarSlug } from "./slug";

// T027 / research D7 (slug do filtro).

describe("validarSlug", () => {
  it.each(["meias", "guarda-chuvas", "meias-3", "açaí", "a", "a".repeat(60)])(
    "aceita %s",
    (slug) => {
      expect(validarSlug(slug)).toBe(slug);
    },
  );

  it.each(["", "Meias", "meias--x", "-meias", "meias-", "a/b", "a".repeat(61), "a b"])(
    "recusa %j",
    (slug) => {
      expect(validarSlug(slug)).toBeNull();
    },
  );

  it("recusa o que não é texto", () => {
    expect(validarSlug(undefined)).toBeNull();
    expect(validarSlug(42)).toBeNull();
  });
});
