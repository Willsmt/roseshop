import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/instance", () => ({ signIn: vi.fn() }));

import { signIn } from "@/lib/auth/instance";

import { entrarComGoogle } from "./actions";

const signInMock = vi.mocked(signIn) as unknown as ReturnType<typeof vi.fn>;

const formWith = (callbackUrl?: FormDataEntryValue) => {
  const fd = new FormData();
  if (callbackUrl !== undefined) fd.set("callbackUrl", callbackUrl);
  return fd;
};

beforeEach(() => {
  signInMock.mockReset();
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
