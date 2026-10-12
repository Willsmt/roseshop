// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { mensagemFoto } from "@/lib/fotos/mensagens";
import { criarProduto, editarProduto } from "@/lib/produtos/actions";

import { FormProduto } from "./form-produto";

const criarMock = vi.mocked(criarProduto);
const editarMock = vi.mocked(editarProduto);
const categorias = [
  { id: 1, nome: "Meias" },
  { id: 2, nome: "Bolsas" },
];
// Modo cadastro (SF9): recebe os envioIds das fotos já enviadas e se há envio em curso.
const cad = { modo: "cadastro", categorias, envioIds: ["e1"], envioEmCurso: false } as const;
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
    render(<FormProduto {...cad} />);
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
    render(<FormProduto {...cad} />);
    enviar();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/produtos/42"));
  });

  it("máscara do preço: '1290' ⇒ '12,90'; só dígitos; apagar tudo ⇒ sem preço", () => {
    const { container } = render(<FormProduto {...cad} />);
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
    const { container } = render(<FormProduto {...cad} />);
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
    const { container } = render(<FormProduto {...cad} />);
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
    render(<FormProduto {...cad} />);
    enviar();
    const link = await screen.findByRole("link", { name: "#0042" });
    expect(link).toHaveAttribute("href", "/painel/produtos/42");
    expect(link.parentElement).toHaveTextContent("Já existe um produto com esse nome: #0042.");
  });

  it("nome_repetido sem codigoExistente ⇒ mensagem sem link", async () => {
    criarMock.mockResolvedValue(
      falha({ motivo: "nome_repetido", mensagem: "Já existe um produto com esse nome.", campo: "nome" }),
    );
    render(<FormProduto {...cad} />);
    enviar();
    expect(await screen.findByText("Já existe um produto com esse nome.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("sessão expirada (action rejeita): mensagem geral, digitado preservado, nada navega", async () => {
    criarMock.mockRejectedValue(new Error("UnauthorizedError"));
    const { container } = render(<FormProduto {...cad} />);
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
    render(<FormProduto {...cad} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(push).toHaveBeenCalledWith("/painel/produtos");
    expect(criarMock).not.toHaveBeenCalled();
  });
});

describe("FormProduto — cadastro com fotos (SF9)", () => {
  const IDS = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];

  it("US1-AC7: um campo oculto `fotos` por envioId, na ordem mostrada", async () => {
    criarMock.mockResolvedValue({ ok: true, id: 7 });
    const { container } = render(<FormProduto {...cad} envioIds={IDS} />);
    const campos = [...container.querySelectorAll<HTMLInputElement>('input[name="fotos"]')];
    expect(campos.map((c) => c.type)).toEqual(["hidden", "hidden", "hidden"]);
    enviar();
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    expect(criarMock.mock.calls[0][1].getAll("fotos")).toEqual(IDS);
  });

  it("US1-AC8: sem fotos nenhum campo `fotos` é enviado (nunca fotos=\"\") e a recusa sem_foto aparece", async () => {
    criarMock.mockResolvedValue(falha({ motivo: "sem_foto", mensagem: mensagemFoto("sem_foto") }));
    const { container } = render(<FormProduto {...cad} envioIds={[]} />);
    expect(container.querySelectorAll('input[name="fotos"]')).toHaveLength(0);
    enviar();
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    const fd = criarMock.mock.calls[0][1];
    expect(fd.getAll("fotos")).toEqual([]);
    expect(fd.has("fotos")).toBe(false);
    expect(await screen.findByRole("alert")).toHaveTextContent("Coloque pelo menos 1 foto do produto.");
  });

  it("'Salvar' indisponível enquanto houver envio em curso", () => {
    const { rerender } = render(<FormProduto {...cad} envioEmCurso />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    rerender(<FormProduto {...cad} envioEmCurso={false} />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("US1-AC9: recusa por nome repetido ⇒ o próximo envio leva as mesmas fotos", async () => {
    criarMock.mockResolvedValueOnce(
      falha({ motivo: "nome_repetido", mensagem: "Já existe um produto com esse nome.", campo: "nome" }),
    );
    criarMock.mockResolvedValueOnce({ ok: true, id: 9 });
    render(<FormProduto {...cad} envioIds={IDS.slice(0, 2)} />);
    enviar();
    expect(await screen.findByText("Já existe um produto com esse nome.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Meia nova" } });
    enviar();
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(2));
    expect(criarMock.mock.calls[0][1].getAll("fotos")).toEqual(IDS.slice(0, 2));
    expect(criarMock.mock.calls[1][1].getAll("fotos")).toEqual(IDS.slice(0, 2));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/produtos/9"));
  });

  it("foto_expirada ⇒ onFotoExpirada chamado uma vez com os envioIds e a mensagem aparece", async () => {
    const onFotoExpirada = vi.fn();
    criarMock.mockResolvedValue(
      falha({ motivo: "foto_expirada", mensagem: mensagemFoto("foto_expirada"), envioIds: [IDS[1]] }),
    );
    render(<FormProduto {...cad} envioIds={IDS.slice(0, 2)} onFotoExpirada={onFotoExpirada} />);
    enviar();
    expect(await screen.findByRole("alert")).toHaveTextContent(mensagemFoto("foto_expirada"));
    await waitFor(() => expect(onFotoExpirada).toHaveBeenCalledWith([IDS[1]]));
    expect(onFotoExpirada).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  // REVISÃO 2, correção 5: a falha foto_expirada deixa de ser exibida quando envioIds muda
  // em relação ao envio que falhou (a foto foi reenviada ou removida no passo Fotos).
  it("foto_expirada: rerender com envioIds diferentes ⇒ a mensagem de expirada some", async () => {
    const onFotoExpirada = vi.fn();
    criarMock.mockResolvedValue(
      falha({ motivo: "foto_expirada", mensagem: mensagemFoto("foto_expirada"), envioIds: [IDS[1]] }),
    );
    const { rerender } = render(
      <FormProduto {...cad} envioIds={IDS.slice(0, 2)} onFotoExpirada={onFotoExpirada} />,
    );
    enviar();
    expect(await screen.findByRole("alert")).toHaveTextContent(mensagemFoto("foto_expirada"));
    // Mesmos envioIds: a mensagem continua.
    rerender(<FormProduto {...cad} envioIds={IDS.slice(0, 2)} onFotoExpirada={onFotoExpirada} />);
    expect(screen.getByText(mensagemFoto("foto_expirada"))).toBeInTheDocument();
    // A 2ª foto foi reenviada com envioId novo: a mensagem some.
    rerender(<FormProduto {...cad} envioIds={[IDS[0], "e-novo"]} onFotoExpirada={onFotoExpirada} />);
    expect(screen.queryByText(mensagemFoto("foto_expirada"))).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onFotoExpirada).toHaveBeenCalledTimes(1);
  });

  it("outra falha não chama onFotoExpirada", async () => {
    const onFotoExpirada = vi.fn();
    criarMock.mockResolvedValue(falha({ motivo: "falha_geral", mensagem: "x" }));
    render(<FormProduto {...cad} onFotoExpirada={onFotoExpirada} />);
    enviar();
    await screen.findByRole("alert");
    expect(onFotoExpirada).not.toHaveBeenCalled();
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
    // Modo edição não mexe em fotos.
    expect(fd.getAll("fotos")).toEqual([]);
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

// T136 (SF14): prop `sugestao` do modo cadastro (contrato interno da SF14, seção 3).
describe("FormProduto — sugestão da IA (SF14)", () => {
  const MARCADOR = "Sugestão \u2014 confira";
  type S = { nome: string | null; categoriaId: number | null; descricao: string | null };
  const A: S = { nome: "Meia lisa", categoriaId: 1, descricao: "Meia de algodão" };
  const nome = () => screen.getByLabelText("Nome do produto") as HTMLInputElement;
  const categoria = () => screen.getByRole("combobox", { name: "Categoria" }) as unknown as HTMLSelectElement;
  const descricao = () => screen.getByLabelText("Descrição") as HTMLTextAreaElement;

  it("sem a prop (ou null) nada é preenchido nem marcado", () => {
    const { rerender } = render(<FormProduto {...cad} />);
    rerender(<FormProduto {...cad} sugestao={null} />);
    expect(nome()).toHaveValue("");
    expect(screen.queryByText(MARCADOR)).toBeNull();
  });

  it("US3-AC2: sugestão aplica nos campos vazios, com marcador ligado por aria-describedby; preço e 'a partir de' intocados", () => {
    const { rerender, container } = render(<FormProduto {...cad} sugestao={null} />);
    rerender(<FormProduto {...cad} sugestao={A} />);
    expect(nome()).toHaveValue("Meia lisa");
    expect(categoria()).toHaveValue("1");
    expect(descricao()).toHaveValue("Meia de algodão");
    for (const c of [nome(), categoria(), descricao()]) expect(c).toHaveAccessibleDescription(MARCADOR);
    expect(screen.getAllByText(MARCADOR)).toHaveLength(3);
    expect(campoPreco().value).toBe("");
    expect(precoEnviado(container)).toBe("");
    expect(screen.getByLabelText(/a partir de/i)).not.toBeChecked();
  });

  it("a sugestão já presente na montagem também é aplicada", () => {
    render(<FormProduto {...cad} sugestao={A} />);
    expect(nome()).toHaveValue("Meia lisa");
    expect(nome()).toHaveAccessibleDescription(MARCADOR);
  });

  it("US3-AC3: só aplica nos vazios; campo preenchido não muda nem ganha marcador (inclusive só espaços conta como vazio)", () => {
    const { rerender } = render(<FormProduto {...cad} sugestao={null} />);
    fireEvent.change(nome(), { target: { value: "Minha meia" } });
    fireEvent.change(descricao(), { target: { value: "   " } });
    rerender(<FormProduto {...cad} sugestao={A} />);
    expect(nome()).toHaveValue("Minha meia");
    expect(nome()).toHaveAccessibleDescription("");
    expect(descricao()).toHaveValue("Meia de algodão");
    expect(descricao()).toHaveAccessibleDescription(MARCADOR);
    expect(categoria()).toHaveValue("1");
  });

  it("US3-AC3: categoria já escolhida não muda", () => {
    const { rerender } = render(<FormProduto {...cad} sugestao={null} />);
    fireEvent.change(categoria(), { target: { value: "2" } });
    rerender(<FormProduto {...cad} sugestao={A} />);
    expect(categoria()).toHaveValue("2");
    expect(categoria()).toHaveAccessibleDescription("");
  });

  it.each([
    ["id fora das opções", 99],
    ["null", null],
  ])("US3-AC4: categoriaId %s ⇒ select em vazio, sem marcador", (_n, categoriaId) => {
    render(<FormProduto {...cad} sugestao={{ nome: "Meia lisa", categoriaId, descricao: null }} />);
    expect(categoria()).toHaveValue("");
    expect(categoria()).toHaveAccessibleDescription("");
    expect(nome()).toHaveAccessibleDescription(MARCADOR);
    expect(descricao()).toHaveValue("");
    expect(descricao()).toHaveAccessibleDescription("");
    expect(screen.getAllByText(MARCADOR)).toHaveLength(1);
  });

  it("o marcador some ao editar AQUELE campo e não os outros", () => {
    render(<FormProduto {...cad} sugestao={A} />);
    fireEvent.change(descricao(), { target: { value: "Outra descrição" } });
    expect(descricao()).toHaveAccessibleDescription("");
    expect(nome()).toHaveAccessibleDescription(MARCADOR);
    expect(categoria()).toHaveAccessibleDescription(MARCADOR);
    fireEvent.change(categoria(), { target: { value: "2" } });
    expect(categoria()).toHaveAccessibleDescription("");
    expect(nome()).toHaveAccessibleDescription(MARCADOR);
    expect(screen.getAllByText(MARCADOR)).toHaveLength(1);
  });

  it("editar o preço não tira o marcador de nenhum campo", () => {
    render(<FormProduto {...cad} sugestao={A} />);
    fireEvent.change(campoPreco(), { target: { value: "1290" } });
    expect(screen.getAllByText(MARCADOR)).toHaveLength(3);
  });

  it("nova identidade de objeto reaplica nos campos vazios; a mesma identidade não", () => {
    const { rerender } = render(<FormProduto {...cad} sugestao={A} />);
    fireEvent.change(nome(), { target: { value: "" } }); // a pessoa apagou o nome
    rerender(<FormProduto {...cad} sugestao={A} />); // mesma identidade
    expect(nome()).toHaveValue("");
    const B: S = { nome: "Bolsa nova", categoriaId: 2, descricao: "Outra" };
    rerender(<FormProduto {...cad} sugestao={B} />);
    expect(nome()).toHaveValue("Bolsa nova");
    expect(nome()).toHaveAccessibleDescription(MARCADOR);
    // categoria e descrição já estavam preenchidas (pela sugestão A): não mudam.
    expect(categoria()).toHaveValue("1");
    expect(descricao()).toHaveValue("Meia de algodão");
  });

  it("nova identidade com conteúdo igual também reaplica nos vazios", () => {
    const { rerender } = render(<FormProduto {...cad} sugestao={A} />);
    fireEvent.change(nome(), { target: { value: "" } });
    rerender(<FormProduto {...cad} sugestao={{ ...A }} />);
    expect(nome()).toHaveValue("Meia lisa");
    expect(nome()).toHaveAccessibleDescription(MARCADOR);
  });

  it("o marcador sobrevive à remontagem dos campos após falha do 'Salvar'", async () => {
    criarMock.mockResolvedValue(
      falha({
        motivo: "preco_invalido",
        mensagem: "Preço inválido.",
        campo: "preco",
        valores: { nome: "Meia lisa", categoriaId: "1", descricao: "Meia de algodão", preco: "", aPartirDe: false },
      }),
    );
    render(<FormProduto {...cad} sugestao={A} />);
    fireEvent.change(descricao(), { target: { value: "Editei" } }); // este marcador já tinha saído
    enviar();
    await screen.findByText("Preço inválido.");
    expect(nome()).toHaveValue("Meia lisa");
    expect(nome()).toHaveAccessibleDescription(MARCADOR);
    expect(categoria()).toHaveAccessibleDescription(MARCADOR);
    expect(descricao()).toHaveAccessibleDescription("");
  });

  it("falha do 'Salvar' com erro no campo marcado: erro e marcador juntos no aria-describedby", async () => {
    criarMock.mockResolvedValue(
      falha({
        motivo: "nome_repetido",
        mensagem: "Já existe um produto com esse nome.",
        campo: "nome",
        valores: { nome: "Meia lisa", categoriaId: "1", descricao: "Meia de algodão", preco: "", aPartirDe: false },
      }),
    );
    render(<FormProduto {...cad} sugestao={A} />);
    enviar();
    const msg = await screen.findByText("Já existe um produto com esse nome.");
    const ids = (nome().getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    expect(ids).toContain(msg.id);
    expect(ids).toHaveLength(2);
    expect(nome()).toHaveAccessibleDescription(expect.stringContaining(MARCADOR));
  });

  it("corrida: sugestão que chega durante o 'Salvar' em curso só é aplicada quando a action termina, e com marcador", async () => {
    let resolver!: (v: never) => void;
    criarMock.mockReturnValue(new Promise<never>((res) => (resolver = res)));
    const { rerender } = render(<FormProduto {...cad} sugestao={null} />);
    enviar();
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    rerender(<FormProduto {...cad} sugestao={A} />); // chega durante a espera
    expect(nome()).toHaveValue("");
    expect(screen.queryByText(MARCADOR)).toBeNull();
    await act(async () => resolver(falha({ motivo: "nome_tamanho", mensagem: "Nome curto.", campo: "nome", valores: { nome: "", categoriaId: "", descricao: "", preco: "", aPartirDe: false } })));
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    expect(nome()).toHaveAccessibleDescription(expect.stringContaining(MARCADOR));
    expect(categoria()).toHaveValue("1");
    expect(descricao()).toHaveValue("Meia de algodão");
    expect(screen.getAllByText(MARCADOR)).toHaveLength(3);
  });

  it("corrida: com 'Salvar' pendente que vai dar certo, a sugestão não é aplicada antes do fim", async () => {
    let resolver!: (v: never) => void;
    criarMock.mockReturnValue(new Promise<never>((res) => (resolver = res)));
    const { rerender } = render(<FormProduto {...cad} sugestao={null} />);
    enviar();
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    rerender(<FormProduto {...cad} sugestao={A} />);
    expect(nome()).toHaveValue("");
    expect(descricao()).toHaveValue("");
    expect(screen.queryByText(MARCADOR)).toBeNull();
    await act(async () => resolver({ ok: true, id: 8 } as never));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/painel/produtos/8"));
  });

  it("FR-034: modo edição não mostra marcador", () => {
    const inicial = { nome: "Meia", categoriaId: "1", descricao: "", preco: "12,90", aPartirDe: false };
    render(<FormProduto modo="edicao" categorias={categorias} id={5} versao={3} inicial={inicial} />);
    expect(screen.queryByText(MARCADOR)).toBeNull();
    expect(nome()).toHaveAccessibleDescription("");
  });
});
