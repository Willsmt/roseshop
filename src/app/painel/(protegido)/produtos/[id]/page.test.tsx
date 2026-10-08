// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/produtos/painel", () => ({ obterProdutoDoPainel: vi.fn() }));
vi.mock("@/lib/produtos/actions", () => ({
  marcarEsgotado: vi.fn(),
  marcarDisponivel: vi.fn(),
  destacarProduto: vi.fn(),
  tirarProdutoDoDestaque: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { requireAdminPage } from "@/lib/auth";
import { obterProdutoDoPainel } from "@/lib/produtos/painel";

import DetalhePage from "./page";

const requireMock = vi.mocked(requireAdminPage);
const obterMock = vi.mocked(obterProdutoDoPainel);
const props = { params: Promise.resolve({ id: "42" }), searchParams: Promise.resolve({ voltar: "busca=meia" }) };
const produto = {
  id: 42,
  codigo: "#0042",
  nome: "Meia soquete",
  categoriaNome: "Meias",
  descricao: "Linha 1\nLinha 2 <b>x</b>",
  preco: "R$ 12,90",
  esgotado: false,
  destaqueVaga: null,
  podeDestacar: true,
  versao: 2,
  fotos: [],
  criadoPor: "ana@x.com",
  atualizadoPor: "bia@x.com",
  voltarHref: "/painel/produtos?busca=meia",
} as never;

beforeEach(() => {
  requireMock.mockReset();
  obterMock.mockReset();
  requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
  obterMock.mockResolvedValue(produto);
});
afterEach(cleanup);

describe("/painel/produtos/[id] — detalhe", () => {
  it("guard com o id antes da leitura; repassa 'voltar'", async () => {
    render(await DetalhePage(props));
    expect(requireMock).toHaveBeenCalledWith("/painel/produtos/42");
    expect(obterMock).toHaveBeenCalledWith("42", "busca=meia");
    expect(requireMock.mock.invocationCallOrder[0]).toBeLessThan(obterMock.mock.invocationCallOrder[0]);
  });

  it("guard rejeitando: nada é lido", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(DetalhePage(props)).rejects.toThrow("NEXT_REDIRECT");
    expect(obterMock).not.toHaveBeenCalled();
  });

  it("mostra código, nome, categoria, preço, 'sem foto' e links", async () => {
    render(await DetalhePage(props));
    expect(screen.getByRole("heading", { name: /Meia soquete/ })).toBeInTheDocument();
    for (const t of ["#0042", "Meias", "R\\$ 12,90", "sem foto"]) {
      expect(screen.getByText(new RegExp(t))).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Voltar à lista" })).toHaveAttribute(
      "href",
      "/painel/produtos?busca=meia",
    );
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute("href", "/painel/produtos/42/editar");
    expect(screen.getByRole("link", { name: "Remover" })).toHaveAttribute("href", "/painel/produtos/42/remover");
  });

  it("sem preço ⇒ 'Sem preço'; esgotado e em destaque aparecem", async () => {
    obterMock.mockResolvedValue({ ...(produto as object), preco: null, esgotado: true, destaqueVaga: 2 } as never);
    render(await DetalhePage(props));
    expect(screen.getByText("Sem preço")).toBeInTheDocument();
    expect(screen.getByText("Esgotado")).toBeInTheDocument();
    expect(screen.getByText("Em destaque")).toBeInTheDocument();
  });

  it("descrição como texto puro, com white-space: pre-line", async () => {
    const { container } = render(await DetalhePage(props));
    const desc = screen.getByText(/Linha 1/);
    expect(desc.textContent).toBe("Linha 1\nLinha 2 <b>x</b>");
    expect(desc.getAttribute("class")).toMatch(/whitespace-pre-line/);
    expect(container.querySelector("b")).toBeNull();
  });

  it("autoria: quem criou e quem alterou por último (US4-AC6)", async () => {
    render(await DetalhePage(props));
    expect(screen.getByText(/ana@x\.com/)).toBeInTheDocument();
    expect(screen.getByText(/bia@x\.com/)).toBeInTheDocument();
  });

  it("inexistente: 'Produto não encontrado' com volta à lista, sem ações", async () => {
    obterMock.mockResolvedValue(null);
    render(await DetalhePage(props));
    expect(screen.getByText("Produto não encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar à lista" })).toHaveAttribute("href", "/painel/produtos");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
