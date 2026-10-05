import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireAdminAction: vi.fn(),
    dbDoContexto: vi.fn(),
    inserir: vi.fn(),
    renomear: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireAdminAction: m.requireAdminAction,
  UnauthorizedError: m.UnauthorizedError,
}));
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: m.dbDoContexto }));
vi.mock("@/lib/db/categorias", () => ({ inserir: m.inserir, renomear: m.renomear }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { criarCategoria, renomearCategoria } from "./actions";
import { mensagem } from "./mensagens";

const sessao = { email: "ana@x.com", name: "Ana" };
const fakeDb = { fake: "db" };

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdminAction.mockResolvedValue(sessao);
  m.dbDoContexto.mockResolvedValue(fakeDb);
});

const semEfeitos = () => {
  expect(m.dbDoContexto).not.toHaveBeenCalled();
  expect(m.inserir).not.toHaveBeenCalled();
  expect(m.renomear).not.toHaveBeenCalled();
  expect(m.revalidatePath).not.toHaveBeenCalled();
};

const falhaGeral = { ok: false, motivo: "falha_geral", mensagem: mensagem("falha_geral") };

describe("sem sessão (FR-016, US2-9)", () => {
  beforeEach(() => {
    m.requireAdminAction.mockRejectedValue(new m.UnauthorizedError());
  });

  it("criarCategoria rejeita com UnauthorizedError e não tem efeito", async () => {
    await expect(criarCategoria({ nome: "Bolsas" })).rejects.toBeInstanceOf(m.UnauthorizedError);
    semEfeitos();
  });

  it("renomearCategoria rejeita com UnauthorizedError e não tem efeito", async () => {
    await expect(renomearCategoria({ id: 1, versao: 1, nome: "Bolsas" })).rejects.toBeInstanceOf(
      m.UnauthorizedError,
    );
    semEfeitos();
  });

  it("nem entrada inválida é validada antes do guard", async () => {
    await expect(criarCategoria(null)).rejects.toBeInstanceOf(m.UnauthorizedError);
    semEfeitos();
  });
});

describe("criarCategoria: validação antes de qualquer SQL", () => {
  it.each([
    ["", "nome_vazio"],
    ["Bolsas!", "nome_caracteres"],
    ["--", "nome_sem_letra"],
    ["A", "nome_tamanho"],
  ])("nome %j ⇒ %s com campo nome", async (nome, motivo) => {
    const r = await criarCategoria({ nome });
    expect(r).toEqual({ ok: false, motivo, mensagem: mensagem(motivo as never), campo: "nome" });
    semEfeitos();
  });

  it.each([null, "x", 5, undefined])("entrada %o ⇒ falha_geral sem campo", async (entrada) => {
    const r = await criarCategoria(entrada);
    expect(r).toEqual(falhaGeral);
    semEfeitos();
  });
});

describe("renomearCategoria: validação antes de qualquer SQL", () => {
  const base = { id: 1, versao: 1, nome: "Bolsas" };

  it.each([
    ["", "nome_vazio"],
    ["Bolsas!", "nome_caracteres"],
    ["--", "nome_sem_letra"],
  ])("nome %j ⇒ %s com campo nome", async (nome, motivo) => {
    const r = await renomearCategoria({ ...base, nome });
    expect(r).toEqual({ ok: false, motivo, mensagem: mensagem(motivo as never), campo: "nome" });
    semEfeitos();
  });

  it.each([{ id: "03" }, { id: 0 }, { versao: 0 }, { id: undefined }, { versao: "abc" }])(
    "campos inválidos %o ⇒ falha_geral sem campo",
    async (parcial) => {
      const r = await renomearCategoria({ ...base, ...parcial });
      expect(r).toEqual(falhaGeral);
      semEfeitos();
    },
  );

  it.each([null, "x"])("entrada %o ⇒ falha_geral", async (entrada) => {
    expect(await renomearCategoria(entrada)).toEqual(falhaGeral);
    semEfeitos();
  });
});

