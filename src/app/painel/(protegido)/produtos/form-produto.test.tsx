// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/produtos/actions", () => ({
  criarProduto: vi.fn(),
  editarProduto: vi.fn(),
}));

import { criarProduto, editarProduto } from "@/lib/produtos/actions";

import { FormProduto } from "./form-produto";

const criarMock = vi.mocked(criarProduto);
const editarMock = vi.mocked(editarProduto);
const categorias = [
  { id: 1, nome: "Meias" },
  { id: 2, nome: "Bolsas" },
];
const valores = { nome: "Meia", categoriaId: "2", descricao: "Linha 1\nLinha 2", preco: "12,90", aPartirDe: true };

function falha(extra: Record<string, unknown>) {
  return { ok: false, motivo: "falha_geral", mensagem: "x", valores, ...extra } as never;
}
const enviar = (nome = "Salvar") => fireEvent.click(screen.getByRole("button", { name: nome }));
const campoPreco = () => screen.getByLabelText("Preço") as HTMLInputElement;
const precoEnviado = (c: HTMLElement) =>
  (c.querySelector('input[name="preco"]') as HTMLInputElement).value;

beforeEach(() => {
  push.mockReset();
  criarMock.mockReset();
  editarMock.mockReset();
});
afterEach(cleanup);

