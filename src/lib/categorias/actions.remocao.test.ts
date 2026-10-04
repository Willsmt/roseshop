import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireAdminAction: vi.fn(),
    dbDoContexto: vi.fn(),
    remover: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireAdminAction: m.requireAdminAction,
  UnauthorizedError: m.UnauthorizedError,
}));
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: m.dbDoContexto }));
vi.mock("@/lib/db/categorias", () => ({ remover: m.remover }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { removerCategoria } from "./actions";
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
  expect(m.remover).not.toHaveBeenCalled();
  expect(m.revalidatePath).not.toHaveBeenCalled();
};

const falhaGeral = { ok: false, motivo: "falha_geral", mensagem: mensagem("falha_geral") };

describe("removerCategoria: sem sessão (FR-016)", () => {
  it("rejeita com UnauthorizedError sem chamar remover nem dbDoContexto", async () => {
    m.requireAdminAction.mockRejectedValue(new m.UnauthorizedError());
    await expect(removerCategoria({ id: 1, versao: 1 })).rejects.toBeInstanceOf(
      m.UnauthorizedError,
    );
    semEfeitos();
  });

  it("nem entrada inválida é validada antes do guard", async () => {
    m.requireAdminAction.mockRejectedValue(new m.UnauthorizedError());
    await expect(removerCategoria(null)).rejects.toBeInstanceOf(m.UnauthorizedError);
    semEfeitos();
  });
});

describe("removerCategoria: validação antes de qualquer SQL", () => {
  const base = { id: 1, versao: 1 };

  it.each([
    { id: 0 },
    { id: -1 },
    { id: "abc" },
    { id: " 3" },
    { id: undefined },
    { id: null },
    { versao: 0 },
    { versao: -1 },
    { versao: "abc" },
    { versao: " 3" },
    { versao: undefined },
    { versao: null },
  ])("campos inválidos %o ⇒ falha_geral sem campo", async (parcial) => {
    const r = await removerCategoria({ ...base, ...parcial });
    expect(r).toEqual(falhaGeral);
    expect(r).not.toHaveProperty("campo");
    semEfeitos();
  });

  it.each([null, undefined, "x", 5, [], {}])("entrada %o ⇒ falha_geral", async (entrada) => {
    expect(await removerCategoria(entrada)).toEqual(falhaGeral);
    semEfeitos();
  });
});

describe("removerCategoria: fluxo", () => {
  it("removido ⇒ { ok: true } e revalida a lista uma vez", async () => {
    m.remover.mockResolvedValue({ tipo: "removido" });
    await expect(removerCategoria({ id: 4, versao: 2 })).resolves.toEqual({ ok: true });
    expect(m.revalidatePath).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/painel/categorias");
  });

  it("chama remover com (db, sessão, id, versão) numéricos", async () => {
    m.remover.mockResolvedValue({ tipo: "removido" });
    await removerCategoria({ id: "3", versao: "2" });
    expect(m.remover).toHaveBeenCalledWith(fakeDb, sessao, 3, 2);
  });

  it.each([
    [{ tipo: "ausente" }, "nao_existe", mensagem("nao_existe")],
    [{ tipo: "versao_diferente" }, "alterada", mensagem("alterada")],
    [{ tipo: "ultima" }, "ultima", mensagem("ultima")],
    [
      { tipo: "tem_produtos", quantidade: 3 },
      "tem_produtos",
      mensagem("tem_produtos", { quantidade: 3 }),
    ],
    [
      { tipo: "tem_produtos", quantidade: 1 },
      "tem_produtos",
      mensagem("tem_produtos", { quantidade: 1 }),
    ],
    [{ tipo: "tem_produtos", quantidade: 0 }, "falha_geral", mensagem("falha_geral")],
  ])("recusa %o ⇒ motivo %s, sem campo e sem revalidar", async (resultado, motivo, texto) => {
    m.remover.mockResolvedValue(resultado);
    const r = await removerCategoria({ id: 1, versao: 1 });
    expect(r).toEqual({ ok: false, motivo, mensagem: texto });
    expect(r).not.toHaveProperty("campo");
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("tem_produtos: singular e plural diferem", () => {
    expect(mensagem("tem_produtos", { quantidade: 1 })).not.toBe(
      mensagem("tem_produtos", { quantidade: 3 }),
    );
  });

  it("camada db lança ⇒ falha_geral sem vazar o texto, sem revalidar", async () => {
    m.remover.mockRejectedValue(new Error("password authentication failed for neondb_owner@host"));
    const r = await removerCategoria({ id: 1, versao: 1 });
    expect(r).toEqual(falhaGeral);
    expect(JSON.stringify(r)).not.toContain("neondb_owner");
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("dbDoContexto lança ⇒ falha_geral sem chamar remover", async () => {
    m.dbDoContexto.mockRejectedValue(new Error("sem contexto"));
    expect(await removerCategoria({ id: 1, versao: 1 })).toEqual(falhaGeral);
    expect(m.remover).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("requireAdminAction roda antes de qualquer outro mock", async () => {
    m.remover.mockResolvedValue({ tipo: "removido" });
    await removerCategoria({ id: 1, versao: 1 });
    const guard = m.requireAdminAction.mock.invocationCallOrder[0];
    expect(guard).toBeLessThan(m.dbDoContexto.mock.invocationCallOrder[0]);
    expect(guard).toBeLessThan(m.remover.mock.invocationCallOrder[0]);
  });
});
