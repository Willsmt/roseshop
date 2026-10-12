// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SF11 / T104: página de gerenciar fotos (US4, FR-040). GerenciarFotos mockado (T103 testa).
const { gerenciar } = vi.hoisted(() => ({ gerenciar: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/produtos/painel", () => ({ obterProdutoDoPainel: vi.fn() }));
vi.mock("./gerenciar-fotos", () => ({
  GerenciarFotos: (props: unknown) => {
    gerenciar(props);
    return <div data-testid="gerenciar-fotos" />;
  },
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

import FotosPage from "./page";

const requireMock = vi.mocked(requireAdminPage);
const obterMock = vi.mocked(obterProdutoDoPainel);
const props = { params: Promise.resolve({ id: "42" }) };
const fotos = [
  { posicao: 1, arquivo: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp", url: "/painel/fotos/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp" },
  { posicao: 2, arquivo: "11111111-2222-4333-8444-555555555555.jpg", url: "/painel/fotos/11111111-2222-4333-8444-555555555555.jpg" },
];
const produto = { id: 42, codigo: "#0042", nome: "Meia soquete", fotosVersao: 5, fotos } as never;

beforeEach(() => {
  requireMock.mockReset();
  obterMock.mockReset();
  gerenciar.mockReset();
  requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
  obterMock.mockResolvedValue(produto);
});
afterEach(cleanup);

describe("/painel/produtos/[id]/fotos (SF11)", () => {
  it("guard com o caminho das fotos antes da leitura", async () => {
    render(await FotosPage(props));
    expect(requireMock).toHaveBeenCalledWith("/painel/produtos/42/fotos");
    expect(obterMock).toHaveBeenCalledWith("42", undefined);
    expect(requireMock.mock.invocationCallOrder[0]).toBeLessThan(obterMock.mock.invocationCallOrder[0]);
  });

  it("guard rejeitando: nada é lido", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(FotosPage(props)).rejects.toThrow("NEXT_REDIRECT");
    expect(obterMock).not.toHaveBeenCalled();
    expect(gerenciar).not.toHaveBeenCalled();
  });

  it("inexistente: 'Produto não encontrado' com volta à lista, sem GerenciarFotos", async () => {
    obterMock.mockResolvedValue(null);
    render(await FotosPage(props));
    expect(screen.getByText("Produto não encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar à lista" })).toHaveAttribute("href", "/painel/produtos");
    expect(screen.queryByTestId("gerenciar-fotos")).not.toBeInTheDocument();
  });

  it("existente: título 'Fotos', código, nome e link 'Voltar ao produto'", async () => {
    render(await FotosPage(props));
    expect(screen.getByRole("heading", { level: 1, name: "Fotos" })).toBeInTheDocument();
    expect(screen.getByText(/#0042/)).toBeInTheDocument();
    expect(screen.getByText(/Meia soquete/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao produto" })).toHaveAttribute("href", "/painel/produtos/42");
  });

  it("GerenciarFotos recebe produtoId e inicial = { fotosVersao, fotos }", async () => {
    render(await FotosPage(props));
    expect(screen.getByTestId("gerenciar-fotos")).toBeInTheDocument();
    expect(gerenciar).toHaveBeenCalledTimes(1);
    expect(gerenciar.mock.calls[0][0]).toEqual({
      produtoId: 42,
      inicial: { fotosVersao: 5, fotos },
    });
  });
});
