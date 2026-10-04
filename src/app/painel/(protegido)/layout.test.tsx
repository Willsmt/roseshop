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

import ProtegidoLayout from "./layout";

const sessionMock = vi.mocked(getAdminSession);
const redirectMock = vi.mocked(redirect);

const renderLayout = async () =>
  render(await ProtegidoLayout({ children: <p>conteúdo</p> }));

beforeEach(() => {
  sessionMock.mockReset();
  redirectMock.mockClear();
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
