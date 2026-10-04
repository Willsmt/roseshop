import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/instance", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { signIn, signOut } from "@/lib/auth/instance";

import { entrarComGoogle, sair } from "./actions";

const signInMock = vi.mocked(signIn) as unknown as ReturnType<typeof vi.fn>;
const signOutMock = vi.mocked(signOut) as unknown as ReturnType<typeof vi.fn>;

const formWith = (callbackUrl?: FormDataEntryValue) => {
  const fd = new FormData();
  if (callbackUrl !== undefined) fd.set("callbackUrl", callbackUrl);
  return fd;
};

beforeEach(() => {
  signInMock.mockReset();
  signOutMock.mockReset();
});

describe("entrarComGoogle", () => {
  it("callbackUrl interno vai para o Google como redirectTo, sem terceiro argumento (US1-4)", async () => {
    await entrarComGoogle(formWith("/painel/produtos"));
    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/painel/produtos" });
    expect(signInMock.mock.calls[0]).toHaveLength(2);
  });

  it.each(["https://evil.com", "//evil.com"])(
    "callbackUrl externo (%s) cai em /painel (FR-009, US1-4)",
    async (url) => {
      await entrarComGoogle(formWith(url));
      expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/painel" });
    },
  );

  it("sem callbackUrl usa /painel (US1-1)", async () => {
    await entrarComGoogle(formWith());
    expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/painel" });
  });

  it("callbackUrl que não é texto (File/Blob) cai em /painel sem quebrar (validação do FormData)", async () => {
    const file = new File(["x"], "x.txt");
    await expect(entrarComGoogle(formWith(file))).resolves.toBeUndefined();
    expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/painel" });
  });
});

describe("entrarComGoogle: trocar de conta (US2-2)", () => {
  const formComTroca = (trocarConta: FormDataEntryValue) => {
    const fd = formWith("/painel/produtos");
    fd.set("trocarConta", trocarConta);
    return fd;
  };

  it('trocarConta="1" pede a escolha de conta ao Google', async () => {
    await entrarComGoogle(formComTroca("1"));
    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(signInMock).toHaveBeenCalledWith(
      "google",
      { redirectTo: "/painel/produtos" },
      { prompt: "select_account" },
    );
    expect(signInMock.mock.calls[0]).toHaveLength(3);
  });

  it.each([["0"], ["true"], [""], [new File(["x"], "x.txt")]])(
    "trocarConta com outro valor (%o) não envia prompt",
    async (valor) => {
      await entrarComGoogle(formComTroca(valor));
      expect(signInMock).toHaveBeenCalledTimes(1);
      expect(signInMock.mock.calls[0]).toHaveLength(2);
      expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/painel/produtos" });
    },
  );
});

describe("sair (US4-2, FR-017)", () => {
  it("encerra a sessão deste aparelho e vai para /painel/entrar, sem chamar signIn", async () => {
    await sair();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/painel/entrar" });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("sem confirmação: não recebe argumentos e resolve direto (US4-1)", async () => {
    expect(sair.length).toBe(0);
    await expect(sair()).resolves.toBeUndefined();
  });
});
