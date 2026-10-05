// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/categorias/painel", () => ({
  listarCategoriasDoPainel: vi.fn(),
  obterCategoriaDoPainel: vi.fn(),
}));
vi.mock("@/lib/categorias/actions", () => ({
  criarCategoria: vi.fn(),
  renomearCategoria: vi.fn(),
  removerCategoria: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { requireAdminPage } from "@/lib/auth";
import { obterCategoriaDoPainel } from "@/lib/categorias/painel";

import RemoverPage from "./page";

const requireMock = vi.mocked(requireAdminPage);
const obterMock = vi.mocked(obterCategoriaDoPainel);
const props = { params: Promise.resolve({ id: "3" }) };

beforeEach(() => {
  requireMock.mockReset();
  obterMock.mockReset();
  requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
  obterMock.mockResolvedValue({ id: 3, nome: "Bolsas", versao: 2 });
});
afterEach(cleanup);

describe("/painel/categorias/[id]/remover (US4)", () => {
  it("chama requireAdminPage com a rota do id antes de obterCategoriaDoPainel('3')", async () => {
    render(await RemoverPage(props));
    expect(requireMock).toHaveBeenCalledWith("/painel/categorias/3/remover");
    expect(obterMock).toHaveBeenCalledWith("3");
    expect(requireMock.mock.invocationCallOrder[0]).toBeLessThan(
      obterMock.mock.invocationCallOrder[0],
    );
  });

  it("guard rejeitando: a categoria não é lida", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT:/painel/entrar"));
    await expect(RemoverPage(props)).rejects.toThrow("NEXT_REDIRECT");
    expect(obterMock).not.toHaveBeenCalled();
  });

  it("categoria existente: mostra o nome e o botão Remover", async () => {
    render(await RemoverPage(props));
    expect(screen.getByText(/Bolsas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover" })).toBeInTheDocument();
  });

  it("categoria inexistente: nao_existe, link para a lista e nenhum botão Remover", async () => {
    obterMock.mockResolvedValue(null);
    render(await RemoverPage(props));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Esta categoria não existe mais. Atualize a lista.",
    );
    expect(screen.getByRole("link", { name: "Voltar para a lista" })).toHaveAttribute(
      "href",
      "/painel/categorias",
    );
    expect(screen.getByRole("link", { name: "Voltar para a lista" }).getAttribute("class")).toMatch(
      /(^|\s)min-h-12(\s|$)/,
    );
    expect(screen.queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
  });
});
