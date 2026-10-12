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

  // SF11 / T104 (FR-040): fotos no detalhe, selo "Capa" na 1ª, link "Fotos".
  describe("fotos (SF11, FR-040)", () => {
    const A = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp";
    const B = "11111111-2222-4333-8444-555555555555.jpg";
    const C = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee.webp";
    const foto = (posicao: number, arquivo: string) => ({ posicao, arquivo, url: `/painel/fotos/${arquivo}` });
    const comFotos = (fotos: ReturnType<typeof foto>[]) =>
      obterMock.mockResolvedValue({ ...(produto as object), fotosVersao: 3, fotos } as never);

    it("mostra as fotos na ordem recebida, com src /painel/fotos/<arquivo>", async () => {
      comFotos([foto(1, A), foto(2, B), foto(3, C)]);
      const { container } = render(await DetalhePage(props));
      const imgs = Array.from(container.querySelectorAll("img"));
      expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
        `/painel/fotos/${A}`,
        `/painel/fotos/${B}`,
        `/painel/fotos/${C}`,
      ]);
      for (const i of imgs) expect(i.getAttribute("src")).not.toMatch(/^https?:/);
    });

    it("com fotos, não mostra o marcador 'sem foto'", async () => {
      comFotos([foto(1, A)]);
      render(await DetalhePage(props));
      expect(screen.queryByText("sem foto")).not.toBeInTheDocument();
    });

    it("selo 'Capa' aparece uma única vez, na 1ª foto", async () => {
      comFotos([foto(1, A), foto(2, B)]);
      const { container } = render(await DetalhePage(props));
      const selos = screen.getAllByText("Capa");
      expect(selos).toHaveLength(1);
      const primeira = container.querySelectorAll("img")[0];
      const segunda = container.querySelectorAll("img")[1];
      const bloco = (el: Element) => el.parentElement!;
      expect(bloco(primeira).contains(selos[0]) || bloco(primeira).parentElement!.contains(selos[0])).toBe(true);
      expect(bloco(segunda).contains(selos[0])).toBe(false);
    });

    it("uma foto só: ainda tem o selo 'Capa'", async () => {
      comFotos([foto(1, A)]);
      render(await DetalhePage(props));
      expect(screen.getAllByText("Capa")).toHaveLength(1);
    });

    it("sem fotos (produto legado) ⇒ 'sem foto', sem img e sem selo", async () => {
      const { container } = render(await DetalhePage(props));
      expect(screen.getByText("sem foto")).toBeInTheDocument();
      expect(container.querySelector("img")).toBeNull();
      expect(screen.queryByText("Capa")).not.toBeInTheDocument();
    });

    it("link 'Fotos' vai para /painel/produtos/<id>/fotos (com e sem fotos)", async () => {
      const { unmount } = render(await DetalhePage(props));
      expect(screen.getByRole("link", { name: "Fotos" })).toHaveAttribute("href", "/painel/produtos/42/fotos");
      unmount();
      comFotos([foto(1, A)]);
      render(await DetalhePage(props));
      expect(screen.getByRole("link", { name: "Fotos" })).toHaveAttribute("href", "/painel/produtos/42/fotos");
    });
  });
});
