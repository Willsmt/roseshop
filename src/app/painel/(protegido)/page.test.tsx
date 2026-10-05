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
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { requireAdminPage } from "@/lib/auth";

import PainelPage from "./page";

const requireMock = vi.mocked(requireAdminPage);
const SMALL = /(^|\s|:)text-(sm|xs)(\s|$)/;

beforeEach(() => {
  requireMock.mockReset();
});
afterEach(cleanup);

describe("/painel (US1-1, US3-1)", () => {
  it("chama requireAdminPage('/painel') uma vez", async () => {
    requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
    render(await PainelPage());
    expect(requireMock).toHaveBeenCalledTimes(1);
    expect(requireMock).toHaveBeenCalledWith("/painel");
  });

  it("a guarda vem antes de renderizar: se rejeitar, a página rejeita e nada aparece (US3-1)", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT:/painel/entrar"));
    await expect(PainelPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(document.body.textContent).toBe("");
  });

  it("saúda pelo nome (US1-1)", async () => {
    requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
    render(await PainelPage());
    expect(screen.getByText("Olá, Ana")).toBeInTheDocument();
  });

  it("sem nome, saúda pelo e-mail (US1-1)", async () => {
    requireMock.mockResolvedValue({ email: "ana@x.com", name: null });
    render(await PainelPage());
    expect(screen.getByText("Olá, ana@x.com")).toBeInTheDocument();
  });

  it("não usa text-sm nem text-xs (FR-012)", async () => {
    requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
    const { container } = render(await PainelPage());
    for (const el of container.querySelectorAll("[class]")) {
      expect(el.getAttribute("class")).not.toMatch(SMALL);
    }
  });

  it("tem link 'Categorias' para /painel/categorias (US1)", async () => {
    requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
    render(await PainelPage());
    expect(screen.getByRole("link", { name: "Categorias" })).toHaveAttribute(
      "href",
      "/painel/categorias",
    );
  });
});
