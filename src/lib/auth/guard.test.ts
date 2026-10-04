import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/instance", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/instance";

import { getAdminSession, requireAdminAction, requireAdminPage, UnauthorizedError } from "./guard";

const authMock = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>;
const redirectMock = vi.mocked(redirect);

const sessionOf = (user: unknown) => ({ user, expires: "2030-01-01T00:00:00.000Z" });
const ana = sessionOf({ email: "ana@x.com", name: "Ana" });

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "ana@x.com,bia@x.com");
  authMock.mockReset();
  redirectMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAdminSession", () => {
  it("devolve { email, name } com sessão autorizada (US1-1)", async () => {
    authMock.mockResolvedValue(ana);
    await expect(getAdminSession()).resolves.toEqual({ email: "ana@x.com", name: "Ana" });
  });

  it("normaliza o e-mail (trim + minúsculas) e aceita caixa diferente (US2-3)", async () => {
    authMock.mockResolvedValue(sessionOf({ email: "  ANA@X.com ", name: "Ana" }));
    await expect(getAdminSession()).resolves.toEqual({ email: "ana@x.com", name: "Ana" });
  });

  it("name ausente vira null", async () => {
    authMock.mockResolvedValue(sessionOf({ email: "ana@x.com" }));
    await expect(getAdminSession()).resolves.toEqual({ email: "ana@x.com", name: null });
  });

  it("devolve null sem sessão (US3-1)", async () => {
    authMock.mockResolvedValue(null);
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it.each([[{}], [{ email: "" }], [{ email: 42 }], [{ email: "não-é-email" }], [null]])(
    "devolve null com sessão inválida %o (US3-4)",
    async (user) => {
      authMock.mockResolvedValue(sessionOf(user));
      await expect(getAdminSession()).resolves.toBeNull();
    },
  );

  it("devolve null com e-mail fora da lista atual (US3-3)", async () => {
    authMock.mockResolvedValue(sessionOf({ email: "carla@x.com", name: "Carla" }));
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it("devolve null com a allowlist vazia (FR-014)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    authMock.mockResolvedValue(ana);
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it("nunca chama redirect", async () => {
    authMock.mockResolvedValue(null);
    await getAdminSession();
    authMock.mockResolvedValue(sessionOf({ email: "carla@x.com" }));
    await getAdminSession();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("requireAdminPage", () => {
  it("sem sessão redireciona para a entrada com callbackUrl (US3-1, US1-4, FR-006)", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdminPage("/painel/produtos")).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/painel/entrar?callbackUrl=%2Fpainel%2Fprodutos");
  });

  it("caminho externo vira callbackUrl=%2Fpainel (FR-009)", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdminPage("https://evil.com")).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/painel/entrar?callbackUrl=%2Fpainel");
  });

  it("sessão sem e-mail ou com valor inválido equivale a sem sessão (US3-4)", async () => {
    for (const user of [{}, { email: 42 }, { email: "não-é-email" }]) {
      redirectMock.mockClear();
      authMock.mockResolvedValue(sessionOf(user));
      await expect(requireAdminPage("/painel")).rejects.toThrow();
      expect(redirectMock).toHaveBeenCalledWith("/painel/entrar?callbackUrl=%2Fpainel");
    }
  });

  it("e-mail removido de ADMIN_EMAILS equivale a sem sessão (US3-3)", async () => {
    authMock.mockResolvedValue(ana);
    vi.stubEnv("ADMIN_EMAILS", "bia@x.com");
    await expect(requireAdminPage("/painel/produtos")).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/painel/entrar?callbackUrl=%2Fpainel%2Fprodutos");
  });

  it("allowlist vazia recusa (FR-014)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    authMock.mockResolvedValue(ana);
    await expect(requireAdminPage("/painel")).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("sessão autorizada devolve { email, name } sem redirecionar (US1-1)", async () => {
    authMock.mockResolvedValue(ana);
    await expect(requireAdminPage("/painel")).resolves.toEqual({
      email: "ana@x.com",
      name: "Ana",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("requireAdminAction", () => {
  it("sem sessão lança UnauthorizedError (US3-2, FR-007)", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdminAction()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("e-mail fora da lista atual lança UnauthorizedError sem vazar o e-mail (US3-3)", async () => {
    authMock.mockResolvedValue(sessionOf({ email: "carla@x.com", name: "Carla" }));
    const err = await requireAdminAction().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect((err as Error).message).not.toContain("carla@x.com");
  });

  it("sessão inválida lança UnauthorizedError (US3-4)", async () => {
    authMock.mockResolvedValue(sessionOf({ email: 42 }));
    await expect(requireAdminAction()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("allowlist vazia lança UnauthorizedError (FR-014)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    authMock.mockResolvedValue(ana);
    await expect(requireAdminAction()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("sessão autorizada devolve { email, name }", async () => {
    authMock.mockResolvedValue(ana);
    await expect(requireAdminAction()).resolves.toEqual({ email: "ana@x.com", name: "Ana" });
  });
});

describe("UnauthorizedError", () => {
  it("é um Error", () => {
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
  });
});
