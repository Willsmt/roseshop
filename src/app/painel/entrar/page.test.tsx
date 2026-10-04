// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async () => {
  const { safeCallbackPath } = await import("@/lib/auth/callback-path");
  const { loginNoticeFromError } = await import("@/lib/auth/error-message");
  return {
    safeCallbackPath,
    loginNoticeFromError,
    getAdminSession: vi.fn(),
    requireAdminPage: vi.fn(),
    entrarComGoogle: vi.fn(),
  };
});
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/auth";

import EntrarPage from "./page";

const sessionMock = vi.mocked(getAdminSession);
const redirectMock = vi.mocked(redirect);
const FALHA = "Não foi possível entrar agora. Tente de novo em instantes.";
const SMALL = /(^|\s|:)text-(sm|xs)(\s|$)/;

const renderPage = async (sp: { callbackUrl?: string | string[]; error?: string | string[] } = {}) =>
  render(await EntrarPage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  sessionMock.mockReset();
  sessionMock.mockResolvedValue(null);
  redirectMock.mockClear();
});
afterEach(cleanup);

describe("/painel/entrar sem sessão (US1-2, FR-012)", () => {
  it("mostra o título, um único botão primário e nenhum campo de senha", async () => {
    const { container } = await renderPage();
    expect(screen.getByRole("heading", { name: "Painel da loja" })).toBeInTheDocument();
    const primary = container.querySelectorAll('[data-variant="primary"]');
    expect(primary).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Entrar com Google" })).toBe(primary[0]);
    expect(container.querySelector("input[type=password]")).toBeNull();
  });

  it("o botão fica dentro de um <form>", async () => {
    const { container } = await renderPage();
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form).toContainElement(screen.getByRole("button", { name: "Entrar com Google" }));
  });

  it("não usa text-sm nem text-xs (FR-012)", async () => {
    const { container } = await renderPage({ error: "OAuthCallbackError" });
    for (const el of container.querySelectorAll("[class]")) {
      expect(el.getAttribute("class")).not.toMatch(SMALL);
    }
  });
});

describe("campo oculto callbackUrl (US1-4, FR-009)", () => {
  const hidden = (c: HTMLElement) =>
    c.querySelector<HTMLInputElement>("input[type=hidden][name=callbackUrl]");

  it("repassa o caminho interno", async () => {
    const { container } = await renderPage({ callbackUrl: "/painel/produtos" });
    expect(hidden(container)?.value).toBe("/painel/produtos");
  });

  it("troca URL externa por /painel", async () => {
    const { container } = await renderPage({ callbackUrl: "https://evil.com" });
    expect(hidden(container)?.value).toBe("/painel");
  });

  it("sem callbackUrl usa /painel", async () => {
    const { container } = await renderPage();
    expect(hidden(container)?.value).toBe("/painel");
  });
});

describe("aviso de falha (US1-5)", () => {
  it("com error=OAuthCallbackError mostra o aviso e mantém um único primário", async () => {
    const { container } = await renderPage({ error: "OAuthCallbackError" });
    expect(screen.getByText(FALHA)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Entrar com Google" })).toBeInTheDocument();
  });

  it("sem error não mostra o aviso", async () => {
    await renderPage();
    expect(screen.queryByText(FALHA)).toBeNull();
  });
});

describe("sessão autorizada já ativa (US1-3)", () => {
  const ana = { email: "ana@x.com", name: "Ana" };

  it("redireciona para o callbackUrl interno", async () => {
    sessionMock.mockResolvedValue(ana);
    await expect(renderPage({ callbackUrl: "/painel/produtos" })).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/painel/produtos");
  });

  it("callbackUrl externo redireciona para /painel", async () => {
    sessionMock.mockResolvedValue(ana);
    await expect(renderPage({ callbackUrl: "https://evil.com" })).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/painel");
  });
});
