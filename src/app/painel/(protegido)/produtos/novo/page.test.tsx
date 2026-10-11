// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdminPage: vi.fn() }));
vi.mock("@/lib/categorias", () => ({ listarCategorias: vi.fn() }));
vi.mock("@/lib/produtos/actions", () => ({ criarProduto: vi.fn(), editarProduto: vi.fn() }));
vi.mock("@/lib/fotos/actions", () => ({ pedirEnvio: vi.fn(), confirmarEnvio: vi.fn() }));
vi.mock("react-easy-crop", () => ({ default: () => null }));
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

// Celular: (pointer: coarse) casa (US1-AC1 fala dos botões do celular).
function matchMediaCelular(consulta: string) {
  return {
    matches: consulta.includes("coarse"),
    media: consulta,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { value: vi.fn(matchMediaCelular), configurable: true, writable: true });
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

  it("heading 'Novo produto' e o formulário (passo Dados, ainda escondido) recebe as categorias", async () => {
    render(await NovoProdutoPage());
    expect(screen.getByRole("heading", { name: "Novo produto" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Meias", hidden: true })).toBeInTheDocument();
  });

  it("US1-AC1: começa no passo Fotos, com 'Tirar foto' e 'Escolher da galeria' e 'Continuar' indisponível", async () => {
    render(await NovoProdutoPage());
    expect(screen.getByRole("heading", { name: "Fotos" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Tirar foto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher da galeria" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    // O passo Dados está montado, mas escondido.
    expect(screen.queryByRole("heading", { name: "Dados do produto" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dados do produto", hidden: true }).closest("[hidden]")).not.toBeNull();
  });
});
