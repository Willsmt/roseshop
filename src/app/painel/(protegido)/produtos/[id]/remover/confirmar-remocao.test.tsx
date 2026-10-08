// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/produtos/actions", () => ({ removerProduto: vi.fn() }));

import { removerProduto } from "@/lib/produtos/actions";

import { ConfirmarRemocao } from "./confirmar-remocao";

const removerMock = vi.mocked(removerProduto);
const props = { id: 42, versao: 2, codigo: "#0042", nome: "Meia soquete listrada" };
const remover = () => fireEvent.click(screen.getByRole("button", { name: "Remover" }));

beforeEach(() => {
  push.mockReset();
  removerMock.mockReset();
});
afterEach(cleanup);

describe("ConfirmarRemocao (US6)", () => {
  it("confirmação nomeia código e nome", () => {
    render(<ConfirmarRemocao {...props} />);
    expect(
      screen.getByText(
        "O produto #0042 Meia soquete listrada será apagado de vez e não poderá ser recuperado",
      ),
    ).toBeInTheDocument();
  });

  it("Cancelar volta ao detalhe sem chamar a action (AC2)", () => {
    render(<ConfirmarRemocao {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(push).toHaveBeenCalledWith("/painel/produtos/42");
    expect(removerMock).not.toHaveBeenCalled();
  });

  it("envia id e versao; sucesso ⇒ lista com aviso=removido", async () => {
    removerMock.mockResolvedValue({ ok: true });
    render(<ConfirmarRemocao {...props} />);
    remover();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/produtos?aviso=removido"));
    const fd = removerMock.mock.calls[0][1];
    expect(fd.get("id")).toBe("42");
    expect(fd.get("versao")).toBe("2");
  });

  it("nao_existe ⇒ lista com aviso=nao_existe (AC6)", async () => {
    removerMock.mockResolvedValue({ ok: false, motivo: "nao_existe", mensagem: "Este produto não existe mais." });
    render(<ConfirmarRemocao {...props} />);
    remover();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/produtos?aviso=nao_existe"));
  });

  it("outra falha ⇒ Aviso de erro e fica na tela", async () => {
    removerMock.mockResolvedValue({ ok: false, motivo: "alterado", mensagem: "Outra pessoa mudou este produto." });
    render(<ConfirmarRemocao {...props} />);
    remover();
    expect(await screen.findByRole("alert")).toHaveTextContent("Outra pessoa mudou este produto.");
    expect(push).not.toHaveBeenCalled();
  });

  it("sessão expirada (action rejeita): mensagem geral, fica na tela, nada navega", async () => {
    removerMock.mockRejectedValue(new Error("UnauthorizedError"));
    render(<ConfirmarRemocao {...props} />);
    remover();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível concluir agora. Tente de novo em instantes.");
    expect(removerMock).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});
