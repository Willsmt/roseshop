import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Feature 004, T062 (SF6): Server Actions pedirEnvio e confirmarEnvio (contracts/fotos.md §3).
// Unitário: guard, db e barrel do R2 mockados. Red: src/lib/fotos/ ainda não existe.

const m = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireAdminAction: vi.fn(),
    dbDoContexto: vi.fn(),
    emitirEnvio: vi.fn(),
    obterEnvio: vi.fn(),
    marcarConfirmado: vi.fn(),
    descartarEnvio: vi.fn(),
    assinarEnvio: vi.fn(),
    lerObjeto: vi.fn(),
    apagarObjetos: vi.fn(),
    verificarImagem: vi.fn(),
    modoVerificacao: vi.fn(),
    configR2: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireAdminAction: m.requireAdminAction,
  UnauthorizedError: m.UnauthorizedError,
}));
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: m.dbDoContexto }));
vi.mock("@/lib/db/fotos", () => ({
  emitirEnvio: m.emitirEnvio,
  obterEnvio: m.obterEnvio,
  marcarConfirmado: m.marcarConfirmado,
  descartarEnvio: m.descartarEnvio,
}));
vi.mock("@/lib/r2", () => ({
  assinarEnvio: m.assinarEnvio,
  lerObjeto: m.lerObjeto,
  apagarObjetos: m.apagarObjetos,
  verificarImagem: m.verificarImagem,
  modoVerificacao: m.modoVerificacao,
  configR2: m.configR2,
  arquivoDaChave: (chave: string) => chave.replace(/^fotos\//, ""),
}));

import { confirmarEnvio, pedirEnvio } from "./actions";
import { mensagemFoto } from "./mensagens";

const sessao = { email: "ana@x.com", name: "Ana" };
const fakeDb = { fake: "db" };
const ID = "3f2b8c1a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const CHAVE_WEBP = `fotos/${ID}.webp`;
const CHAVE_JPG = `fotos/${ID}.jpg`;
const MAX = 1_048_576;

const todosOsMocks = () => [
  m.dbDoContexto,
  m.emitirEnvio,
  m.obterEnvio,
  m.marcarConfirmado,
  m.descartarEnvio,
  m.assinarEnvio,
  m.lerObjeto,
  m.apagarObjetos,
  m.verificarImagem,
  m.configR2,
];
const semEfeitos = () => {
  for (const f of todosOsMocks()) expect(f).not.toHaveBeenCalled();
};
const semSql = () => {
  expect(m.emitirEnvio).not.toHaveBeenCalled();
  expect(m.obterEnvio).not.toHaveBeenCalled();
  expect(m.marcarConfirmado).not.toHaveBeenCalled();
  expect(m.descartarEnvio).not.toHaveBeenCalled();
};

let warn: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdminAction.mockResolvedValue(sessao);
  m.dbDoContexto.mockReturnValue(fakeDb);
  m.configR2.mockResolvedValue({ qualquer: "config" });
  m.modoVerificacao.mockReturnValue("recusar");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const semLogs = () => {
  for (const s of [warn, log, info, error]) expect(s).not.toHaveBeenCalled();
};
const logsDeVerificacao = () =>
  [warn, log, info, error].flatMap((s) =>
    s.mock.calls.filter((c: unknown[]) => String(c[0]).includes("fotos.verificacao")),
  );
const semBytesNoLog = () => {
  const visita = (v: unknown) => {
    expect(v instanceof Uint8Array).toBe(false);
    expect(v instanceof ArrayBuffer).toBe(false);
    if (v && typeof v === "object") {
      expect(Object.keys(v)).not.toContain("bytes");
      for (const x of Object.values(v)) visita(x);
    }
  };
  for (const s of [warn, log, info, error]) for (const c of s.mock.calls) c.forEach(visita);
};

describe("pedirEnvio", () => {
  const ok = { formato: "webp" as const, tamanho: 500_000 };

  beforeEach(() => {
    m.emitirEnvio.mockResolvedValue({ tipo: "ok", chave: CHAVE_WEBP });
    m.assinarEnvio.mockResolvedValue({
      url: "https://r2.exemplo/x?sig=1",
      headers: { "content-type": "image/webp", "if-none-match": "*" },
    });
  });

  it("US2-AC6: sem sessão rejeita com UnauthorizedError e nada de db/r2 é chamado", async () => {
    m.requireAdminAction.mockRejectedValue(new m.UnauthorizedError());
    await expect(pedirEnvio(ok)).rejects.toBeInstanceOf(m.UnauthorizedError);
    semEfeitos();
  });

  it("sucesso: emite, assina com a chave devolvida e devolve url e headers", async () => {
    const r = await pedirEnvio(ok);
    expect(m.emitirEnvio).toHaveBeenCalledWith(
      fakeDb,
      sessao,
      expect.objectContaining({ formato: "webp", tamanho: 500_000, id: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    );
    const id = m.emitirEnvio.mock.calls[0][2].id;
    expect(m.assinarEnvio).toHaveBeenCalledWith({ chave: CHAVE_WEBP, formato: "webp", tamanho: 500_000 });
    expect(r).toEqual({
      ok: true,
      envioId: id,
      url: "https://r2.exemplo/x?sig=1",
      headers: { "content-type": "image/webp", "if-none-match": "*" },
    });
  });

  it("tamanho exatamente 1_048_576 passa", async () => {
    const r = await pedirEnvio({ formato: "jpeg", tamanho: MAX });
    expect(r.ok).toBe(true);
    expect(m.emitirEnvio).toHaveBeenCalledTimes(1);
  });

  it("US2-AC5: tamanho > 1_048_576 ⇒ grande, sem SQL e sem assinar", async () => {
    const r = await pedirEnvio({ formato: "webp", tamanho: MAX + 1 });
    expect(r).toMatchObject({ ok: false, motivo: "grande", mensagem: mensagemFoto("grande") });
    expect(m.configR2).not.toHaveBeenCalled();
    expect(m.emitirEnvio).not.toHaveBeenCalled();
    expect(m.assinarEnvio).not.toHaveBeenCalled();
  });

  it.each([
    ["zero", { formato: "webp", tamanho: 0 }],
    ["negativo", { formato: "webp", tamanho: -5 }],
    ["não inteiro", { formato: "webp", tamanho: 10.5 }],
    ["NaN", { formato: "webp", tamanho: Number.NaN }],
    ["tamanho string", { formato: "webp", tamanho: "10" }],
    ["formato inválido", { formato: "png", tamanho: 100 }],
    ["formato ausente", { tamanho: 100 }],
  ])("Zod antes de SQL: %s ⇒ falha_geral sem SQL", async (_n, entrada) => {
    const r = await pedirEnvio(entrada as never);
    expect(r).toMatchObject({ ok: false, motivo: "falha_geral", mensagem: mensagemFoto("falha_geral") });
    expect(m.configR2).not.toHaveBeenCalled();
    expect(m.emitirEnvio).not.toHaveBeenCalled();
    expect(m.assinarEnvio).not.toHaveBeenCalled();
  });

  it("D13: muitos_pendentes ⇒ falha sem assinar", async () => {
    m.emitirEnvio.mockResolvedValue({ tipo: "muitos_pendentes" });
    const r = await pedirEnvio(ok);
    expect(r).toMatchObject({ ok: false, motivo: "muitos_pendentes", mensagem: mensagemFoto("muitos_pendentes") });
    expect(m.assinarEnvio).not.toHaveBeenCalled();
    expect(m.descartarEnvio).not.toHaveBeenCalled();
  });

  it("ordem: guard → configR2 → emitirEnvio (invocationCallOrder)", async () => {
    await pedirEnvio(ok);
    expect(m.configR2).toHaveBeenCalledTimes(1);
    const g = m.requireAdminAction.mock.invocationCallOrder[0];
    const c = m.configR2.mock.invocationCallOrder[0];
    const e = m.emitirEnvio.mock.invocationCallOrder[0];
    expect(g).toBeLessThan(c);
    expect(c).toBeLessThan(e);
  });

  it("configR2 lança ⇒ falha_geral; emitirEnvio, assinarEnvio e descartarEnvio não são chamados", async () => {
    m.configR2.mockRejectedValue(new Error("config ausente"));
    const r = await pedirEnvio(ok);
    expect(r).toMatchObject({ ok: false, motivo: "falha_geral", mensagem: mensagemFoto("falha_geral") });
    expect(m.emitirEnvio).not.toHaveBeenCalled();
    expect(m.assinarEnvio).not.toHaveBeenCalled();
    expect(m.descartarEnvio).not.toHaveBeenCalled();
  });

  it("configR2 lança de forma síncrona ⇒ falha_geral sem emitir", async () => {
    m.configR2.mockImplementation(() => {
      throw new Error("config ausente");
    });
    const r = await pedirEnvio(ok);
    expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
    expect(m.emitirEnvio).not.toHaveBeenCalled();
    expect(m.assinarEnvio).not.toHaveBeenCalled();
    expect(m.descartarEnvio).not.toHaveBeenCalled();
  });

  it("assinarEnvio lança após emitir ⇒ descartarEnvio com o mesmo id, falha_geral, sem apagarObjetos", async () => {
    m.assinarEnvio.mockRejectedValue(new Error("config"));
    m.descartarEnvio.mockResolvedValue(CHAVE_WEBP);
    const r = await pedirEnvio(ok);
    expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
    const id = m.emitirEnvio.mock.calls[0][2].id;
    expect(m.descartarEnvio).toHaveBeenCalledTimes(1);
    expect(m.descartarEnvio).toHaveBeenCalledWith(fakeDb, sessao, id);
    expect(m.emitirEnvio.mock.invocationCallOrder[0]).toBeLessThan(m.descartarEnvio.mock.invocationCallOrder[0]);
    expect(m.apagarObjetos).not.toHaveBeenCalled();
  });

  it("assinarEnvio lança e descartarEnvio também rejeita ⇒ ainda falha_geral (não propaga)", async () => {
    m.assinarEnvio.mockRejectedValue(new Error("config"));
    m.descartarEnvio.mockRejectedValue(new Error("db fora"));
    const r = await pedirEnvio(ok);
    expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
    expect(m.descartarEnvio).toHaveBeenCalledTimes(1);
    expect(m.apagarObjetos).not.toHaveBeenCalled();
  });

  it("S3: descartarEnvio rejeita ⇒ um único console.warn fixo, sem chave, id, URL nem segredos no log", async () => {
    const SEGREDO = "SEGREDO-TESTE";
    const AKID = "AKID-TESTE";
    const ENDPOINT = "https://r2.exemplo/bucket";
    const URL_ASSINADA = "https://r2.exemplo/bucket/x?X-Amz-Signature=abc123";
    m.configR2.mockResolvedValue({ accessKeyId: AKID, secretAccessKey: SEGREDO, endpoint: ENDPOINT });
    let chave = "";
    m.emitirEnvio.mockImplementation(async (_db: unknown, _s: unknown, dados: { id: string }) => {
      chave = `fotos/${dados.id}.webp`;
      return { tipo: "ok", chave };
    });
    m.assinarEnvio.mockImplementation(async () => {
      throw new Error(`falha ${chave} ${SEGREDO} ${AKID} ${URL_ASSINADA}`);
    });
    m.descartarEnvio.mockImplementation(async (_db: unknown, _s: unknown, id: string) => {
      throw new Error(`db fora ${chave} ${id} ${SEGREDO}`, { cause: new Error(`causa ${chave} ${id}`) });
    });

    const r = await pedirEnvio(ok);

    expect(r).toEqual({ ok: false, motivo: "falha_geral", mensagem: mensagemFoto("falha_geral") });
    expect(r).not.toHaveProperty("atual");
    const id = m.emitirEnvio.mock.calls[0][2].id as string;
    expect(chave).toBe(`fotos/${id}.webp`);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe("fotos.envio.linha_nao_descartada");
    for (const s of [error, log, info]) expect(s).not.toHaveBeenCalled();

    const textos: string[] = [];
    const visita = (v: unknown, vistos = new Set<unknown>()) => {
      if (v === null || v === undefined) return;
      if (typeof v === "object" || typeof v === "function") {
        if (vistos.has(v)) return;
        vistos.add(v);
      }
      if (v instanceof Error) {
        textos.push(v.name, v.message, v.stack ?? "");
        visita(v.cause, vistos);
      }
      if (typeof v === "object") {
        for (const k of Reflect.ownKeys(v)) {
          textos.push(String(k));
          visita((v as Record<string | symbol, unknown>)[k], vistos);
        }
      } else {
        textos.push(String(v));
      }
    };
    for (const s of [warn, log, info, error]) for (const c of s.mock.calls) c.forEach((a: unknown) => visita(a));
    const tudo = textos.join("\n");
    expect(tudo).toContain("fotos.envio.linha_nao_descartada");
    for (const proibido of [chave, id, URL_ASSINADA, "X-Amz-Signature", SEGREDO, AKID, ENDPOINT]) {
      expect(tudo).not.toContain(proibido);
    }
  });

  it("falha do banco no emitirEnvio ⇒ falha_geral, sem assinar e sem descartar", async () => {
    m.emitirEnvio.mockRejectedValue(new Error("db"));
    const r = await pedirEnvio(ok);
    expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
    expect(m.assinarEnvio).not.toHaveBeenCalled();
    expect(m.descartarEnvio).not.toHaveBeenCalled();
  });
});

describe("confirmarEnvio", () => {
  const envio = (extra: Record<string, unknown> = {}) => ({
    id: ID,
    formato: "webp",
    chave: CHAVE_WEBP,
    tamanho: 1000,
    enviadoPor: sessao.email,
    estado: "emitido",
    ...extra,
  });
  const bytes = new Uint8Array([1, 2, 3]);
  const objeto = (tamanho = 1000) => ({ tamanho, bytes: vi.fn().mockResolvedValue(bytes) });
  const aceito = { ok: true, formato: "webp", lado: 800, blocos: ["VP8 "] };

  beforeEach(() => {
    m.obterEnvio.mockResolvedValue(envio());
    m.lerObjeto.mockResolvedValue(objeto());
    m.verificarImagem.mockReturnValue(aceito);
    m.marcarConfirmado.mockResolvedValue(true);
    m.descartarEnvio.mockResolvedValue(CHAVE_WEBP);
    m.apagarObjetos.mockResolvedValue(undefined);
  });

  describe("guard e Zod", () => {
    it("US2-AC6: sem sessão rejeita com UnauthorizedError e nada é chamado", async () => {
      m.requireAdminAction.mockRejectedValue(new m.UnauthorizedError());
      await expect(confirmarEnvio({ envioId: ID })).rejects.toBeInstanceOf(m.UnauthorizedError);
      semEfeitos();
    });

    it.each([
      ["com chaves", `{${ID}}`],
      ["sem hífen", ID.replaceAll("-", "")],
      ["vazio", ""],
      ["não-string", 123],
      ["nulo", null],
    ])("envioId %s ⇒ falha_geral sem SQL", async (_n, envioId) => {
      const r = await confirmarEnvio({ envioId } as never);
      expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
      semSql();
      expect(m.lerObjeto).not.toHaveBeenCalled();
    });

    it("normaliza o uuid para minúsculas: obterEnvio recebe minúsculas", async () => {
      await confirmarEnvio({ envioId: ID.toUpperCase() });
      expect(m.obterEnvio).toHaveBeenCalledWith(fakeDb, sessao, ID);
    });
  });

  describe("estado do envio", () => {
    it("inexistente ⇒ falha_geral", async () => {
      m.obterEnvio.mockResolvedValue(undefined);
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
      expect(m.lerObjeto).not.toHaveBeenCalled();
    });

    it("já confirmado ⇒ ok idempotente, sem lerObjeto e sem verificar", async () => {
      m.obterEnvio.mockResolvedValue(envio({ estado: "confirmado" }));
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toEqual({ ok: true, envioId: ID, arquivo: `${ID}.webp` });
      expect(m.lerObjeto).not.toHaveBeenCalled();
      expect(m.verificarImagem).not.toHaveBeenCalled();
      expect(m.marcarConfirmado).not.toHaveBeenCalled();
    });

    it("US2-AC8: objeto ausente ⇒ nao_enviada; a linha fica e nada é apagado", async () => {
      m.lerObjeto.mockResolvedValue(null);
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "nao_enviada", mensagem: mensagemFoto("nao_enviada") });
      expect(m.descartarEnvio).not.toHaveBeenCalled();
      expect(m.apagarObjetos).not.toHaveBeenCalled();
    });

    it("exceção do banco ⇒ falha_geral", async () => {
      m.obterEnvio.mockRejectedValue(new Error("db"));
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
    });

    it("exceção do lerObjeto ⇒ falha_geral", async () => {
      m.lerObjeto.mockRejectedValue(new Error("r2"));
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
    });
  });

  describe("tamanho do objeto", () => {
    it("US2-AC5: tamanho > máximo ⇒ grande sem chamar bytes(), descarta e apaga", async () => {
      const o = objeto(MAX + 1);
      m.lerObjeto.mockResolvedValue(o);
      m.obterEnvio.mockResolvedValue(envio({ tamanho: MAX + 1 }));
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "grande" });
      expect(o.bytes).not.toHaveBeenCalled();
      expect(m.verificarImagem).not.toHaveBeenCalled();
      expect(m.descartarEnvio).toHaveBeenCalledWith(fakeDb, sessao, ID);
      expect(m.apagarObjetos).toHaveBeenCalledWith([CHAVE_WEBP]);
    });

    it("tamanho ≠ assinado ⇒ grande sem chamar bytes()", async () => {
      const o = objeto(2000);
      m.lerObjeto.mockResolvedValue(o);
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "grande" });
      expect(o.bytes).not.toHaveBeenCalled();
      expect(m.descartarEnvio).toHaveBeenCalledTimes(1);
      expect(m.apagarObjetos).toHaveBeenCalledWith([CHAVE_WEBP]);
    });
  });

  describe("formato declarado", () => {
    it("declarado vem da extensão .webp", async () => {
      await confirmarEnvio({ envioId: ID });
      expect(m.verificarImagem).toHaveBeenCalledWith(bytes, expect.objectContaining({ declarado: "webp", modo: "recusar" }));
    });

    it("declarado vem da extensão .jpg ⇒ jpeg", async () => {
      m.obterEnvio.mockResolvedValue(envio({ formato: "jpeg", chave: CHAVE_JPG }));
      await confirmarEnvio({ envioId: ID });
      expect(m.verificarImagem).toHaveBeenCalledWith(bytes, expect.objectContaining({ declarado: "jpeg" }));
    });

    it("a verificação recebe o modo de modoVerificacao()", async () => {
      m.modoVerificacao.mockReturnValue("registro");
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await confirmarEnvio({ envioId: ID });
      expect(m.verificarImagem).toHaveBeenCalledWith(bytes, expect.objectContaining({ modo: "registro" }));
    });

    it("US2-AC3: formato detectado ≠ declarado ⇒ formato", async () => {
      m.verificarImagem.mockReturnValue({ ok: false, motivo: "formato", regra: "declarado", blocos: [] });
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "formato", mensagem: mensagemFoto("formato") });
    });
  });

  describe("recusas: descarta a linha primeiro, apaga o objeto só se a linha voltar (TL-2)", () => {
    it.each([
      ["formato", "formato"],
      ["metadado", "nao_passou"],
      ["animada", "nao_passou"],
      ["corrompida", "nao_passou"],
      ["dimensao", "nao_passou"],
      ["pequena", "pequena"],
    ])("motivo %s ⇒ %s", async (motivoVerif, esperado) => {
      m.verificarImagem.mockReturnValue({ ok: false, motivo: motivoVerif, regra: "r", blocos: [] });
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: esperado, mensagem: mensagemFoto(esperado as never) });
      expect(m.descartarEnvio).toHaveBeenCalledWith(fakeDb, sessao, ID);
      expect(m.apagarObjetos).toHaveBeenCalledTimes(1);
      expect(m.apagarObjetos).toHaveBeenCalledWith([CHAVE_WEBP]);
      expect(m.descartarEnvio.mock.invocationCallOrder[0]).toBeLessThan(
        m.apagarObjetos.mock.invocationCallOrder[0],
      );
      expect(m.marcarConfirmado).not.toHaveBeenCalled();
    });

    it("apagarObjetos só recebe a chave devolvida pelo descartarEnvio", async () => {
      m.verificarImagem.mockReturnValue({ ok: false, motivo: "formato", regra: "assinatura", blocos: [] });
      m.descartarEnvio.mockResolvedValue("fotos/outra-chave.webp");
      await confirmarEnvio({ envioId: ID });
      expect(m.apagarObjetos).toHaveBeenCalledWith(["fotos/outra-chave.webp"]);
    });

    it("confirmação concorrente (descartarEnvio devolve undefined) ⇒ não apaga o objeto, falha ainda devolvida", async () => {
      m.verificarImagem.mockReturnValue({ ok: false, motivo: "pequena", regra: "lado_menor", blocos: [] });
      m.descartarEnvio.mockResolvedValue(undefined);
      const r = await confirmarEnvio({ envioId: ID });
      expect(m.apagarObjetos).not.toHaveBeenCalled();
      expect(r).toMatchObject({ ok: false, motivo: "pequena" });
    });

    it("grande com descartarEnvio undefined ⇒ não apaga e devolve grande", async () => {
      m.lerObjeto.mockResolvedValue(objeto(MAX + 1));
      m.obterEnvio.mockResolvedValue(envio({ tamanho: MAX + 1 }));
      m.descartarEnvio.mockResolvedValue(undefined);
      const r = await confirmarEnvio({ envioId: ID });
      expect(m.apagarObjetos).not.toHaveBeenCalled();
      expect(r).toMatchObject({ ok: false, motivo: "grande" });
    });

    it("melhor esforço: apagarObjetos rejeita ⇒ a falha do motivo é devolvida mesmo assim", async () => {
      m.verificarImagem.mockReturnValue({ ok: false, motivo: "animada", regra: "x", blocos: [] });
      m.apagarObjetos.mockRejectedValue(new Error("r2 fora"));
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "nao_passou" });
    });
  });

  describe("aceito", () => {
    it("marcarConfirmado true ⇒ ok com arquivo", async () => {
      const r = await confirmarEnvio({ envioId: ID });
      expect(m.marcarConfirmado).toHaveBeenCalledWith(fakeDb, sessao, ID);
      expect(r).toEqual({ ok: true, envioId: ID, arquivo: `${ID}.webp` });
      expect(m.descartarEnvio).not.toHaveBeenCalled();
      expect(m.apagarObjetos).not.toHaveBeenCalled();
    });

    it("marcarConfirmado false + releitura confirmado ⇒ ok", async () => {
      m.marcarConfirmado.mockResolvedValue(false);
      m.obterEnvio
        .mockResolvedValueOnce(envio())
        .mockResolvedValueOnce(envio({ estado: "confirmado" }));
      const r = await confirmarEnvio({ envioId: ID });
      expect(m.obterEnvio).toHaveBeenCalledTimes(2);
      expect(r).toEqual({ ok: true, envioId: ID, arquivo: `${ID}.webp` });
    });

    it("marcarConfirmado false + releitura sem linha ⇒ falha_geral", async () => {
      m.marcarConfirmado.mockResolvedValue(false);
      m.obterEnvio.mockResolvedValueOnce(envio()).mockResolvedValueOnce(undefined);
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
    });

    it("marcarConfirmado false + releitura ainda emitido ⇒ falha_geral", async () => {
      m.marcarConfirmado.mockResolvedValue(false);
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: "falha_geral" });
    });
  });

  describe("modo registro (F§3 passo 5)", () => {
    beforeEach(() => m.modoVerificacao.mockReturnValue("registro"));

    it("aceito em registro ⇒ console.warn com blocos e segue para marcarConfirmado", async () => {
      const r = await confirmarEnvio({ envioId: ID });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("fotos.verificacao.registro", {
        envioId: ID,
        resultado: "aceito",
        blocos: aceito.blocos,
      });
      expect(m.marcarConfirmado).toHaveBeenCalledTimes(1);
      expect(r).toMatchObject({ ok: true });
      semBytesNoLog();
    });

    it("recusado em registro ⇒ console.warn com motivo, regra e blocos, ANTES do descartarEnvio", async () => {
      m.verificarImagem.mockReturnValue({
        ok: false,
        motivo: "corrompida",
        regra: "truncada",
        blocos: ["APP1", "EXIF"],
      });
      const r = await confirmarEnvio({ envioId: ID });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("fotos.verificacao.registro", {
        envioId: ID,
        resultado: "recusado",
        motivo: "corrompida",
        regra: "truncada",
        blocos: ["APP1", "EXIF"],
      });
      expect(warn.mock.invocationCallOrder[0]).toBeLessThan(m.descartarEnvio.mock.invocationCallOrder[0]);
      expect(r).toMatchObject({ ok: false, motivo: "nao_passou" });
      semBytesNoLog();
    });
  });

  describe("modo recusar: nenhum log novo", () => {
    it("aceite sem log", async () => {
      await confirmarEnvio({ envioId: ID });
      semLogs();
      expect(logsDeVerificacao()).toEqual([]);
    });

    it("recusa sem log", async () => {
      m.verificarImagem.mockReturnValue({ ok: false, motivo: "metadado", regra: "exif", blocos: ["EXIF"] });
      await confirmarEnvio({ envioId: ID });
      semLogs();
      expect(logsDeVerificacao()).toEqual([]);
    });
  });

  describe("SC-006: arquivos forjados são descartados, apagados e recusados", () => {
    const forjados: [string, string, string, string][] = [
      ["extensão trocada", "formato", "assinatura", "formato"],
      ["declarado diferente", "formato", "declarado", "formato"],
      ["truncado", "corrompida", "truncada", "nao_passou"],
      ["com EXIF/metadado", "metadado", "exif", "nao_passou"],
      ["animado", "animada", "frames", "nao_passou"],
      ["dimensão fora do limite", "dimensao", "lado_maior", "nao_passou"],
      ["pequeno demais", "pequena", "lado_menor", "pequena"],
    ];
    it.each(forjados)("%s", async (_nome, motivo, regra, esperado) => {
      m.verificarImagem.mockReturnValue({ ok: false, motivo, regra, blocos: [] });
      const r = await confirmarEnvio({ envioId: ID });
      expect(r).toMatchObject({ ok: false, motivo: esperado });
      expect(m.descartarEnvio).toHaveBeenCalledTimes(1);
      expect(m.apagarObjetos).toHaveBeenCalledWith([CHAVE_WEBP]);
      expect(m.marcarConfirmado).not.toHaveBeenCalled();
    });
  });
});
