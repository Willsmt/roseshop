import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Feature 004, T124 (SF13): action sugerirProduto (contracts/ia.md I§3, I§6; FR-033, SC-009).
// Unitário: guard, db, R2, IA e categorias mockados; validadores da 003 reais.

const m = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireAdminAction: vi.fn(),
    dbDoContexto: vi.fn(),
    enviosValidos: vi.fn(),
    obterEnvio: vi.fn(),
    consumirSugestao: vi.fn(),
    listarCategorias: vi.fn(),
    lerObjeto: vi.fn(),
    pedirSugestao: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireAdminAction: m.requireAdminAction,
  UnauthorizedError: m.UnauthorizedError,
}));
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: m.dbDoContexto }));
vi.mock("@/lib/db/fotos", () => ({
  enviosValidos: m.enviosValidos,
  obterEnvio: m.obterEnvio,
}));
vi.mock("@/lib/db/ia-uso", () => ({ consumirSugestao: m.consumirSugestao }));
vi.mock("@/lib/categorias", () => ({
  listarCategorias: m.listarCategorias,
  // Mesma regra do barrel real: NFC + trim + colapso de espaços.
  normalizarNome: (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " "),
}));
vi.mock("@/lib/r2", () => ({ lerObjeto: m.lerObjeto }));
vi.mock("@/lib/ai", () => ({
  pedirSugestao: m.pedirSugestao,
  LIMITE_POR_PESSOA: 30,
  LIMITE_TOTAL: 100,
}));

import { sugerirProduto } from "./sugestao";

const sessao = { email: "ana@x.com", name: "Ana" };
const fakeDb = { fake: "db" };
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

const MSG_INDISPONIVEL = "Não deu para sugerir agora. Preencha você mesma.";
const MSG_PAUSADA = "As sugestões estão pausadas por agora. Preencha você mesma.";
const indisponivel = { ok: false, motivo: "ia_indisponivel", mensagem: MSG_INDISPONIVEL };

const CATEGORIAS = [
  { id: 1, nome: "Bolsas" },
  { id: 3, nome: "Cabelo" },
];
const SUGESTAO = { nome: "Bolsa de couro", categoriaId: 1, descricao: "Bolsa média." };

const fonte = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdminAction.mockResolvedValue(sessao);
  m.dbDoContexto.mockResolvedValue(fakeDb);
  m.enviosValidos.mockImplementation(async (_db: unknown, _s: unknown, ids: string[]) => new Set(ids));
  m.obterEnvio.mockImplementation(async (_db: unknown, _s: unknown, id: string) => ({
    id,
    chave: `envios/${id}`,
    formato: "webp",
  }));
  m.consumirSugestao.mockResolvedValue(true);
  m.listarCategorias.mockResolvedValue(CATEGORIAS);
  m.lerObjeto.mockResolvedValue({ tamanho: 3, bytes: async () => new Uint8Array([1, 2, 3]) });
  m.pedirSugestao.mockResolvedValue({ ok: true, sugestao: SUGESTAO, duracaoMs: 5, usage: {} });
});

const semEfeitos = () => {
  for (const f of [
    m.dbDoContexto,
    m.enviosValidos,
    m.obterEnvio,
    m.consumirSugestao,
    m.listarCategorias,
    m.lerObjeto,
    m.pedirSugestao,
  ])
    expect(f).not.toHaveBeenCalled();
};

describe("ordem e guard", () => {
  it("guard -> Zod -> enviosValidos -> consumirSugestao -> listarCategorias -> lerObjeto -> pedirSugestao", async () => {
    const r = await sugerirProduto({ envioIds: [A] });
    expect(r).toEqual({ ok: true, sugestao: SUGESTAO });
    const ordem = (f: ReturnType<typeof vi.fn>) => f.mock.invocationCallOrder[0];
    const sequencia = [
      m.requireAdminAction,
      m.enviosValidos,
      m.consumirSugestao,
      m.listarCategorias,
      m.lerObjeto,
      m.pedirSugestao,
    ].map(ordem);
    expect([...sequencia].sort((a, b) => a - b)).toEqual(sequencia);
    expect(new Set(sequencia).size).toBe(sequencia.length);
  });

  it("sem sessão: UnauthorizedError propaga e nada mais é chamado", async () => {
    m.requireAdminAction.mockRejectedValue(new m.UnauthorizedError());
    await expect(sugerirProduto({ envioIds: [A] })).rejects.toBeInstanceOf(m.UnauthorizedError);
    semEfeitos();
  });
});

