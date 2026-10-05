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

import { criarCategoria } from "@/lib/categorias/actions";

import { FormCriar } from "./form-criar";

const criarMock = vi.mocked(criarCategoria);
const SMALL = /(^|\s|:)text-(sm|xs)(\s|$)/;
const MIN_H = /(^|\s)min-h-12(\s|$)/;

function digitar(valor: string) {
  fireEvent.change(screen.getByLabelText("Nome da categoria"), { target: { value: valor } });
}
function salvar() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

beforeEach(() => {
  push.mockReset();
  criarMock.mockReset();
});
afterEach(cleanup);

describe("FormCriar (US2)", () => {
  it("envia o valor cru, sem trim, para criarCategoria", async () => {
    criarMock.mockResolvedValue({ ok: true });
    render(<FormCriar />);
    digitar("  Bolsas  ");
    salvar();
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    expect(criarMock).toHaveBeenCalledWith({ nome: "  Bolsas  " });
  });

  it("ok => router.push('/painel/categorias')", async () => {
    criarMock.mockResolvedValue({ ok: true });
    render(<FormCriar />);
    digitar("Bolsas");
    salvar();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/categorias"));
  });

  it("falha => alerta nome-erro, aria-invalid/describedby e texto preservado (US2-8)", async () => {
    criarMock.mockResolvedValue({
      ok: false,
      motivo: "nome_repetido",
      mensagem: "Já existe uma categoria chamada Bolsas. Escolha outro nome.",
      campo: "nome",
    });
    render(<FormCriar />);
    digitar("Bolsas");
    salvar();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Já existe uma categoria chamada Bolsas. Escolha outro nome.");
    expect(alerta).toHaveAttribute("id", "nome-erro");
    const input = screen.getByLabelText("Nome da categoria");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "nome-erro");
    expect(input).toHaveValue("Bolsas");
    expect(push).not.toHaveBeenCalled();
  });

  it("action rejeitada => mensagem falha_geral", async () => {
    criarMock.mockRejectedValue(new Error("sessão expirada"));
    render(<FormCriar />);
    digitar("Bolsas");
    salvar();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível concluir agora. Tente de novo em instantes.");
    expect(screen.getByLabelText("Nome da categoria")).toHaveValue("Bolsas");
    expect(push).not.toHaveBeenCalled();
  });

  it("Cancelar navega para a lista sem chamar a action", () => {
    render(<FormCriar />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(push).toHaveBeenCalledWith("/painel/categorias");
    expect(criarMock).not.toHaveBeenCalled();
  });

  it("botões e input com min-h-12; sem text-sm/xs (FR-018)", () => {
    const { container } = render(<FormCriar />);
    for (const b of screen.getAllByRole("button")) {
      expect(b.getAttribute("class") ?? "").toMatch(MIN_H);
    }
    expect(screen.getByLabelText("Nome da categoria").getAttribute("class") ?? "").toMatch(MIN_H);
    for (const el of container.querySelectorAll("[class]")) {
      expect(el.getAttribute("class")).not.toMatch(SMALL);
    }
  });
});
