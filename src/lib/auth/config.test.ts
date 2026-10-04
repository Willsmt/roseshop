import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthConfig } from "./config";

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "ana@x.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type Cb = Record<string, (arg: never) => unknown>;
const callbacks = () => createAuthConfig().callbacks as unknown as Cb;
const call = (name: string, arg: unknown) => callbacks()[name](arg as never);

describe("createAuthConfig: provedor e sessão", () => {
  it("tem só o provedor Google", () => {
    const { providers } = createAuthConfig();
    expect(providers).toHaveLength(1);
    const p = providers[0] as { id?: string };
    expect(p.id).toBe("google");
  });

  it("usa JWT, 30 dias de maxAge e 24 h de updateAge (FR-016, US3-5, US3-6)", () => {
    expect(createAuthConfig().session).toEqual({
      strategy: "jwt",
      maxAge: 2592000,
      updateAge: 86400,
    });
  });

  it("não tem adapter: sem sessão no servidor (US4-4, FR-017)", () => {
    expect("adapter" in createAuthConfig()).toBe(false);
  });

  it("páginas de entrada e erro em /painel/entrar e trustHost ligado", () => {
    const config = createAuthConfig();
    expect(config.pages?.signIn).toBe("/painel/entrar");
    expect(config.pages?.error).toBe("/painel/entrar");
    expect(config.trustHost).toBe(true);
  });
});

describe("callback redirect usa safeCallbackPath (FR-009, US1-4)", () => {
  const redirect = (url: string) => call("redirect", { url, baseUrl: "http://h" });

  it("caminho interno vira URL absoluta", () => {
    expect(redirect("/painel/x")).toBe("http://h/painel/x");
  });

  it("URL da mesma origem é mantida", () => {
    expect(redirect("http://h/painel/y")).toBe("http://h/painel/y");
  });

  it.each(["https://evil.com", "//evil.com", "/"])("%s cai em /painel", (url) => {
    expect(redirect(url)).toBe("http://h/painel");
  });
});

describe("callback signIn decide pela allowlist atual (US1-1, US2-1, US2-4, FR-014)", () => {
  const signIn = (profile: unknown) => call("signIn", { profile });

  it("aceita e-mail da lista e verificado", async () => {
    expect(await signIn({ email: "ana@x.com", email_verified: true })).toBe(true);
  });

  it("aceita com caixa diferente (US2-3)", async () => {
    expect(await signIn({ email: "ANA@x.com", email_verified: true })).toBe(true);
  });

  it("recusa e-mail fora da lista", async () => {
    expect(await signIn({ email: "carla@x.com", email_verified: true })).toBe(false);
  });

  it("recusa e-mail não verificado", async () => {
    expect(await signIn({ email: "ana@x.com", email_verified: false })).toBe(false);
    expect(await signIn({ email: "ana@x.com" })).toBe(false);
  });

  it("recusa sem e-mail ou sem perfil", async () => {
    expect(await signIn({ email_verified: true })).toBe(false);
    expect(await signIn(undefined)).toBe(false);
  });

  it("recusa com a lista vazia (FR-014)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(await signIn({ email: "ana@x.com", email_verified: true })).toBe(false);
  });

  it("lê ADMIN_EMAILS a cada chamada (US3-3)", async () => {
    const cb = callbacks().signIn;
    const arg = { profile: { email: "ana@x.com", email_verified: true } } as never;
    expect(await cb(arg)).toBe(true);
    vi.stubEnv("ADMIN_EMAILS", "bia@x.com");
    expect(await cb(arg)).toBe(false);
  });
});

describe("callbacks jwt e session expõem só email e name (FR-013)", () => {
  const token = { email: "ana@x.com", name: "Ana", picture: "http://p/x.png", sub: "123" };

  it("jwt guarda só email e name, sem picture, sub ou papéis", async () => {
    const out = (await call("jwt", { token })) as Record<string, unknown>;
    expect(out.email).toBe("ana@x.com");
    expect(out.name).toBe("Ana");
    expect(out).not.toHaveProperty("picture");
    expect(out).not.toHaveProperty("sub");
    expect(out).not.toHaveProperty("role");
    expect(out).not.toHaveProperty("roles");
  });

  it("session devolve user com exatamente email e name e mantém expires", async () => {
    const session = {
      user: { email: "x", name: "x", image: "http://p/x.png", id: "1" },
      expires: "2030-01-01T00:00:00.000Z",
    };
    const out = (await call("session", { session, token })) as {
      user: Record<string, unknown>;
      expires: string;
    };
    expect(Object.keys(out.user).sort()).toEqual(["email", "name"]);
    expect(out.user).toEqual({ email: "ana@x.com", name: "Ana" });
    expect(out.expires).toBe("2030-01-01T00:00:00.000Z");
    expect(out).not.toHaveProperty("role");
    expect(out.user).not.toHaveProperty("role");
  });

  it("session usa name null quando o token não tem nome", async () => {
    const out = (await call("session", {
      session: { user: {}, expires: "2030-01-01T00:00:00.000Z" },
      token: { email: "ana@x.com" },
    })) as { user: Record<string, unknown> };
    expect(out.user).toEqual({ email: "ana@x.com", name: null });
  });
});
