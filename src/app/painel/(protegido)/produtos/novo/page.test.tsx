// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/categorias", () => ({ listarCategorias: vi.fn() }));
vi.mock("@/lib/produtos/actions", () => ({ criarProduto: vi.fn(), editarProduto: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { requireAdminPage } from "@/lib/auth";
import { listarCategorias } from "@/lib/categorias";

import NovoProdutoPage from "./page";

const requireMock = vi.mocked(requireAdminPage);
const listarMock = vi.mocked(listarCategorias);

beforeEach(() => {
  requireMock.mockReset();
  listarMock.mockReset();
  requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
  listarMock.mockResolvedValue([{ id: 1, nome: "Meias" }]);
});
afterEach(cleanup);

describe("/painel/produtos/novo (US1)", () => {
  it("chama requireAdminPage('/painel/produtos/novo') antes de ler categorias", async () => {
    render(await NovoProdutoPage());
    expect(requireMock).toHaveBeenCalledWith("/painel/produtos/novo");
    expect(requireMock.mock.invocationCallOrder[0]).toBeLessThan(listarMock.mock.invocationCallOrder[0]);
  });

  it("guard rejeitando: nada é lido", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(NovoProdutoPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(listarMock).not.toHaveBeenCalled();
  });

  it("mostra o formulário com as categorias", async () => {
    render(await NovoProdutoPage());
    expect(screen.getByRole("heading", { name: "Novo produto" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Meias" })).toBeInTheDocument();
  });
});
