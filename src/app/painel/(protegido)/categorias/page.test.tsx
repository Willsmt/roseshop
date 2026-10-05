// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/categorias/painel", () => ({
  listarCategoriasDoPainel: vi.fn(),
  obterCategoriaDoPainel: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { requireAdminPage } from "@/lib/auth";
import { listarCategoriasDoPainel } from "@/lib/categorias/painel";

import CategoriasPage from "./page";

const requireMock = vi.mocked(requireAdminPage);
const listarMock = vi.mocked(listarCategoriasDoPainel);
const SMALL = /(^|\s|:)text-(sm|xs)(\s|$)/;
const MIN_H = /(^|\s)min-h-12(\s|$)/;

const CATS = [
  { id: 7, nome: "Zebra", versao: 1 },
  { id: 3, nome: "Bolsas", versao: 2 },
  { id: 5, nome: "Anéis", versao: 1 },
];

beforeEach(() => {
  requireMock.mockReset();
  listarMock.mockReset();
  requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
  listarMock.mockResolvedValue(CATS);
});
afterEach(cleanup);

describe("/painel/categorias (US1, FR-010, FR-017, FR-018)", () => {
  it("chama requireAdminPage('/painel/categorias') antes de ler a lista", async () => {
    render(await CategoriasPage());
    expect(requireMock).toHaveBeenCalledWith("/painel/categorias");
    expect(requireMock.mock.invocationCallOrder[0]).toBeLessThan(
      listarMock.mock.invocationCallOrder[0],
    );
  });

  it("guard rejeitando: a lista não é lida e a página rejeita", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT:/painel/entrar"));
    await expect(CategoriasPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(listarMock).not.toHaveBeenCalled();
  });

  it("um <li> por categoria, na ordem recebida (US1)", async () => {
    render(await CategoriasPage());
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Zebra"),
      expect.stringContaining("Bolsas"),
      expect.stringContaining("Anéis"),
    ]);
  });

  it("links Renomear/Remover com href correto por id", async () => {
    render(await CategoriasPage());
    const items = screen.getAllByRole("listitem");
    CATS.forEach((c, i) => {
      const li = within(items[i]);
      expect(li.getByRole("link", { name: /Renomear/ })).toHaveAttribute(
        "href",
        `/painel/categorias/${c.id}/renomear`,
      );
      expect(li.getByRole("link", { name: /Remover/ })).toHaveAttribute(
        "href",
        `/painel/categorias/${c.id}/remover`,
      );
    });
  });

  it("link 'Nova categoria' aponta para /painel/categorias/nova", async () => {
    render(await CategoriasPage());
    expect(screen.getByRole("link", { name: "Nova categoria" })).toHaveAttribute(
      "href",
      "/painel/categorias/nova",
    );
  });

  it("não usa text-sm nem text-xs (FR-018)", async () => {
    const { container } = render(await CategoriasPage());
    for (const el of container.querySelectorAll("[class]")) {
      expect(el.getAttribute("class")).not.toMatch(SMALL);
    }
  });

  it("'Voltar ao painel' -> /painel, min-h-12, sem text-sm/xs (T070)", async () => {
    render(await CategoriasPage());
    const voltar = screen.getByRole("link", { name: "Voltar ao painel" });
    expect(voltar).toHaveAttribute("href", "/painel");
    expect(voltar.getAttribute("class") ?? "").toMatch(MIN_H);
    expect(voltar.getAttribute("class") ?? "").not.toMatch(SMALL);
  });

  it("todos os links têm min-h-12 (FR-018)", async () => {
    const { container } = render(await CategoriasPage());
    const links = container.querySelectorAll("a");
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.getAttribute("class") ?? "").toMatch(MIN_H);
  });
});
