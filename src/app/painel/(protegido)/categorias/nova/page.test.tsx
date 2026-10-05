// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/categorias/actions", () => ({
  criarCategoria: vi.fn(),
  renomearCategoria: vi.fn(),
  removerCategoria: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { requireAdminPage } from "@/lib/auth";

import NovaPage from "./page";

const requireMock = vi.mocked(requireAdminPage);

beforeEach(() => {
  requireMock.mockReset();
  requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
});
afterEach(cleanup);

describe("/painel/categorias/nova (US2)", () => {
  it("chama requireAdminPage('/painel/categorias/nova')", async () => {
    render(await NovaPage());
    expect(requireMock).toHaveBeenCalledWith("/painel/categorias/nova");
  });

  it("guard rejeitando: a página rejeita e nada aparece", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT:/painel/entrar"));
    await expect(NovaPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(document.body.textContent).toBe("");
  });

  it("renderiza o título e o formulário", async () => {
    render(await NovaPage());
    expect(screen.getByRole("heading", { level: 1, name: "Nova categoria" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da categoria")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
  });
});
