import { describe, expect, it } from "vitest";

import { decideSignIn, isAllowedEmail, parseAllowlist } from "./allowlist";

describe("parseAllowlist", () => {
  it("lê e-mails separados por vírgula (formato bruto)", () => {
    expect([...parseAllowlist("a@x.com,b@x.com")].sort()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("aplica trim e minúsculas (US2-3, FR-003)", () => {
    expect([...parseAllowlist("  Ana@X.com , BIA@x.COM ")].sort()).toEqual([
      "ana@x.com",
      "bia@x.com",
    ]);
  });

  it("descarta entradas vazias e e-mails inválidos", () => {
    expect([...parseAllowlist("a@x.com,, ,não-é-email,@x.com,b@")]).toEqual(["a@x.com"]);
  });

  it("remove duplicatas, inclusive com caixa diferente", () => {
    const set = parseAllowlist("a@x.com,A@X.com, a@x.com ");
    expect(set.size).toBe(1);
    expect(set.has("a@x.com")).toBe(true);
  });

  it("undefined ou vazio resulta em conjunto vazio (FR-014)", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
    expect(parseAllowlist("   ").size).toBe(0);
  });
});

describe("isAllowedEmail", () => {
  it("compara sem diferenciar caixa e espaços dos dois lados (US2-3, FR-003)", () => {
    expect(isAllowedEmail("  ANA@x.com ", " ana@X.com,bia@x.com")).toBe(true);
  });

  it("recusa e-mail fora da lista (US2-1)", () => {
    expect(isAllowedEmail("carla@x.com", "ana@x.com")).toBe(false);
  });

  it("recusa e-mail nulo, indefinido ou vazio", () => {
    expect(isAllowedEmail(null, "ana@x.com")).toBe(false);
    expect(isAllowedEmail(undefined, "ana@x.com")).toBe(false);
    expect(isAllowedEmail("", "ana@x.com")).toBe(false);
  });

  it("lista ausente ou vazia: ninguém entra (FR-014)", () => {
    expect(isAllowedEmail("ana@x.com", undefined)).toBe(false);
    expect(isAllowedEmail("ana@x.com", "")).toBe(false);
  });
});

describe("decideSignIn", () => {
  const raw = "ana@x.com,bia@x.com";

  it("aceita e-mail verificado que está na lista (US1-1)", () => {
    expect(decideSignIn({ email: "ana@x.com", emailVerified: true }, raw)).toBe(true);
  });

  it("recusa e-mail fora da lista (US2-1)", () => {
    expect(decideSignIn({ email: "carla@x.com", emailVerified: true }, raw)).toBe(false);
  });

  it("recusa e-mail ausente", () => {
    expect(decideSignIn({ emailVerified: true }, raw)).toBe(false);
    expect(decideSignIn({ email: null, emailVerified: true }, raw)).toBe(false);
  });

  it("recusa quando emailVerified não é exatamente true (US2-4)", () => {
    expect(decideSignIn({ email: "ana@x.com", emailVerified: false }, raw)).toBe(false);
    expect(decideSignIn({ email: "ana@x.com", emailVerified: null }, raw)).toBe(false);
    expect(decideSignIn({ email: "ana@x.com" }, raw)).toBe(false);
  });

  it("lista vazia ou ausente recusa todos (FR-014)", () => {
    expect(decideSignIn({ email: "ana@x.com", emailVerified: true }, "")).toBe(false);
    expect(decideSignIn({ email: "ana@x.com", emailVerified: true }, undefined)).toBe(false);
  });

  it("lê a lista a cada chamada, sem cache: trocar o valor muda o resultado (US3-3)", () => {
    const input = { email: "ana@x.com", emailVerified: true };
    expect(decideSignIn(input, "ana@x.com")).toBe(true);
    expect(decideSignIn(input, "bia@x.com")).toBe(false);
    expect(decideSignIn(input, "ana@x.com")).toBe(true);
  });
});