describe("FormProduto — cadastro", () => {
  it("renderiza campos vazios e envia (anterior, FormData) para criarProduto", async () => {
    criarMock.mockResolvedValue({ ok: true, id: 7 });
    render(<FormProduto modo="cadastro" categorias={categorias} />);
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Meia lisa" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "1" } });
    enviar();
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    const [anterior, fd] = criarMock.mock.calls[0];
    expect(anterior).toBeNull();
    expect(fd.get("nome")).toBe("Meia lisa");
    expect(fd.get("categoriaId")).toBe("1");
    expect(fd.get("preco")).toBe("");
    expect(fd.get("id")).toBeNull();
  });

  it("sucesso ⇒ router.push para o detalhe do novo produto", async () => {
    criarMock.mockResolvedValue({ ok: true, id: 42 });
    render(<FormProduto modo="cadastro" categorias={categorias} />);
    enviar();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/produtos/42"));
  });

  it("máscara do preço: '1290' ⇒ '12,90'; só dígitos; apagar tudo ⇒ sem preço", () => {
    const { container } = render(<FormProduto modo="cadastro" categorias={categorias} />);
    expect(campoPreco()).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(campoPreco(), { target: { value: "1290" } });
    expect(campoPreco().value).toBe("12,90");
    expect(precoEnviado(container)).toBe("12,90");
    fireEvent.change(campoPreco(), { target: { value: "12,90a" } });
    expect(campoPreco().value).toBe("12,90");
    fireEvent.change(campoPreco(), { target: { value: "5" } });
    expect(campoPreco().value).toBe("0,05");
    fireEvent.change(campoPreco(), { target: { value: "" } });
    expect(campoPreco().value).toBe("");
    expect(precoEnviado(container)).toBe("");
  });

  it("falha com campo: uma só mensagem junto do campo, valores reidratados, sem outros erros", async () => {
    criarMock.mockResolvedValue(
      falha({ motivo: "nome_tamanho", mensagem: "O nome precisa ter de 3 a 80 letras.", campo: "nome" }),
    );
    const { container } = render(<FormProduto modo="cadastro" categorias={categorias} />);
    enviar();
    const msg = await screen.findByText("O nome precisa ter de 3 a 80 letras.");
    const nome = screen.getByLabelText("Nome do produto");
    expect(nome).toHaveAttribute("aria-invalid", "true");
    expect(nome.getAttribute("aria-describedby")).toBe(msg.id);
    expect(nome).toHaveValue("Meia");
    expect(screen.getByLabelText("Categoria")).toHaveValue("2");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Linha 1\nLinha 2");
    expect(campoPreco().value).toBe("12,90");
    expect(precoEnviado(container)).toBe("12,90");
    expect(screen.getByLabelText(/a partir de/i)).toBeChecked();
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("falha sem campo ⇒ Aviso de erro e nenhum campo marcado", async () => {
    criarMock.mockResolvedValue(falha({ motivo: "falha_geral", mensagem: "Não foi possível concluir agora." }));
    const { container } = render(<FormProduto modo="cadastro" categorias={categorias} />);
    enviar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível concluir agora.");
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    expect(screen.getByLabelText("Nome do produto")).toHaveValue("Meia");
  });

  it("nome_repetido com codigoExistente ⇒ o código vira link para o detalhe", async () => {
    criarMock.mockResolvedValue(
      falha({
        motivo: "nome_repetido",
        mensagem: "Já existe um produto com esse nome: #0042.",
        campo: "nome",
        codigoExistente: 42,
      }),
    );
    render(<FormProduto modo="cadastro" categorias={categorias} />);
    enviar();
    const link = await screen.findByRole("link", { name: "#0042" });
    expect(link).toHaveAttribute("href", "/painel/produtos/42");
    expect(link.parentElement).toHaveTextContent("Já existe um produto com esse nome: #0042.");
  });

  it("nome_repetido sem codigoExistente ⇒ mensagem sem link", async () => {
    criarMock.mockResolvedValue(
      falha({ motivo: "nome_repetido", mensagem: "Já existe um produto com esse nome.", campo: "nome" }),
    );
    render(<FormProduto modo="cadastro" categorias={categorias} />);
    enviar();
    expect(await screen.findByText("Já existe um produto com esse nome.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("sessão expirada (action rejeita): mensagem geral, digitado preservado, nada navega", async () => {
    criarMock.mockRejectedValue(new Error("UnauthorizedError"));
    const { container } = render(<FormProduto modo="cadastro" categorias={categorias} />);
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Meia lisa" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "2" } });
    fireEvent.change(campoPreco(), { target: { value: "1290" } });
    enviar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível concluir agora. Tente de novo em instantes.");
    expect(screen.getByLabelText("Nome do produto")).toHaveValue("Meia lisa");
    expect(screen.getByLabelText("Categoria")).toHaveValue("2");
    expect(campoPreco().value).toBe("12,90");
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    expect(criarMock).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("Cancelar volta à lista sem chamar a action", () => {
    render(<FormProduto modo="cadastro" categorias={categorias} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(push).toHaveBeenCalledWith("/painel/produtos");
    expect(criarMock).not.toHaveBeenCalled();
  });
});

describe("FormProduto — edição", () => {
  const inicial = { nome: "Meia", categoriaId: "1", descricao: "", preco: "12,90", aPartirDe: false };
  const props = { modo: "edicao", categorias, id: 5, versao: 3, inicial } as const;

  it("abre preenchido, com preço formatado e campos ocultos id/versao", async () => {
    editarMock.mockResolvedValue({ ok: true, id: 5, versao: 4 });
    const { container } = render(<FormProduto {...props} />);
    expect(screen.getByLabelText("Nome do produto")).toHaveValue("Meia");
    expect(campoPreco().value).toBe("12,90");
    enviar();
    await waitFor(() => expect(editarMock).toHaveBeenCalledTimes(1));
    const fd = editarMock.mock.calls[0][1];
    expect(fd.get("id")).toBe("5");
    expect(fd.get("versao")).toBe("3");
    expect(fd.get("preco")).toBe("12,90");
    expect(container.querySelector('input[name="id"]')).toHaveAttribute("type", "hidden");
  });

  it("sucesso ⇒ router.push para o detalhe do id do formulário", async () => {
    editarMock.mockResolvedValue({ ok: true, id: 5, versao: 4 });
    render(<FormProduto {...props} />);
    enviar();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/produtos/5"));
  });

  it("alterado ⇒ Aviso com a mensagem e valores reidratados", async () => {
    editarMock.mockResolvedValue(
      falha({ motivo: "alterado", mensagem: "Outra pessoa mudou este produto agora há pouco." }),
    );
    render(<FormProduto {...props} />);
    enviar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Outra pessoa mudou este produto");
    expect(screen.getByLabelText("Categoria")).toHaveValue("2");
    expect(campoPreco().value).toBe("12,90");
  });

  it("sem preço atual ⇒ campo de preço vazio", () => {
    render(<FormProduto {...props} inicial={{ ...inicial, preco: "" }} />);
    expect(campoPreco().value).toBe("");
  });
});
