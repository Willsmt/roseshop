// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/categorias/actions", () => ({
  criarCategoria: vi.fn(),
  renomearCategoria: vi.fn(),
  removerCategoria: vi.fn(),
}));

import { removerCategoria } from "@/lib/categorias/actions";

import { ConfirmarRemocao } from "./confirmar-remocao";

const removerMock = vi.mocked(removerCategoria);
const SMALL = /(^|\s|:)text-(sm|xs)(\s|$)/;
const MIN_H = /(^|\s)min-h-12(\s|$)/;

function montar() {
  return render(<ConfirmarRemocao id={3} versao={2} nome="Bolsas" />);
}
function remover() {
  fireEvent.click(screen.getByRole("button", { name: "Remover" }));
}

beforeEach(() => {
  push.mockReset();
  removerMock.mockReset();
});
afterEach(cleanup);

describe("ConfirmarRemocao (US4)", () => {
  it("mostra o nome e avisa que não pode ser desfeita", () => {
    montar();
    expect(screen.getByText(/Bolsas/)).toBeInTheDocument();
    expect(screen.getByText(/não pode ser desfeita/)).toBeInTheDocument();
  });

  it("Cancelar não chama a action e navega para a lista", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(removerMock).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/painel/categorias");
  });

  it("Remover chama removerCategoria({ id: 3, versao: 2 })", async () => {
    removerMock.mockResolvedValue({ ok: true });
    montar();
    remover();
    await waitFor(() => expect(removerMock).toHaveBeenCalledTimes(1));
    expect(removerMock).toHaveBeenCalledWith({ id: 3, versao: 2 });
  });

  it("ok => router.push('/painel/categorias')", async () => {
    removerMock.mockResolvedValue({ ok: true });
    montar();
    remover();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/categorias"));
  });

  it("tem_produtos => mensagem em role=alert, sem navegar (US4-4)", async () => {
    const msg =
      "Esta categoria tem 3 produtos. Mova esses produtos para outra categoria e tente " +
      "remover de novo.";
    removerMock.mockResolvedValue({ ok: false, motivo: "tem_produtos", mensagem: msg });
    montar();
    remover();
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
    expect(push).not.toHaveBeenCalled();
  });

  it("ultima => mensagem em role=alert, sem navegar (US4-5)", async () => {
    const msg = "A loja precisa ter pelo menos uma categoria. Crie outra antes de remover esta.";
    removerMock.mockResolvedValue({ ok: false, motivo: "ultima", mensagem: msg });
    montar();
    remover();
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
    expect(push).not.toHaveBeenCalled();
  });

  it("action rejeitada => falha_geral, sem navegar", async () => {
    removerMock.mockRejectedValue(new Error("boom"));
    montar();
    remover();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar agora. Tente de novo em instantes.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("botões com min-h-12; sem text-sm/xs (FR-018)", () => {
    const { container } = montar();
    for (const b of screen.getAllByRole("button")) {
      expect(b.getAttribute("class") ?? "").toMatch(MIN_H);
    }
    for (const el of container.querySelectorAll("[class]")) {
      expect(el.getAttribute("class")).not.toMatch(SMALL);
    }
  });
});
