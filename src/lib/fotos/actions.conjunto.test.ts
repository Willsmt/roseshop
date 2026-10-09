import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Feature 004, T073 (SF7): actions do conjunto de fotos (contracts/fotos.md §3):
// adicionarFoto, trocarFoto, removerFoto, moverFoto. Unitário: tudo mockado.

const m = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireAdminAction: vi.fn(),
    dbDoContexto: vi.fn(),
    lerConjunto: vi.fn(),
    obterEnvio: vi.fn(),
    substituirConjunto: vi.fn(),
    apagarObjetos: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireAdminAction: m.requireAdminAction,
  UnauthorizedError: m.UnauthorizedError,
}));
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: m.dbDoContexto }));
vi.mock("@/lib/db/fotos", () => ({
  lerConjunto: m.lerConjunto,
  obterEnvio: m.obterEnvio,
  substituirConjunto: m.substituirConjunto,
  // usadas pelas actions da SF6 no mesmo módulo
  emitirEnvio: vi.fn(),
  marcarConfirmado: vi.fn(),
  descartarEnvio: vi.fn(),
}));
vi.mock("@/lib/r2", () => {
  const ARQUIVO =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$/;
  return {
    apagarObjetos: m.apagarObjetos,
    assinarEnvio: vi.fn(),
    lerObjeto: vi.fn(),
    verificarImagem: vi.fn(),
    modoVerificacao: vi.fn(),
    configR2: vi.fn(),
    arquivoDaChave: (chave: string) => {
      if (!chave.startsWith("fotos/")) return null;
      const arquivo = chave.slice("fotos/".length);
      return ARQUIVO.test(arquivo) ? arquivo : null;
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { adicionarFoto, moverFoto, removerFoto, trocarFoto } from "./actions";
import { mensagemFoto } from "./mensagens";

const sessao = { email: "ana@x.com", name: "Ana" };
const fakeDb = { fake: "db" };

const A = "11111111-1111-4111-8111-111111111111.webp";
const B = "22222222-2222-4222-9222-222222222222.jpg";
const C = "33333333-3333-4333-a333-333333333333.webp";
const NOVA = "44444444-4444-4444-b444-444444444444.webp";
const CH = { A: `fotos/${A}`, B: `fotos/${B}`, C: `fotos/${C}`, NOVA: `fotos/${NOVA}` };
const ENV = "5f2b8c1a-4d5e-4f60-8a7b-9c0d1e2f3a4b";

const quando = (n: number) => new Date(Date.UTC(2026, 0, n));
const linha = (posicao: number, chave: string, por: string, dia: number) => ({
  posicao,
  chave,
  enviadoPor: por,
  enviadoEm: quando(dia),
});
const L1 = linha(1, CH.A, "ana@x.com", 1);
const L2 = linha(2, CH.B, "bia@x.com", 2);
const L3 = linha(3, CH.C, "ana@x.com", 3);
const vista = (l: { posicao: number; chave: string }) => {
  const arquivo = l.chave.slice("fotos/".length);
  return { posicao: l.posicao, arquivo, url: `/painel/fotos/${arquivo}` };
};
const envio = {
  id: ENV,
  formato: "webp",
  chave: CH.NOVA,
  tamanho: 1000,
  enviadoPor: "carla@x.com",
  estado: "confirmado",
  criadoEm: quando(9),
  confirmadoEm: quando(9),
};

type Caso = {
  nome: string;
  chamar: (extra?: Record<string, unknown>) => Promise<unknown>;
  lidas: ReturnType<typeof linha>[];
  usaEnvio: boolean;
  campos: string[];
  novas: unknown[];
  saiu?: string;
  fotosVersao: number;
};
const base = { produtoId: 7, fotosVersao: 3 };
const CASOS: Caso[] = [
  {
    nome: "adicionarFoto",
    chamar: (x) => adicionarFoto({ ...base, envioId: ENV, ...x } as never),
    lidas: [L1, L2],
    usaEnvio: true,
    campos: ["produtoId", "fotosVersao", "envioId"],
    novas: [L1, L2, linha(3, CH.NOVA, "carla@x.com", 9)],
    fotosVersao: 3,
  },
  {
    nome: "trocarFoto",
    chamar: (x) => trocarFoto({ ...base, posicao: 2, envioId: ENV, ...x } as never),
    lidas: [L1, L2, L3],
    usaEnvio: true,
    campos: ["produtoId", "fotosVersao", "posicao", "envioId"],
    novas: [L1, linha(2, CH.NOVA, "carla@x.com", 9), L3],
    saiu: CH.B,
    fotosVersao: 3,
  },
  {
    nome: "removerFoto",
    chamar: (x) => removerFoto({ ...base, posicao: 2, ...x } as never),
    lidas: [L1, L2, L3],
    usaEnvio: false,
    campos: ["produtoId", "fotosVersao", "posicao"],
    novas: [L1, { ...L3, posicao: 2 }],
    saiu: CH.B,
    fotosVersao: 3,
  },
  {
    nome: "moverFoto",
    chamar: (x) => moverFoto({ ...base, de: 1, para: 3, ...x } as never),
    lidas: [L1, L2, L3],
    usaEnvio: false,
    campos: ["produtoId", "fotosVersao", "de", "para"],
    novas: [{ ...L2, posicao: 1 }, { ...L3, posicao: 2 }, { ...L1, posicao: 3 }],
    fotosVersao: 3,
  },
];

const conjuntoLido = (c: Caso, versao = c.fotosVersao) => ({ fotosVersao: versao, fotos: c.lidas });
const semEfeitos = () => {
  for (const f of [
    m.dbDoContexto,
    m.lerConjunto,
    m.obterEnvio,
    m.substituirConjunto,
    m.apagarObjetos,
    m.revalidatePath,
  ])
    expect(f).not.toHaveBeenCalled();
};
const semEfeitosPosFalha = () => {
  expect(m.apagarObjetos).not.toHaveBeenCalled();
  expect(m.revalidatePath).not.toHaveBeenCalled();
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdminAction.mockResolvedValue(sessao);
  m.dbDoContexto.mockReturnValue(fakeDb);
  m.apagarObjetos.mockResolvedValue(undefined);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const prepararFeliz = (c: Caso) => {
  m.lerConjunto.mockResolvedValue(conjuntoLido(c));
  m.obterEnvio.mockResolvedValue(envio);
  m.substituirConjunto.mockResolvedValue({ tipo: "ok", fotosVersao: c.fotosVersao + 1 });
};

describe.each(CASOS)("$nome", (c) => {
  it("guard primeiro: sem sessão a promessa rejeita e nada mais é chamado", async () => {
    m.requireAdminAction.mockRejectedValue(new m.UnauthorizedError());
    await expect(c.chamar()).rejects.toBeInstanceOf(m.UnauthorizedError);
    semEfeitos();
  });

  describe("Zod antes de SQL (falha_geral sem atual)", () => {
    const invalidos: Record<string, unknown[]> = {
      produtoId: [0, -1, 1.5, "7"],
      fotosVersao: [-1, 1.5],
      posicao: [0, 4, 1.5],
      de: [0, 4, 1.5],
      para: [0, 4, 1.5],
      envioId: ["abc", "5f2b8c1a4d5e4f608a7b9c0d1e2f3a4b", "", 7],
    };
    const casos = c.campos.flatMap((campo) =>
      (invalidos[campo] ?? []).map((v) => [campo, v] as const),
    );
    it.each(casos)("campo %s = %j", async (campo, valor) => {
      const r = await c.chamar({ [campo]: valor });
      expect(r).toEqual({
        ok: false,
        motivo: "falha_geral",
        mensagem: mensagemFoto("falha_geral"),
      });
      expect(r).not.toHaveProperty("atual");
      expect(m.dbDoContexto).not.toHaveBeenCalled();
      expect(m.lerConjunto).not.toHaveBeenCalled();
      semEfeitosPosFalha();
    });
  });

  it("produto inexistente: nao_existe sem atual e sem substituir", async () => {
    m.lerConjunto.mockResolvedValue(undefined);
    const r = await c.chamar();
    expect(r).toEqual({ ok: false, motivo: "nao_existe", mensagem: mensagemFoto("nao_existe") });
    expect(r).not.toHaveProperty("atual");
    expect(m.substituirConjunto).not.toHaveBeenCalled();
    semEfeitosPosFalha();
  });

  it("US4-AC7: fotosVersao lida diferente da recebida: alterado com atual lido", async () => {
    m.lerConjunto.mockResolvedValue(conjuntoLido(c, 9));
    m.obterEnvio.mockResolvedValue(envio);
    const r = await c.chamar();
    expect(r).toEqual({
      ok: false,
      motivo: "alterado",
      mensagem: mensagemFoto("alterado"),
      atual: { fotosVersao: 9, fotos: c.lidas.map(vista) },
    });
    expect(m.obterEnvio).not.toHaveBeenCalled();
    expect(m.substituirConjunto).not.toHaveBeenCalled();
    semEfeitosPosFalha();
  });

  describe("sucesso", () => {
    beforeEach(() => prepararFeliz(c));

    it("devolve o conjunto novo e revalida as telas", async () => {
      const r = await c.chamar();
      expect(r).toEqual({
        ok: true,
        fotosVersao: c.fotosVersao + 1,
        fotos: (c.novas as ReturnType<typeof linha>[]).map(vista),
      });
      expect(r).not.toHaveProperty("mensagem");
      expect(m.revalidatePath).toHaveBeenCalledWith("/painel/produtos");
      expect(m.revalidatePath).toHaveBeenCalledWith("/painel/produtos/7");
    });

    it("chama substituirConjunto com as novas exatas e a versão lida", async () => {
      await c.chamar();
      expect(m.dbDoContexto).toHaveBeenCalled();
      const [db, s, entrada] = m.substituirConjunto.mock.calls[0];
      expect(db).toBe(fakeDb);
      expect(s).toBe(sessao);
      expect(entrada.produtoId).toBe(7);
      expect(entrada.fotosVersao).toBe(c.fotosVersao);
      expect(entrada.atuais).toEqual(c.lidas.map((l) => l.chave));
      expect(entrada.novas).toEqual(c.novas);
      if (c.usaEnvio) expect(entrada.envioId).toBe(ENV);
      else expect(entrada.envioId).toBeUndefined();
    });

    it("campos extras do cliente (chave, enviadoPor, enviadoEm) são ignorados", async () => {
      await c.chamar({
        chave: "produtos/hack.webp",
        enviadoPor: "x@y",
        enviadoEm: "2000-01-01",
        atuais: ["z"],
      });
      const entrada = m.substituirConjunto.mock.calls[0][2];
      expect(entrada.novas).toEqual(c.novas);
      expect(entrada.atuais).toEqual(c.lidas.map((l) => l.chave));
      expect(JSON.stringify(entrada)).not.toContain("hack");
      expect(JSON.stringify(entrada)).not.toContain("x@y");
    });

    it("US4-AC7: segunda chamada com a fotosVersao devolvida não dá alterado", async () => {
      await c.chamar();
      m.lerConjunto.mockResolvedValue(conjuntoLido(c, c.fotosVersao + 1));
      m.substituirConjunto.mockClear();
      m.substituirConjunto.mockResolvedValue({ tipo: "ok", fotosVersao: c.fotosVersao + 2 });
      const r = (await c.chamar({ fotosVersao: c.fotosVersao + 1 })) as { motivo?: string };
      expect(r.motivo).not.toBe("alterado");
      expect(m.substituirConjunto).toHaveBeenCalledTimes(1);
      expect(m.substituirConjunto.mock.calls[0][2].fotosVersao).toBe(c.fotosVersao + 1);
    });

    if (c.usaEnvio) {
      it("envioId em maiúsculas chega ao obterEnvio e ao substituirConjunto em minúsculas", async () => {
        await c.chamar({ envioId: ENV.toUpperCase() });
        expect(m.obterEnvio).toHaveBeenCalledWith(fakeDb, sessao, ENV);
        expect(m.substituirConjunto.mock.calls[0][2].envioId).toBe(ENV);
      });
    } else {
      it("nunca consulta obterEnvio", async () => {
        await c.chamar();
        expect(m.obterEnvio).not.toHaveBeenCalled();
      });
    }

    if (c.saiu) {
      it("R2: apaga a chave que saiu DEPOIS do batch", async () => {
        await c.chamar();
        expect(m.apagarObjetos).toHaveBeenCalledTimes(1);
        expect(m.apagarObjetos).toHaveBeenCalledWith([c.saiu]);
        expect(m.substituirConjunto.mock.invocationCallOrder[0]).toBeLessThan(
          m.apagarObjetos.mock.invocationCallOrder[0],
        );
      });

      it("R2 falhou: resposta ok idêntica e console.warn sem a chave", async () => {
        const esperado = await c.chamar();
        m.apagarObjetos.mockReset();
        warn.mockClear();
        m.apagarObjetos.mockRejectedValue(new Error(`falha em ${c.saiu}`));
        const r = await c.chamar();
        expect(r).toEqual(esperado);
        expect(warn).toHaveBeenCalled();
        const args = JSON.stringify(
          warn.mock.calls.flat().map((a: unknown) => (a instanceof Error ? a.name : a)),
        );
        expect(args).not.toContain(c.saiu!);
        expect(args).not.toContain(c.saiu!.slice("fotos/".length));
      });
    } else {
      it("nunca apaga objetos do R2", async () => {
        await c.chamar();
        expect(m.apagarObjetos).not.toHaveBeenCalled();
      });
    }
  });

  describe("falhas do batch", () => {
    beforeEach(() => prepararFeliz(c));

    it("ausente: nao_existe sem atual", async () => {
      m.substituirConjunto.mockResolvedValue({ tipo: "ausente" });
      const r = await c.chamar();
      expect(r).toEqual({ ok: false, motivo: "nao_existe", mensagem: mensagemFoto("nao_existe") });
      expect(m.lerConjunto).toHaveBeenCalledTimes(1);
      semEfeitosPosFalha();
    });

    it.each(["alterado", "foto_expirada"] as const)(
      "%s: relê o conjunto e o atual vem da segunda leitura",
      async (tipo) => {
        const segunda = { fotosVersao: 42, fotos: [linha(1, CH.C, "ana@x.com", 5)] };
        m.lerConjunto.mockReset();
        m.lerConjunto.mockResolvedValueOnce(conjuntoLido(c)).mockResolvedValueOnce(segunda);
        m.substituirConjunto.mockResolvedValue({ tipo });
        const r = await c.chamar();
        expect(m.lerConjunto).toHaveBeenCalledTimes(2);
        expect(r).toEqual({
          ok: false,
          motivo: tipo,
          mensagem: mensagemFoto(tipo),
          atual: { fotosVersao: 42, fotos: [vista(segunda.fotos[0])] },
        });
        semEfeitosPosFalha();
      },
    );

    it.each(["alterado", "foto_expirada"] as const)(
      "%s com releitura undefined: nao_existe",
      async (tipo) => {
        m.lerConjunto.mockReset();
        m.lerConjunto.mockResolvedValueOnce(conjuntoLido(c)).mockResolvedValueOnce(undefined);
        m.substituirConjunto.mockResolvedValue({ tipo });
        const r = await c.chamar();
        expect(r).toEqual({
          ok: false,
          motivo: "nao_existe",
          mensagem: mensagemFoto("nao_existe"),
        });
        semEfeitosPosFalha();
      },
    );
  });

  describe("exceções (nunca rejeita a promessa)", () => {
    beforeEach(() => prepararFeliz(c));

    it("primeira leitura rejeita: falha_geral sem atual", async () => {
      m.lerConjunto.mockReset();
      m.lerConjunto.mockRejectedValue(new Error("db fora"));
      const r = await c.chamar();
      expect(r).toEqual({
        ok: false,
        motivo: "falha_geral",
        mensagem: mensagemFoto("falha_geral"),
      });
      expect(m.substituirConjunto).not.toHaveBeenCalled();
      semEfeitosPosFalha();
    });

    it("substituirConjunto rejeita: falha_geral com atual da releitura", async () => {
      const segunda = { fotosVersao: 11, fotos: [linha(1, CH.B, "bia@x.com", 4)] };
      m.lerConjunto.mockReset();
      m.lerConjunto.mockResolvedValueOnce(conjuntoLido(c)).mockResolvedValueOnce(segunda);
      m.substituirConjunto.mockRejectedValue(new Error("batch falhou"));
      const r = await c.chamar();
      expect(r).toEqual({
        ok: false,
        motivo: "falha_geral",
        mensagem: mensagemFoto("falha_geral"),
        atual: { fotosVersao: 11, fotos: [vista(segunda.fotos[0])] },
      });
      semEfeitosPosFalha();
    });

    it("substituirConjunto e a releitura rejeitam: falha_geral sem atual", async () => {
      m.lerConjunto.mockReset();
      m.lerConjunto
        .mockResolvedValueOnce(conjuntoLido(c))
        .mockRejectedValueOnce(new Error("de novo"));
      m.substituirConjunto.mockRejectedValue(new Error("batch falhou"));
      const r = await c.chamar();
      expect(r).toEqual({
        ok: false,
        motivo: "falha_geral",
        mensagem: mensagemFoto("falha_geral"),
      });
      expect(r).not.toHaveProperty("atual");
      semEfeitosPosFalha();
    });
  });
});

describe.each(CASOS.filter((c) => c.usaEnvio))("$nome: envio", (c) => {
  beforeEach(() => prepararFeliz(c));

  it.each([
    ["inexistente", undefined],
    ["ainda emitido", { ...envio, estado: "emitido" }],
  ])("envio %s: foto_expirada com atual, sem substituir", async (_n, retorno) => {
    m.obterEnvio.mockResolvedValue(retorno);
    const r = await c.chamar();
    expect(m.obterEnvio).toHaveBeenCalledWith(fakeDb, sessao, ENV);
    expect(r).toEqual({
      ok: false,
      motivo: "foto_expirada",
      mensagem: mensagemFoto("foto_expirada"),
      atual: { fotosVersao: c.fotosVersao, fotos: c.lidas.map(vista) },
    });
    expect(m.substituirConjunto).not.toHaveBeenCalled();
    semEfeitosPosFalha();
  });
});

describe.each(CASOS.filter((c) => c.usaEnvio))("$nome: ordem e vista", (c) => {
  beforeEach(() => prepararFeliz(c));

  it("ordem: guard, leitura, envio, batch, revalidate e R2", async () => {
    await c.chamar();
    const o = (f: { mock: { invocationCallOrder: number[] } }) => f.mock.invocationCallOrder[0];
    const ordem = [
      o(m.requireAdminAction),
      o(m.lerConjunto),
      o(m.obterEnvio),
      o(m.substituirConjunto),
      o(m.revalidatePath),
    ];
    if (c.saiu) ordem.push(o(m.apagarObjetos));
    else expect(m.apagarObjetos).not.toHaveBeenCalled();
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
    expect(new Set(ordem).size).toBe(ordem.length);
  });

  it("chave do envio fora do formato: falha_geral com atual, sem batch", async () => {
    m.obterEnvio.mockResolvedValue({ ...envio, chave: "fotos/lixo.webp" });
    const r = await c.chamar();
    expect(r).toEqual({
      ok: false,
      motivo: "falha_geral",
      mensagem: mensagemFoto("falha_geral"),
      atual: { fotosVersao: c.fotosVersao, fotos: c.lidas.map(vista) },
    });
    expect(m.substituirConjunto).not.toHaveBeenCalled();
    semEfeitosPosFalha();
  });
});

describe("regras puras (sem chamar substituirConjunto)", () => {
  const recusa = async (
    chamar: () => Promise<unknown>,
    lidas: ReturnType<typeof linha>[],
    motivo: string,
  ) => {
    m.lerConjunto.mockResolvedValue({ fotosVersao: 3, fotos: lidas });
    m.obterEnvio.mockResolvedValue(envio);
    const r = await chamar();
    expect(r).toEqual({
      ok: false,
      motivo,
      mensagem: mensagemFoto(motivo as never),
      atual: { fotosVersao: 3, fotos: lidas.map(vista) },
    });
    expect(m.substituirConjunto).not.toHaveBeenCalled();
    semEfeitosPosFalha();
  };

  it("FR-025: adicionar com 3 fotos recusa com limite", async () => {
    await recusa(() => CASOS[0].chamar(), [L1, L2, L3], "limite");
    expect(mensagemFoto("limite")).toBe(
      "Este produto já tem 3 fotos. Remova ou troque uma para colocar outra.",
    );
  });

  it("remover com 1 foto recusa com ultima", async () => {
    await recusa(() => CASOS[2].chamar({ posicao: 1 }), [L1], "ultima");
  });

  it("trocar em posição inexistente recusa com falha_geral", async () => {
    await recusa(() => CASOS[1].chamar({ posicao: 3 }), [L1, L2], "falha_geral");
  });

  it("remover em posição inexistente recusa com falha_geral", async () => {
    await recusa(() => CASOS[2].chamar({ posicao: 3 }), [L1, L2], "falha_geral");
  });

  it("mover de posição inexistente recusa com falha_geral", async () => {
    await recusa(() => CASOS[3].chamar({ de: 3, para: 1 }), [L1, L2], "falha_geral");
  });

  it("mover para posição inexistente recusa com falha_geral", async () => {
    await recusa(() => CASOS[3].chamar({ de: 1, para: 3 }), [L1, L2], "falha_geral");
  });

  it("mover com de = para recusa com falha_geral", async () => {
    await recusa(() => CASOS[3].chamar({ de: 2, para: 2 }), [L1, L2, L3], "falha_geral");
  });
});

describe("variações de ordem", () => {
  it("mover 3 para 1 reordena e renumera", async () => {
    const c = CASOS[3];
    prepararFeliz(c);
    await c.chamar({ de: 3, para: 1 });
    expect(m.substituirConjunto.mock.calls[0][2].novas).toEqual([
      { ...L3, posicao: 1 },
      { ...L1, posicao: 2 },
      { ...L2, posicao: 3 },
    ]);
  });

  it("remover a primeira renumera as demais", async () => {
    const c = CASOS[2];
    prepararFeliz(c);
    await c.chamar({ posicao: 1 });
    expect(m.substituirConjunto.mock.calls[0][2].novas).toEqual([
      { ...L2, posicao: 1 },
      { ...L3, posicao: 2 },
    ]);
    expect(m.apagarObjetos).toHaveBeenCalledWith([CH.A]);
  });
});
