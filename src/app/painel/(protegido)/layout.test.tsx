// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    sair: vi.fn(),
  };
});
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getAdminSession, sair } from "@/lib/auth";

import ProtegidoLayout from "./layout";

const sessionMock = vi.mocked(getAdminSession);
const redirectMock = vi.mocked(redirect);
const sairMock = vi.mocked(sair);
const SMALL = /(^|\s|:)text-(sm|xs)(\s|$)/;

const renderLayout = async () =>
  render(await ProtegidoLayout({ children: <p>conteúdo</p> }));

beforeEach(() => {
  sessionMock.mockReset();
  redirectMock.mockClear();
  sairMock.mockReset();
});
afterEach(cleanup);

describe("layout (protegido)", () => {
  it("com sessão: chama getAdminSession, nunca redirect, e mostra a moldura com o children (US1-1)", async () => {
    sessionMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
    await renderLayout();
    expect(sessionMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    const banner = screen.getByRole("banner");
    expect(banner).toHaveTextContent("Painel da loja");
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("sem sessão: nunca chama redirect e renderiza só o children (US3-1, H1)", async () => {
    sessionMock.mockResolvedValue(null);
    await renderLayout();
    expect(sessionMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByText(/Ana/)).toBeNull();
    expect(screen.queryByText(/ana@x\.com/)).toBeNull();
  });
});

describe("layout (protegido): botão Sair (US4-1, US4-2, FR-010, FR-012)", () => {
  const ana = { email: "ana@x.com", name: "Ana" };
  const renderComSessao = async (children: React.ReactNode = <p>conteúdo</p>) => {
    sessionMock.mockResolvedValue(ana);
    return render(await ProtegidoLayout({ children }));
  };

  it("há um botão 'Sair' visível, dentro do banner e de um <form> (US4-1)", async () => {
    await renderComSessao();
    const botao = screen.getByRole("button", { name: "Sair" });
    expect(screen.getByRole("banner")).toContainElement(botao);
    expect(botao.closest("form")).not.toBeNull();
  });

  it("sem menu escondido: nada de details, dialog, role=menu ou aria-haspopup (US4-1, FR-010)", async () => {
    const { container } = await renderComSessao();
    expect(
      container.querySelector("details, dialog, [role=menu], [aria-haspopup]"),
    ).toBeNull();
  });

  it("o botão é secundário", async () => {
    await renderComSessao();
    expect(screen.getByRole("button", { name: "Sair" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("enviar o form dispara a action sair (US4-2)", async () => {
    await renderComSessao();
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(sairMock).toHaveBeenCalledTimes(1));
  });

  it("'Sair' não é primário: com um primário na página sobra exatamente 1", async () => {
    const { container } = await renderComSessao(<Button variant="primary">Publicar</Button>);
    expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  });

  it("não usa text-sm nem text-xs com sessão (FR-012)", async () => {
    const { container } = await renderComSessao();
    for (const el of container.querySelectorAll("[class]")) {
      expect(el.getAttribute("class")).not.toMatch(SMALL);
    }
  });

  it("sem sessão não existe botão 'Sair' (US3-1, H1)", async () => {
    sessionMock.mockResolvedValue(null);
    render(await ProtegidoLayout({ children: <p>conteúdo</p> }));
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
  });
});
