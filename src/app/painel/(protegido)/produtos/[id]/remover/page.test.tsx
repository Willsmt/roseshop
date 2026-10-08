// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/produtos/painel", () => ({ obterProdutoDoPainel: vi.fn() }));
vi.mock("@/lib/produtos/actions", () => ({ removerProduto: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { requireAdminPage } from "@/lib/auth";
import { obterProdutoDoPainel } from "@/lib/produtos/painel";

import RemoverProdutoPage from "./page";

const requireMock = vi.mocked(requireAdminPage);
const obterMock = vi.mocked(obterProdutoDoPainel);
const props = { params: Promise.resolve({ id: "42" }) };

beforeEach(() => {
  requireMock.mockReset();
  obterMock.mockReset();
  requireMock.mockResolvedValue({ email: "ana@x.com", name: "Ana" });
  obterMock.mockResolvedValue({ id: 42, codigo: "#0042", nome: "Meia soquete", versao: 2 } as never);
});
afterEach(cleanup);

describe("/painel/produtos/[id]/remover (US6)", () => {
  it("guard com o id antes da leitura", async () => {
    render(await RemoverProdutoPage(props));
    expect(requireMock).toHaveBeenCalledWith("/painel/produtos/42/remover");
    expect(obterMock).toHaveBeenCalledWith("42", undefined);
    expect(requireMock.mock.invocationCallOrder[0]).toBeLessThan(obterMock.mock.invocationCallOrder[0]);
  });

  it("guard rejeitando: nada é lido", async () => {
    requireMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(RemoverProdutoPage(props)).rejects.toThrow("NEXT_REDIRECT");
    expect(obterMock).not.toHaveBeenCalled();
  });

  it("mostra a confirmação com código e nome", async () => {
    render(await RemoverProdutoPage(props));
    expect(
      screen.getByText("O produto #0042 Meia soquete será apagado de vez e não poderá ser recuperado"),
    ).toBeInTheDocument();
  });

  it("inexistente: 'Produto não encontrado', volta à lista, sem botão Remover", async () => {
    obterMock.mockResolvedValue(null);
    render(await RemoverProdutoPage(props));
    expect(screen.getByText("Produto não encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar à lista" })).toHaveAttribute("href", "/painel/produtos");
    expect(screen.queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
  });
});
