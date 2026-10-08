// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/categorias", () => ({ listarCategorias: vi.fn() }));
vi.mock("@/lib/produtos/painel", () => ({ obterProdutoDoPainel: vi.fn() }));
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
import { obterProdutoDoPainel } from "@/lib/produtos/painel";

import EditarProdutoPage from "./page";

const requireMock = vi.mocked(requireAdminPage);
const obterMock = vi.mocked(obterProdutoDoPainel);
const props = { params: Promise.resolve({ id: "5" }) };
const produto = {
  id: 5,
  codigo: "#0005",
  nome: "Meia soquete",
  categoriaId: 2,
  categoriaNome: "Meias",
  descricao: "Macia",
  precoCentavos: 1290,
  preco: "a partir de R$ 12,90",
  aPartirDe: true,
  versao: 3,
} as never;

beforeEach(() => {
  requireMock.mockReset();
  obterMock.mockReset();
  vi.mocked(listarCategorias).mockResolvedValue([
    { id: 1, nome: "Bolsas" },
    { id: 2, nome: "Meias" },
  ]);
  requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
  obterMock.mockResolvedValue(produto);
});
afterEach(cleanup);

describe("/painel/produtos/[id]/editar (US4)", () => {
  it("guard com o id na rota, antes de ler o produto", async () => {
    render(await EditarProdutoPage(props));
    expect(requireMock).toHaveBeenCalledWith("/painel/produtos/5/editar");
    expect(obterMock).toHaveBeenCalledWith("5", undefined);
    expect(requireMock.mock.invocationCallOrder[0]).toBeLessThan(obterMock.mock.invocationCallOrder[0]);
  });

  it("guard rejeitando: o produto não é lido", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(EditarProdutoPage(props)).rejects.toThrow("NEXT_REDIRECT");
    expect(obterMock).not.toHaveBeenCalled();
  });

  it("abre com os valores atuais, preço formatado e id/versao ocultos", async () => {
    const { container } = render(await EditarProdutoPage(props));
    expect(screen.getByLabelText("Nome do produto")).toHaveValue("Meia soquete");
    expect(screen.getByLabelText("Categoria")).toHaveValue("2");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Macia");
    expect(screen.getByLabelText("Preço")).toHaveValue("12,90");
    expect(screen.getByLabelText(/a partir de/i)).toBeChecked();
    expect(container.querySelector('input[name="id"]')).toHaveValue("5");
    expect(container.querySelector('input[name="versao"]')).toHaveValue("3");
  });

  it("inexistente: 'Produto não encontrado' com volta à lista e sem formulário", async () => {
    obterMock.mockResolvedValue(null);
    render(await EditarProdutoPage(props));
    expect(screen.getByText("Produto não encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar à lista" })).toHaveAttribute("href", "/painel/produtos");
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
  });
});
