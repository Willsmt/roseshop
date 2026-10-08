// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/produtos/actions", () => ({
  marcarEsgotado: vi.fn(),
  marcarDisponivel: vi.fn(),
  destacarProduto: vi.fn(),
  tirarProdutoDoDestaque: vi.fn(),
}));

import {
  destacarProduto,
  marcarDisponivel,
  marcarEsgotado,
  tirarProdutoDoDestaque,
} from "@/lib/produtos/actions";

import { AcoesProduto } from "./acoes-produto";

const esgotarMock = vi.mocked(marcarEsgotado);
const disponivelMock = vi.mocked(marcarDisponivel);
const destacarMock = vi.mocked(destacarProduto);
const tirarMock = vi.mocked(tirarProdutoDoDestaque);
const base = { id: 42, versao: 2, esgotado: false, emDestaque: false, podeDestacar: true };
const clicar = (nome: string) => fireEvent.click(screen.getByRole("button", { name: nome }));
const nomes = () => screen.queryAllByRole("button").map((b) => b.textContent);

beforeEach(() => {
  for (const m of [esgotarMock, disponivelMock, destacarMock, tirarMock]) m.mockReset();
});
afterEach(cleanup);

describe("AcoesProduto — botões por estado", () => {
  it("disponível, fora do destaque: Marcar como esgotado + Destacar", () => {
    render(<AcoesProduto {...base} />);
    expect(nomes()).toEqual(["Marcar como esgotado", "Destacar"]);
  });

  it("disponível e em destaque: Marcar como esgotado + Tirar do destaque", () => {
    render(<AcoesProduto {...base} emDestaque podeDestacar={false} />);
    expect(nomes()).toEqual(["Marcar como esgotado", "Tirar do destaque"]);
  });

  it("esgotado: Marcar como disponível e SEM 'Destacar' (US5)", () => {
    render(<AcoesProduto {...base} esgotado podeDestacar={false} />);
    expect(nomes()).toEqual(["Marcar como disponível"]);
  });
});

describe("AcoesProduto — resultados", () => {
  it("envia id e versao (campos ocultos) à action", async () => {
    esgotarMock.mockResolvedValue({ ok: true, saiuDoDestaque: false });
    render(<AcoesProduto {...base} />);
    clicar("Marcar como esgotado");
    await waitFor(() => expect(esgotarMock).toHaveBeenCalledTimes(1));
    const fd = esgotarMock.mock.calls[0][1];
    expect(fd.get("id")).toBe("42");
    expect(fd.get("versao")).toBe("2");
  });

  it("esgotar ⇒ Aviso de sucesso (AC1)", async () => {
    esgotarMock.mockResolvedValue({ ok: true, saiuDoDestaque: false });
    render(<AcoesProduto {...base} />);
    clicar("Marcar como esgotado");
    expect(await screen.findByRole("status")).toHaveTextContent("Produto marcado como esgotado.");
  });

  it("esgotar saindo do destaque ⇒ '...e saiu do destaque' (AC5)", async () => {
    esgotarMock.mockResolvedValue({ ok: true, saiuDoDestaque: true });
    render(<AcoesProduto {...base} emDestaque podeDestacar={false} />);
    clicar("Marcar como esgotado");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Produto marcado como esgotado e saiu do destaque.",
    );
  });

  it("o Aviso de sucesso sobrevive à troca dos botões após o revalidate", async () => {
    esgotarMock.mockResolvedValue({ ok: true, saiuDoDestaque: false });
    const { rerender } = render(<AcoesProduto {...base} />);
    clicar("Marcar como esgotado");
    await screen.findByRole("status");
    rerender(<AcoesProduto {...base} versao={3} esgotado podeDestacar={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Produto marcado como esgotado.");
    expect(nomes()).toEqual(["Marcar como disponível"]);
  });

  it("disponibilizar ⇒ 'Produto disponível de novo.' (AC2)", async () => {
    disponivelMock.mockResolvedValue({ ok: true });
    render(<AcoesProduto {...base} esgotado podeDestacar={false} />);
    clicar("Marcar como disponível");
    expect(await screen.findByRole("status")).toHaveTextContent("Produto disponível de novo.");
  });

  it("destacar e tirar do destaque ⇒ Aviso de sucesso", async () => {
    destacarMock.mockResolvedValue({ ok: true });
    tirarMock.mockResolvedValue({ ok: true });
    const { unmount } = render(<AcoesProduto {...base} />);
    clicar("Destacar");
    expect(await screen.findByRole("status")).toHaveTextContent("Produto em destaque.");
    unmount();
    render(<AcoesProduto {...base} emDestaque podeDestacar={false} />);
    clicar("Tirar do destaque");
    expect(await screen.findByRole("status")).toHaveTextContent("Produto fora do destaque.");
  });

  it.each([
    ["vaga_disputada", "Outra pessoa destacou um produto ao mesmo tempo. Tente de novo."],
    ["ja_em_destaque", "Este produto já está em destaque."],
  ] as const)("falha %s ⇒ Aviso de erro com a mensagem", async (motivo, mensagem) => {
    destacarMock.mockResolvedValue({ ok: false, motivo, mensagem });
    render(<AcoesProduto {...base} />);
    clicar("Destacar");
    expect(await screen.findByRole("alert")).toHaveTextContent(mensagem);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("sessão expirada (action rejeita): Aviso de erro geral, sem sucesso", async () => {
    esgotarMock.mockRejectedValue(new Error("UnauthorizedError"));
    render(<AcoesProduto {...base} />);
    clicar("Marcar como esgotado");
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível concluir agora. Tente de novo em instantes.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(esgotarMock).toHaveBeenCalledTimes(1);
    expect(nomes()).toEqual(["Marcar como esgotado", "Destacar"]);
  });
});