describe("criarCategoria: fluxo", () => {
  it("passa o nome normalizado e a sessão do guard à camada db", async () => {
    m.inserir.mockResolvedValue({ tipo: "ok", id: 7 });
    await criarCategoria({ nome: "  Bolsas   de Praia " });
    expect(m.inserir).toHaveBeenCalledWith(fakeDb, sessao, "Bolsas de Praia");
  });

  it("sucesso ⇒ { ok: true } e revalida a lista uma vez (US2-1)", async () => {
    m.inserir.mockResolvedValue({ tipo: "ok", id: 7 });
    await expect(criarCategoria({ nome: "Bolsas" })).resolves.toEqual({ ok: true });
    expect(m.revalidatePath).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/painel/categorias");
  });

  it("nome_repetido ⇒ falha com campo nome, sem revalidar (US2-2)", async () => {
    m.inserir.mockResolvedValue({ tipo: "nome_repetido", nomeExistente: "Bolsas" });
    await expect(criarCategoria({ nome: "bolsas" })).resolves.toEqual({
      ok: false,
      motivo: "nome_repetido",
      mensagem: "Já existe uma categoria chamada Bolsas. Escolha outro nome.",
      campo: "nome",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("camada db lança ⇒ falha_geral sem vazar o texto do erro", async () => {
    m.inserir.mockRejectedValue(new Error("connect ECONNREFUSED neondb_owner"));
    const r = await criarCategoria({ nome: "Bolsas" });
    expect(r).toEqual(falhaGeral);
    expect(JSON.stringify(r)).not.toContain("ECONNREFUSED");
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("dbDoContexto lança ⇒ falha_geral", async () => {
    m.dbDoContexto.mockRejectedValue(new Error("sem contexto"));
    expect(await criarCategoria({ nome: "Bolsas" })).toEqual(falhaGeral);
    expect(m.inserir).not.toHaveBeenCalled();
  });

  it("requireAdminAction roda antes de qualquer outro mock", async () => {
    m.inserir.mockResolvedValue({ tipo: "ok", id: 1 });
    await criarCategoria({ nome: "Bolsas" });
    const guard = m.requireAdminAction.mock.invocationCallOrder[0];
    expect(guard).toBeLessThan(m.dbDoContexto.mock.invocationCallOrder[0]);
    expect(guard).toBeLessThan(m.inserir.mock.invocationCallOrder[0]);
    expect(guard).toBeLessThan(m.revalidatePath.mock.invocationCallOrder[0]);
  });
});

describe("renomearCategoria: fluxo", () => {
  it("id '3' chega como number 3, nome normalizado e sessão do guard", async () => {
    m.renomear.mockResolvedValue({ tipo: "ok" });
    await renomearCategoria({ id: "3", versao: "2", nome: "  Bolsas   de Praia " });
    expect(m.renomear).toHaveBeenCalledWith(fakeDb, sessao, 3, 2, "Bolsas de Praia");
  });

  it("sucesso ⇒ { ok: true } e revalida a lista uma vez (US3-1)", async () => {
    m.renomear.mockResolvedValue({ tipo: "ok" });
    await expect(renomearCategoria({ id: 1, versao: 1, nome: "Bolsas" })).resolves.toEqual({
      ok: true,
    });
    expect(m.revalidatePath).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/painel/categorias");
  });

  it("nome_repetido ⇒ campo nome, sem revalidar", async () => {
    m.renomear.mockResolvedValue({ tipo: "nome_repetido", nomeExistente: "Meias" });
    await expect(renomearCategoria({ id: 1, versao: 1, nome: "meias" })).resolves.toMatchObject({
      ok: false,
      motivo: "nome_repetido",
      campo: "nome",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("ausente ⇒ nao_existe", async () => {
    m.renomear.mockResolvedValue({ tipo: "ausente" });
    const r = await renomearCategoria({ id: 1, versao: 1, nome: "Bolsas" });
    expect(r).toMatchObject({ ok: false, motivo: "nao_existe" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("versao_diferente ⇒ alterada", async () => {
    m.renomear.mockResolvedValue({ tipo: "versao_diferente" });
    const r = await renomearCategoria({ id: 1, versao: 1, nome: "Bolsas" });
    expect(r).toMatchObject({ ok: false, motivo: "alterada" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("camada db lança ⇒ falha_geral sem vazar o texto do erro", async () => {
    m.renomear.mockRejectedValue(new Error("password authentication failed for neondb_owner"));
    const r = await renomearCategoria({ id: 1, versao: 1, nome: "Bolsas" });
    expect(r).toEqual(falhaGeral);
    expect(JSON.stringify(r)).not.toContain("neondb_owner");
  });

  it("requireAdminAction roda antes de qualquer outro mock", async () => {
    m.renomear.mockResolvedValue({ tipo: "ok" });
    await renomearCategoria({ id: 1, versao: 1, nome: "Bolsas" });
    const guard = m.requireAdminAction.mock.invocationCallOrder[0];
    expect(guard).toBeLessThan(m.dbDoContexto.mock.invocationCallOrder[0]);
    expect(guard).toBeLessThan(m.renomear.mock.invocationCallOrder[0]);
  });
});
