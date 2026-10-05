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

import { renomearCategoria } from "@/lib/categorias/actions";

import { FormRenomear } from "./form-renomear";

const renomearMock = vi.mocked(renomearCategoria);

function campo() {
  return screen.getByLabelText("Nome da categoria");
}
function montar() {
  render(<FormRenomear id={3} versao={2} nomeAtual="Bolsas" />);
}
function salvar() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

beforeEach(() => {
  push.mockReset();
  renomearMock.mockReset();
});
afterEach(cleanup);

describe("FormRenomear (US3)", () => {
  it("campo inicia com o nome atual", () => {
    montar();
    expect(campo()).toHaveValue("Bolsas");
  });

  it("envia renomearCategoria({ id: 3, versao: 2, nome })", async () => {
    renomearMock.mockResolvedValue({ ok: true });
    montar();
    fireEvent.change(campo(), { target: { value: "Carteiras" } });
    salvar();
    await waitFor(() => expect(renomearMock).toHaveBeenCalledTimes(1));
    expect(renomearMock).toHaveBeenCalledWith({ id: 3, versao: 2, nome: "Carteiras" });
  });

  it("ok => router.push('/painel/categorias')", async () => {
    renomearMock.mockResolvedValue({ ok: true });
    montar();
    salvar();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/categorias"));
  });

  it("nome_repetido => alerta e texto preservado (US3-4)", async () => {
    renomearMock.mockResolvedValue({
      ok: false,
      motivo: "nome_repetido",
      mensagem: "Já existe uma categoria chamada Anéis.",
      campo: "nome",
    });
    montar();
    fireEvent.change(campo(), { target: { value: "Anéis" } });
    salvar();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Já existe uma categoria chamada Anéis.");
    expect(alerta).toHaveAttribute("id", "nome-erro");
    expect(campo()).toHaveAttribute("aria-invalid", "true");
    expect(campo()).toHaveAttribute("aria-describedby", "nome-erro");
    expect(campo()).toHaveValue("Anéis");
    expect(push).not.toHaveBeenCalled();
  });

  it("alterada => alerta com a mensagem e texto preservado (US3-7)", async () => {
    const msg = "Esta categoria foi alterada por outra pessoa. Atualize a lista e tente de novo.";
    renomearMock.mockResolvedValue({ ok: false, motivo: "alterada", mensagem: msg });
    montar();
    fireEvent.change(campo(), { target: { value: "Carteiras" } });
    salvar();
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
    expect(campo()).toHaveValue("Carteiras");
    expect(push).not.toHaveBeenCalled();
  });

  it("Cancelar navega para a lista sem chamar a action", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(push).toHaveBeenCalledWith("/painel/categorias");
    expect(renomearMock).not.toHaveBeenCalled();
  });

  it("Cancelar tem min-h-12 e não usa text-sm/xs (T070, FR-018)", () => {
    montar();
    const cls = screen.getByRole("button", { name: "Cancelar" }).getAttribute("class") ?? "";
    expect(cls).toMatch(/(^|\s)min-h-12(\s|$)/);
    expect(cls).not.toMatch(/(^|\s|:)text-(sm|xs)(\s|$)/);
  });
});
