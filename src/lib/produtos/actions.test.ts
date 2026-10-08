import { beforeEach, describe, expect, it, vi } from "vitest";

// Feature 003, T042 (SF7): Server Actions de produtos (contrato §3, §6). Unitário: guard,
// db, barrel de categorias e revalidatePath mockados.

const m = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class CategoriaInvalidaError extends Error {}
  return {
    UnauthorizedError,
    CategoriaInvalidaError,
    requireAdminAction: vi.fn(),
    dbDoContexto: vi.fn(),
    exigirCategoriaValida: vi.fn(),
    inserir: vi.fn(),
    editar: vi.fn(),
    esgotar: vi.fn(),
    disponibilizar: vi.fn(),
    destacar: vi.fn(),
    tirarDoDestaque: vi.fn(),
    remover: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireAdminAction: m.requireAdminAction,
  UnauthorizedError: m.UnauthorizedError,
}));
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: m.dbDoContexto }));
vi.mock("@/lib/db/produtos", () => ({
  inserir: m.inserir,
  editar: m.editar,
  esgotar: m.esgotar,
  disponibilizar: m.disponibilizar,
  destacar: m.destacar,
  tirarDoDestaque: m.tirarDoDestaque,
  remover: m.remover,
}));
vi.mock("@/lib/categorias", () => ({
  CategoriaInvalidaError: m.CategoriaInvalidaError,
  exigirCategoriaValida: m.exigirCategoriaValida,
  // Mesma regra do barrel real: NFC + trim + colapso de espaços.
  normalizarNome: (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " "),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

import {
  criarProduto,
  destacarProduto,
  editarProduto,
  marcarDisponivel,
  marcarEsgotado,
  removerProduto,
  tirarProdutoDoDestaque,
} from "./actions";
import { mensagemDoMotivo } from "./mensagens";

const sessao = { email: "ana@x.com", name: "Ana" };
const fakeDb = { fake: "db" };
const LISTA = "/painel/produtos";

const fd = (campos: Record<string, string | undefined>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) f.set(k, v);
  return f;
};

const sqlMocks = () => [
  m.inserir,
  m.editar,
  m.esgotar,
  m.disponibilizar,
  m.destacar,
  m.tirarDoDestaque,
  m.remover,
];

const semBanco = () => {
  expect(m.dbDoContexto).not.toHaveBeenCalled();
  for (const f of sqlMocks()) expect(f).not.toHaveBeenCalled();
  expect(m.revalidatePath).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdminAction.mockResolvedValue(sessao);
  m.dbDoContexto.mockResolvedValue(fakeDb);
  m.exigirCategoriaValida.mockImplementation(async (id: unknown) => Number(id));
});

const falha = (motivo: Parameters<typeof mensagemDoMotivo>[0], extra: object = {}) => ({
  ok: false,
  motivo,
  mensagem: mensagemDoMotivo(motivo),
  ...extra,
});

const cadastroValido = { nome: "Bolsa de couro", categoriaId: "3", descricao: "", preco: "12,90" };
const edicaoValida = { ...cadastroValido, id: "7", versao: "2" };
const idVersao = { id: "7", versao: "2" };

type Acao = (anterior: null, formData: FormData) => Promise<unknown>;
const todas: [string, Acao, Record<string, string>][] = [
  ["criarProduto", criarProduto as Acao, cadastroValido],
  ["editarProduto", editarProduto as Acao, edicaoValida],
  ["marcarEsgotado", marcarEsgotado as Acao, idVersao],
  ["marcarDisponivel", marcarDisponivel as Acao, idVersao],
  ["destacarProduto", destacarProduto as Acao, idVersao],
  ["tirarProdutoDoDestaque", tirarProdutoDoDestaque as Acao, idVersao],
  ["removerProduto", removerProduto as Acao, idVersao],
];

describe("sem sessão (US2-AC4, quickstart §3 passo 10)", () => {
  beforeEach(() => {
    m.requireAdminAction.mockRejectedValue(new m.UnauthorizedError());
  });

  it.each(todas)("%s rejeita com UnauthorizedError e não toca no banco", async (_n, acao, campos) => {
    await expect(acao(null, fd(campos))).rejects.toBeInstanceOf(m.UnauthorizedError);
    semBanco();
    expect(m.exigirCategoriaValida).not.toHaveBeenCalled();
  });

  it.each(todas)("%s: nem FormData vazio é validado antes do guard", async (_n, acao) => {
    await expect(acao(null, new FormData())).rejects.toBeInstanceOf(m.UnauthorizedError);
    semBanco();
  });
});

describe("criarProduto: validação antes de qualquer SQL", () => {
  it("várias falhas ⇒ só a primeira na ordem do §3 (nome vazio + preço inválido ⇒ nome_vazio)", async () => {
    const r = await criarProduto(null, fd({ nome: "", categoriaId: "3", preco: "abc" }));
    expect(r).toEqual(
      falha("nome_vazio", {
        campo: "nome",
        valores: { nome: "", categoriaId: "3", descricao: "", preco: "abc", aPartirDe: false },
      }),
    );
    semBanco();
    expect(m.exigirCategoriaValida).not.toHaveBeenCalled();
  });

  it("categoria ausente ⇒ categoria_obrigatoria com campo categoria", async () => {
    const r = await criarProduto(null, fd({ nome: "Bolsa de couro" }));
    expect(r).toMatchObject({ ok: false, motivo: "categoria_obrigatoria", campo: "categoria" });
    semBanco();
  });

  it("preço inválido ⇒ preco_invalido com campo preco", async () => {
    const r = await criarProduto(null, fd({ ...cadastroValido, preco: "abc" }));
    expect(r).toMatchObject({ ok: false, motivo: "preco_invalido", campo: "preco" });
    semBanco();
  });

  it("modo cadastro: caixa marcada e preço vazio ⇒ a_partir_de_sem_preco", async () => {
    const r = await criarProduto(null, fd({ ...cadastroValido, preco: "", aPartirDe: "on" }));
    expect(r).toEqual(
      falha("a_partir_de_sem_preco", {
        campo: "aPartirDe",
        valores: {
          nome: "Bolsa de couro",
          categoriaId: "3",
          descricao: "",
          preco: "",
          aPartirDe: true,
        },
      }),
    );
    semBanco();
  });

  it("FormData vazio ⇒ falha pela ordem (nome_vazio), sem banco", async () => {
    const r = await criarProduto(null, new FormData());
    expect(r).toMatchObject({ ok: false, motivo: "nome_vazio", campo: "nome" });
    semBanco();
  });
});

describe("criarProduto: caminho feliz e traduções", () => {
  it("ordem: guard → categoria → banco; devolve { ok, id } e revalida lista e detalhe", async () => {
    m.inserir.mockResolvedValue({ tipo: "ok", id: 42 });
    const r = await criarProduto(
      null,
      fd({ ...cadastroValido, descricao: " Linda ", aPartirDe: "on" }),
    );
    expect(r).toEqual({ ok: true, id: 42 });
    expect(m.exigirCategoriaValida).toHaveBeenCalledWith(3);
    expect(m.inserir).toHaveBeenCalledWith(fakeDb, sessao, {
      nome: "Bolsa de couro",
      categoriaId: 3,
      descricao: "Linda",
      precoCentavos: 1290,
      aPartirDe: true,
    });
    expect(m.requireAdminAction.mock.invocationCallOrder[0]).toBeLessThan(
      m.exigirCategoriaValida.mock.invocationCallOrder[0],
    );
    expect(m.exigirCategoriaValida.mock.invocationCallOrder[0]).toBeLessThan(
      m.inserir.mock.invocationCallOrder[0],
    );
    expect(m.revalidatePath).toHaveBeenCalledWith(LISTA);
    expect(m.revalidatePath).toHaveBeenCalledWith(`${LISTA}/42`);
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("aPartirDe ausente do FormData ⇒ false", async () => {
    m.inserir.mockResolvedValue({ tipo: "ok", id: 1 });
    await criarProduto(null, fd(cadastroValido));
    expect(m.inserir.mock.calls[0][2]).toMatchObject({ aPartirDe: false });
  });

  it("CategoriaInvalidaError ⇒ categoria_invalida com campo categoria, sem chamar o banco", async () => {
    m.exigirCategoriaValida.mockRejectedValue(new m.CategoriaInvalidaError());
    const r = await criarProduto(null, fd(cadastroValido));
    expect(r).toEqual(
      falha("categoria_invalida", {
        campo: "categoria",
        valores: {
          nome: "Bolsa de couro",
          categoriaId: "3",
          descricao: "",
          preco: "12,90",
          aPartirDe: false,
        },
      }),
    );
    expect(m.dbDoContexto).not.toHaveBeenCalled();
    expect(m.inserir).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("categoria_ausente do banco ⇒ categoria_invalida com campo categoria e valores", async () => {
    m.inserir.mockResolvedValue({ tipo: "categoria_ausente" });
    const r = await criarProduto(null, fd(cadastroValido));
    expect(r).toMatchObject({
      ok: false,
      motivo: "categoria_invalida",
      campo: "categoria",
      valores: { categoriaId: "3" },
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("nome_repetido com codigoExistente ⇒ mensagem com o código, campo nome e valores", async () => {
    m.inserir.mockResolvedValue({ tipo: "nome_repetido", codigoExistente: 42 });
    const r = await criarProduto(null, fd(cadastroValido));
    expect(r).toEqual({
      ok: false,
      motivo: "nome_repetido",
      mensagem: "Já existe um produto com esse nome: #0042.",
      campo: "nome",
      codigoExistente: 42,
      valores: {
        nome: "Bolsa de couro",
        categoriaId: "3",
        descricao: "",
        preco: "12,90",
        aPartirDe: false,
      },
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("nome_repetido sem codigoExistente ⇒ mensagem sem link e sem a chave", async () => {
    m.inserir.mockResolvedValue({ tipo: "nome_repetido" });
    const r = (await criarProduto(null, fd(cadastroValido))) as Record<string, unknown>;
    expect(r).toMatchObject({
      motivo: "nome_repetido",
      mensagem: "Já existe um produto com esse nome.",
      campo: "nome",
    });
    expect("codigoExistente" in r).toBe(false);
  });

  it("os valores devolvem o texto cru do FormData, não o normalizado", async () => {
    m.inserir.mockResolvedValue({ tipo: "nome_repetido" });
    const r = await criarProduto(
      null,
      fd({ nome: "  Bolsa   de couro ", categoriaId: "3", descricao: " x ", preco: " 12,90 ", aPartirDe: "on" }),
    );
    expect(r).toMatchObject({
      valores: {
        nome: "  Bolsa   de couro ",
        categoriaId: "3",
        descricao: " x ",
        preco: " 12,90 ",
        aPartirDe: true,
      },
    });
  });

  it("exceção do banco ⇒ falha_geral com valores, sem vazar a mensagem", async () => {
    m.inserir.mockRejectedValue(new Error("password authentication failed for user neondb_owner"));
    const r = await criarProduto(null, fd(cadastroValido));
    expect(r).toMatchObject({
      ok: false,
      motivo: "falha_geral",
      mensagem: mensagemDoMotivo("falha_geral"),
      valores: { nome: "Bolsa de couro" },
    });
    expect(JSON.stringify(r)).not.toContain("neondb_owner");
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("toda falha: nunca redireciona", async () => {
    m.inserir.mockResolvedValue({ tipo: "nome_repetido", codigoExistente: 1 });
    await criarProduto(null, fd(cadastroValido));
    await criarProduto(null, fd({}));
    expect(m.redirect).not.toHaveBeenCalled();
  });
});

describe("editarProduto", () => {
  it("id/versao inválidos ⇒ falha_geral antes de tudo (sem campo), com valores", async () => {
    const r = await editarProduto(null, fd({ ...edicaoValida, id: "x", nome: "" }));
    expect(r).toEqual(
      falha("falha_geral", {
        valores: {
          nome: "",
          categoriaId: "3",
          descricao: "",
          preco: "12,90",
          aPartirDe: false,
        },
      }),
    );
    semBanco();
    expect(m.exigirCategoriaValida).not.toHaveBeenCalled();
  });

  it("versao ausente ⇒ falha_geral", async () => {
    const r = await editarProduto(null, fd({ ...edicaoValida, versao: undefined }));
    expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
    semBanco();
  });

  it("modo edição: preço vazio com caixa marcada ⇒ chega ao editar com aPartirDe = false", async () => {
    m.editar.mockResolvedValue({ tipo: "ok" });
    const r = await editarProduto(null, fd({ ...edicaoValida, preco: "", aPartirDe: "on" }));
    expect(r.ok).toBe(true);
    expect(m.editar).toHaveBeenCalledWith(fakeDb, sessao, 7, 2, {
      nome: "Bolsa de couro",
      categoriaId: 3,
      descricao: null,
      precoCentavos: null,
      aPartirDe: false,
    });
  });

  it("sucesso devolve { ok, id, versao } e revalida lista e detalhe, sem redirect", async () => {
    m.editar.mockResolvedValue({ tipo: "ok" });
    const r = await editarProduto(null, fd(edicaoValida));
    // `versao` devolvida é a que o banco passa a ter (a validada + 1), para o próximo envio.
    expect(r).toEqual({ ok: true, id: 7, versao: 3 });
    expect(m.revalidatePath).toHaveBeenCalledWith(LISTA);
    expect(m.revalidatePath).toHaveBeenCalledWith(`${LISTA}/7`);
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("exigirCategoriaValida roda antes de editar; CategoriaInvalidaError ⇒ categoria_invalida sem db", async () => {
    m.exigirCategoriaValida.mockRejectedValue(new m.CategoriaInvalidaError());
    const r = await editarProduto(null, fd(edicaoValida));
    expect(r).toMatchObject({
      ok: false,
      motivo: "categoria_invalida",
      campo: "categoria",
      valores: { nome: "Bolsa de couro" },
    });
    expect(m.dbDoContexto).not.toHaveBeenCalled();
    expect(m.editar).not.toHaveBeenCalled();
  });

  it.each([
    [{ tipo: "ausente" }, "nao_existe", undefined],
    [{ tipo: "versao_diferente" }, "alterado", undefined],
    [{ tipo: "categoria_ausente" }, "categoria_invalida", "categoria"],
    [{ tipo: "nome_repetido", codigoExistente: 9 }, "nome_repetido", "nome"],
    [{ tipo: "nome_repetido" }, "nome_repetido", "nome"],
  ])("resultado %j ⇒ %s, com valores", async (resultado, motivo, campo) => {
    m.editar.mockResolvedValue(resultado);
    const r = (await editarProduto(null, fd(edicaoValida))) as Record<string, unknown>;
    expect(r).toMatchObject({ ok: false, motivo, valores: { nome: "Bolsa de couro", categoriaId: "3" } });
    expect(r.campo).toBe(campo);
    expect(m.revalidatePath).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("exceção do banco ⇒ falha_geral com valores", async () => {
    m.editar.mockRejectedValue(new Error("boom"));
    const r = await editarProduto(null, fd(edicaoValida));
    expect(r).toMatchObject({ ok: false, motivo: "falha_geral", valores: { nome: "Bolsa de couro" } });
  });
});

describe("marcarEsgotado (US2-AC5)", () => {
  it("devolve saiuDoDestaque e revalida lista e detalhe", async () => {
    m.esgotar.mockResolvedValue({ tipo: "ok", saiuDoDestaque: true });
    const r = await marcarEsgotado(null, fd(idVersao));
    expect(r).toEqual({ ok: true, saiuDoDestaque: true });
    expect(m.esgotar).toHaveBeenCalledWith(fakeDb, sessao, 7, 2);
    expect(m.revalidatePath).toHaveBeenCalledWith(LISTA);
    expect(m.revalidatePath).toHaveBeenCalledWith(`${LISTA}/7`);
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("saiuDoDestaque false é preservado", async () => {
    m.esgotar.mockResolvedValue({ tipo: "ok", saiuDoDestaque: false });
    expect(await marcarEsgotado(null, fd(idVersao))).toEqual({ ok: true, saiuDoDestaque: false });
  });

  it.each([
    [{ tipo: "ausente" }, "nao_existe"],
    [{ tipo: "versao_diferente" }, "alterado"],
  ])("resultado %j ⇒ %s", async (resultado, motivo) => {
    m.esgotar.mockResolvedValue(resultado);
    expect(await marcarEsgotado(null, fd(idVersao))).toEqual(falha(motivo as never));
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("marcarDisponivel / tirarProdutoDoDestaque", () => {
  it.each([
    ["marcarDisponivel", marcarDisponivel, m.disponibilizar],
    ["tirarProdutoDoDestaque", tirarProdutoDoDestaque, m.tirarDoDestaque],
  ] as const)("%s: sucesso ⇒ { ok: true } e revalida", async (_n, acao, sql) => {
    sql.mockResolvedValue({ tipo: "ok" });
    expect(await acao(null, fd(idVersao))).toEqual({ ok: true });
    expect(sql).toHaveBeenCalledWith(fakeDb, sessao, 7, 2);
    expect(m.revalidatePath).toHaveBeenCalledWith(LISTA);
    expect(m.revalidatePath).toHaveBeenCalledWith(`${LISTA}/7`);
  });

  it.each([
    ["marcarDisponivel", marcarDisponivel, m.disponibilizar],
    ["tirarProdutoDoDestaque", tirarProdutoDoDestaque, m.tirarDoDestaque],
  ] as const)("%s: ausente e versão diferente", async (_n, acao, sql) => {
    sql.mockResolvedValueOnce({ tipo: "ausente" });
    expect(await acao(null, fd(idVersao))).toEqual(falha("nao_existe"));
    sql.mockResolvedValueOnce({ tipo: "versao_diferente" });
    expect(await acao(null, fd(idVersao))).toEqual(falha("alterado"));
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("destacarProduto", () => {
  it("sucesso ⇒ { ok: true } e revalida", async () => {
    m.destacar.mockResolvedValue({ tipo: "ok" });
    expect(await destacarProduto(null, fd(idVersao))).toEqual({ ok: true });
    expect(m.destacar).toHaveBeenCalledWith(fakeDb, sessao, 7, 2);
    expect(m.revalidatePath).toHaveBeenCalledWith(LISTA);
    expect(m.revalidatePath).toHaveBeenCalledWith(`${LISTA}/7`);
  });

  it.each([
    ["ausente", "nao_existe"],
    ["versao_diferente", "alterado"],
    ["esgotado", "esgotado_nao_destaca"],
    ["ja_em_destaque", "ja_em_destaque"],
    ["limite", "limite_destaques"],
    ["vaga_disputada", "vaga_disputada"],
  ])("resultado %s ⇒ %s", async (tipo, motivo) => {
    m.destacar.mockResolvedValue({ tipo });
    expect(await destacarProduto(null, fd(idVersao))).toEqual(falha(motivo as never));
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("removerProduto", () => {
  it("removido ⇒ { ok: true } e revalida", async () => {
    m.remover.mockResolvedValue({ tipo: "removido" });
    expect(await removerProduto(null, fd(idVersao))).toEqual({ ok: true });
    expect(m.remover).toHaveBeenCalledWith(fakeDb, sessao, 7, 2);
    expect(m.revalidatePath).toHaveBeenCalledWith(LISTA);
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["ausente", "nao_existe"],
    ["versao_diferente", "alterado"],
  ])("resultado %s ⇒ %s", async (tipo, motivo) => {
    m.remover.mockResolvedValue({ tipo });
    expect(await removerProduto(null, fd(idVersao))).toEqual(falha(motivo as never));
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("id/versao dos campos ocultos (actions de status)", () => {
  const acoes: [string, Acao, { mock: unknown }][] = [
    ["marcarEsgotado", marcarEsgotado as Acao, m.esgotar],
    ["marcarDisponivel", marcarDisponivel as Acao, m.disponibilizar],
    ["destacarProduto", destacarProduto as Acao, m.destacar],
    ["tirarProdutoDoDestaque", tirarProdutoDoDestaque as Acao, m.tirarDoDestaque],
    ["removerProduto", removerProduto as Acao, m.remover],
  ];

  it.each(acoes)("%s: entrada inválida ⇒ falha_geral sem tocar no banco", async (_n, acao) => {
    for (const campos of [
      {},
      { id: "7" },
      { versao: "2" },
      { id: "0", versao: "2" },
      { id: "-1", versao: "2" },
      { id: "1.5", versao: "2" },
      { id: "abc", versao: "2" },
      { id: "7", versao: "9999999999" },
      { id: "07", versao: "2" },
    ]) {
      expect(await acao(null, fd(campos))).toEqual(falha("falha_geral"));
    }
    semBanco();
  });

  it.each(acoes)("%s: exceção do banco ⇒ falha_geral, sem revalidar", async (_n, acao, sql) => {
    (sql as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    expect(await acao(null, fd(idVersao))).toEqual(falha("falha_geral"));
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});
