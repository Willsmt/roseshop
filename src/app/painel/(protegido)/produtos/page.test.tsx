// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/categorias", () => ({ listarCategorias: vi.fn() }));
vi.mock("@/lib/produtos/painel", () => ({ listarProdutosDoPainel: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { requireAdminPage } from "@/lib/auth";
import { listarCategorias } from "@/lib/categorias";
import { listarProdutosDoPainel } from "@/lib/produtos/painel";

import ProdutosPage from "./page";

const requireMock = vi.mocked(requireAdminPage);
const listarMock = vi.mocked(listarProdutosDoPainel);
const item = {
  id: 42,
  codigo: "#0042",
  nome: "Meia soquete",
  categoriaNome: "Meias",
  esgotado: false,
  emDestaque: false,
  preco: "R$ 12,90",
  href: "/painel/produtos/42",
  capaUrl: null as string | null,
};
const base = { itens: [item], verMais: null, voltarAoComeco: null, aviso: null };
const vazioSp = { searchParams: Promise.resolve({}) };

beforeEach(() => {
  requireMock.mockReset();
  listarMock.mockReset();
  requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
  listarMock.mockResolvedValue(base);
  vi.mocked(listarCategorias).mockResolvedValue([{ id: 3, nome: "Meias" }]);
});
afterEach(cleanup);

describe("/painel/produtos — lista (US3)", () => {
  it("guard antes da leitura; passa os searchParams à leitura", async () => {
    const sp = { busca: "meia", situacao: "esgotado" };
    render(await ProdutosPage({ searchParams: Promise.resolve(sp) }));
    expect(requireMock).toHaveBeenCalledWith("/painel/produtos");
    expect(listarMock).toHaveBeenCalledWith(sp);
    expect(requireMock.mock.invocationCallOrder[0]).toBeLessThan(listarMock.mock.invocationCallOrder[0]);
  });

  it("guard rejeitando: nada é lido", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(ProdutosPage(vazioSp)).rejects.toThrow("NEXT_REDIRECT");
    expect(listarMock).not.toHaveBeenCalled();
  });

  it("item: código, nome, categoria, preço e link do detalhe; marcador 'sem foto'", async () => {
    render(await ProdutosPage(vazioSp));
    const link = screen.getByRole("link", { name: /Meia soquete/ });
    expect(link).toHaveAttribute("href", "/painel/produtos/42");
    const lista = within(screen.getByRole("list"));
    for (const t of ["#0042", "Meias", "R$ 12,90", "sem foto"]) {
      expect(lista.getByText(t)).toBeInTheDocument();
    }
    const semBadges = within(screen.getByRole("list"));
    expect(semBadges.queryByText("Esgotado")).not.toBeInTheDocument();
    expect(semBadges.queryByText("Em destaque")).not.toBeInTheDocument();
  });

  it("'Esgotado', 'Em destaque' e 'Sem preço'", async () => {
    listarMock.mockResolvedValue({
      ...base,
      itens: [{ ...item, esgotado: true, emDestaque: true, preco: null }],
    });
    render(await ProdutosPage(vazioSp));
    const lista = within(screen.getByRole("list"));
    expect(lista.getByText("Esgotado")).toBeInTheDocument();
    expect(lista.getByText("Em destaque")).toBeInTheDocument();
    expect(lista.getByText("Sem preço")).toBeInTheDocument();
  });

  it("'Ver mais produtos' e 'Voltar ao começo' só quando os hrefs existem", async () => {
    const { unmount } = render(await ProdutosPage(vazioSp));
    expect(screen.queryByRole("link", { name: "Ver mais produtos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Voltar ao começo" })).not.toBeInTheDocument();
    unmount();
    listarMock.mockResolvedValue({ ...base, verMais: "/painel/produtos?antes=42", voltarAoComeco: "/painel/produtos" });
    render(await ProdutosPage(vazioSp));
    expect(screen.getByRole("link", { name: "Ver mais produtos" })).toHaveAttribute(
      "href",
      "/painel/produtos?antes=42",
    );
    expect(screen.getByRole("link", { name: "Voltar ao começo" })).toHaveAttribute("href", "/painel/produtos");
  });

  it("vazio sem filtro ⇒ convite 'Novo produto'", async () => {
    listarMock.mockResolvedValue({ ...base, itens: [] });
    render(await ProdutosPage(vazioSp));
    expect(screen.getAllByRole("link", { name: "Novo produto" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Nada encontrado/i)).not.toBeInTheDocument();
  });

  it("vazio com filtro ⇒ 'nada encontrado' com 'Limpar filtros'", async () => {
    listarMock.mockResolvedValue({ ...base, itens: [] });
    render(await ProdutosPage({ searchParams: Promise.resolve({ busca: "xyz" }) }));
    expect(screen.getByText(/Nada encontrado/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Limpar filtros" })).toHaveAttribute("href", "/painel/produtos");
  });

  it("filtros: categoria (do barrel), situação e busca, preenchidos pela URL", async () => {
    render(await ProdutosPage({ searchParams: Promise.resolve({ categoria: "3", situacao: "esgotado", busca: "meia" }) }));
    expect(screen.getByLabelText("Categoria")).toHaveValue("3");
    expect(screen.getByLabelText("Situação")).toHaveValue("esgotado");
    expect(screen.getByLabelText("Buscar por nome ou código")).toHaveValue("meia");
    expect(screen.getByRole("button", { name: "Filtrar" })).toBeInTheDocument();
  });

  it("aviso de sucesso e de erro no Aviso do tipo dele", async () => {
    listarMock.mockResolvedValue({ ...base, aviso: { tipo: "sucesso", texto: "Produto removido." } });
    const { unmount } = render(await ProdutosPage(vazioSp));
    expect(screen.getByRole("status")).toHaveTextContent("Produto removido.");
    unmount();
    listarMock.mockResolvedValue({ ...base, aviso: { tipo: "erro", texto: "Este produto não existe mais." } });
    render(await ProdutosPage(vazioSp));
    expect(screen.getByRole("alert")).toHaveTextContent("Este produto não existe mais.");
  });

  // SF11 / T104 (FR-039, D17): miniatura da capa na lista.
  it("item com capaUrl ⇒ img com src = capaUrl, loading lazy; sem 'sem foto' nele", async () => {
    const capaUrl = "/painel/fotos/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp";
    listarMock.mockResolvedValue({ ...base, itens: [{ ...item, capaUrl }] });
    const { container } = render(await ProdutosPage(vazioSp));
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", capaUrl);
    expect(img).toHaveAttribute("loading", "lazy");
    expect(within(screen.getByRole("list")).queryByText("sem foto")).not.toBeInTheDocument();
  });

  it("item com capaUrl null ⇒ 'sem foto' e nenhuma img", async () => {
    const { container } = render(await ProdutosPage(vazioSp));
    expect(within(screen.getByRole("list")).getByText("sem foto")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("lista mista: só o item sem capa mostra 'sem foto'", async () => {
    const capaUrl = "/painel/fotos/11111111-2222-4333-8444-555555555555.jpg";
    listarMock.mockResolvedValue({
      ...base,
      itens: [
        { ...item, id: 1, href: "/painel/produtos/1", nome: "Com capa", capaUrl },
        { ...item, id: 2, href: "/painel/produtos/2", nome: "Sem capa", capaUrl: null },
      ],
    });
    const { container } = render(await ProdutosPage(vazioSp));
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(within(screen.getByRole("list")).getAllByText("sem foto")).toHaveLength(1);
  });
});