describe("Zod da entrada", () => {
  it.each([
    ["0 ids", { envioIds: [] }],
    ["4 ids", { envioIds: [A, B, C, D] }],
    ["ids repetidos", { envioIds: [A, A] }],
    ["não-uuid", { envioIds: ["abc"] }],
    ["entrada não-objeto", "texto"],
    ["entrada null", null],
    ["sem envioIds", {}],
  ])("%s: ia_indisponivel sem SQL", async (_r, entrada) => {
    const r = await sugerirProduto(entrada as never);
    expect(r).toEqual(indisponivel);
    semEfeitos();
  });
});

describe("FR-033: envios da própria pessoa", () => {
  it("id fora do conjunto de enviosValidos: ia_indisponivel, sem consumir nem chamar a IA", async () => {
    m.enviosValidos.mockResolvedValue(new Set([A]));
    const r = await sugerirProduto({ envioIds: [A, B] });
    expect(r).toEqual(indisponivel);
    expect(m.consumirSugestao).not.toHaveBeenCalled();
    expect(m.pedirSugestao).not.toHaveBeenCalled();
    expect(m.lerObjeto).not.toHaveBeenCalled();
  });

  it("obterEnvio undefined: ia_indisponivel", async () => {
    m.obterEnvio.mockResolvedValue(undefined);
    expect(await sugerirProduto({ envioIds: [A] })).toEqual(indisponivel);
    expect(m.pedirSugestao).not.toHaveBeenCalled();
  });

  it("lerObjeto null: ia_indisponivel", async () => {
    m.lerObjeto.mockResolvedValue(null);
    expect(await sugerirProduto({ envioIds: [A] })).toEqual(indisponivel);
    expect(m.pedirSugestao).not.toHaveBeenCalled();
  });
});

describe("limite de uso (I§3)", () => {
  it("consumirSugestao recebe (db, sessao, { porPessoa: 30, total: 100 })", async () => {
    await sugerirProduto({ envioIds: [A] });
    expect(m.consumirSugestao).toHaveBeenCalledWith(fakeDb, sessao, { porPessoa: 30, total: 100 });
  });

  it("false: ia_pausada com a mensagem e sem chamar a IA", async () => {
    m.consumirSugestao.mockResolvedValue(false);
    const r = await sugerirProduto({ envioIds: [A] });
    expect(r).toEqual({ ok: false, motivo: "ia_pausada", mensagem: MSG_PAUSADA });
    expect(m.pedirSugestao).not.toHaveBeenCalled();
  });

  it("o consumo vem antes da chamada: se a IA falha, a vaga já foi gasta", async () => {
    m.pedirSugestao.mockResolvedValue({ ok: false, falha: "rede", duracaoMs: 1 });
    await sugerirProduto({ envioIds: [A] });
    expect(m.consumirSugestao).toHaveBeenCalledTimes(1);
    expect(m.consumirSugestao.mock.invocationCallOrder[0]).toBeLessThan(
      m.pedirSugestao.mock.invocationCallOrder[0],
    );
  });
});

describe("base64 nativo (TL-9)", () => {
  it("webp e jpeg, na ordem dos envioIds", async () => {
    m.obterEnvio.mockImplementation(async (_d: unknown, _s: unknown, id: string) => ({
      id,
      chave: `envios/${id}`,
      formato: id === B ? "jpeg" : "webp",
    }));
    await sugerirProduto({ envioIds: [B, A] });
    expect(m.lerObjeto.mock.calls.map((c) => c[0])).toEqual([`envios/${B}`, `envios/${A}`]);
    expect(m.pedirSugestao).toHaveBeenCalledWith({
      imagens: [
        { tipo: "image/jpeg", base64: "AQID" },
        { tipo: "image/webp", base64: "AQID" },
      ],
      categorias: CATEGORIAS,
    });
  });

  it("o fonte não usa fromCharCode e usa rotina nativa", () => {
    const src = fonte("src/lib/produtos/sugestao.ts");
    expect(src).not.toContain("fromCharCode");
    expect(src.includes("toBase64") || src.includes('toString("base64")')).toBe(true);
  });
});

describe("validação campo a campo (FR-032)", () => {
  const com = (sugestao: object) =>
    m.pedirSugestao.mockResolvedValue({ ok: true, sugestao, duracaoMs: 1, usage: {} });
  const sugerir = () => sugerirProduto({ envioIds: [A] });

  it.each([
    ["curto", "ab"],
    ["só símbolos", "!!!"],
    ["longo demais", "a".repeat(81)],
  ])("nome inválido (%s): nome null, demais mantidos", async (_r, nome) => {
    com({ ...SUGESTAO, nome });
    expect(await sugerir()).toEqual({
      ok: true,
      sugestao: { nome: null, categoriaId: 1, descricao: "Bolsa média." },
    });
  });

  it("nome com espaços extras volta normalizado", async () => {
    com({ ...SUGESTAO, nome: "  Bolsa   de  couro " });
    expect(await sugerir()).toMatchObject({ ok: true, sugestao: { nome: "Bolsa de couro" } });
  });

  it("descricao > 1000 caracteres: null", async () => {
    com({ ...SUGESTAO, descricao: "x".repeat(1001) });
    expect(await sugerir()).toMatchObject({ ok: true, sugestao: { descricao: null } });
  });

  it("descricao só com espaços: null", async () => {
    com({ ...SUGESTAO, descricao: "   " });
    expect(await sugerir()).toMatchObject({ ok: true, sugestao: { descricao: null } });
  });

  it("categoriaId fora de listarCategorias: null", async () => {
    com({ ...SUGESTAO, categoriaId: 99 });
    expect(await sugerir()).toMatchObject({ ok: true, sugestao: { categoriaId: null } });
  });

  it("categoriaId presente na lista é mantido", async () => {
    com({ ...SUGESTAO, categoriaId: 3 });
    expect(await sugerir()).toMatchObject({ ok: true, sugestao: { categoriaId: 3 } });
  });

  it("tudo null: ia_indisponivel", async () => {
    com({ nome: null, categoriaId: null, descricao: null });
    expect(await sugerir()).toEqual(indisponivel);
  });

  it("tudo inválido: ia_indisponivel", async () => {
    com({ nome: "ab", categoriaId: 99, descricao: "   " });
    expect(await sugerir()).toEqual(indisponivel);
  });
});

describe("falhas", () => {
  it.each(["sem_chave", "rede", "tempo", "http", "status", "recusa", "json_invalido", "fora_do_schema"])(
    "pedirSugestao ok:false (%s): ia_indisponivel",
    async (falha) => {
      m.pedirSugestao.mockResolvedValue({ ok: false, falha, duracaoMs: 1 });
      expect(await sugerirProduto({ envioIds: [A] })).toEqual(indisponivel);
    },
  );

  it.each([
    "enviosValidos",
    "obterEnvio",
    "consumirSugestao",
    "listarCategorias",
    "lerObjeto",
    "pedirSugestao",
  ] as const)("%s lançando: ia_indisponivel, não lança", async (nome) => {
    m[nome].mockRejectedValue(new Error("boom"));
    await expect(sugerirProduto({ envioIds: [A] })).resolves.toEqual(indisponivel);
  });
});

describe("SC-009: a IA fora não bloqueia o cadastro manual", () => {
  it("IA fora: ia_indisponivel, não lança e nada é escrito", async () => {
    m.pedirSugestao.mockRejectedValue(new Error("IA fora"));
    await expect(sugerirProduto({ envioIds: [A] })).resolves.toEqual(indisponivel);
  });

  it("criarProduto não importa a IA nem a sugestão", () => {
    const src = fonte("src/lib/produtos/actions.ts");
    expect(src).not.toContain("@/lib/ai");
    expect(src).not.toContain("./sugestao");
  });

  it("a sugestão não é gravada: o módulo não importa @/lib/db/produtos", () => {
    expect(fonte("src/lib/produtos/sugestao.ts")).not.toContain("@/lib/db/produtos");
  });
});
