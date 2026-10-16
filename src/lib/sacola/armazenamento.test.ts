import { describe, expect, it, vi } from "vitest";
import { CHAVE, EVENTO_LOCAL, alterarSacola, assinarSacola, lerSacola } from "./armazenamento";
import { VALIDADE_MS, adicionar, limpar, mudarQuantidade, remover } from "./sacola";

// Feature 006, SF4, T036 (contracts/sacola.md §6, data-model §1, research D5, FR-006, FR-007,
// FR-008a, US4.1–4.5): leitura nunca grava; cada alteração relê, valida, aplica e grava dentro de
// try/catch; o formato gravado é fechado.

const AGORA = 1_760_600_000_000;
const DIA = 24 * 3600 * 1000;

class StorageFalso implements Storage {
  dados = new Map<string, string>();
  get length() {
    return this.dados.size;
  }
  clear() {
    this.dados.clear();
  }
  getItem(k: string) {
    return this.dados.get(k) ?? null;
  }
  key(i: number) {
    return [...this.dados.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.dados.delete(k);
  }
  setItem(k: string, v: string) {
    this.dados.set(k, v);
  }
}

function comBruto(bruto: string | null) {
  const s = new StorageFalso();
  if (bruto !== null) s.dados.set(CHAVE, bruto);
  const setItem = vi.spyOn(s, "setItem");
  const removeItem = vi.spyOn(s, "removeItem");
  return { s, storage: () => s, setItem, removeItem };
}

const valido = (extra: Record<string, unknown> = {}, item: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, t: AGORA - 1000, i: [{ c: "0042", q: 2, p: 600, a: false, ...item }], ...extra });

function alvoFalso() {
  const alvo = new EventTarget();
  const eventos: string[] = [];
  alvo.addEventListener(EVENTO_LOCAL, (e) => eventos.push(e.type));
  return { alvo, eventos };
}

function vazia(l: ReturnType<typeof lerSacola>): boolean {
  return l.disponivel && l.sacola.itens.length === 0;
}

describe("lerSacola", () => {
  it("lê a sacola válida no formato curto", () => {
    const { storage } = comBruto(valido());
    expect(lerSacola(storage, AGORA)).toEqual({
      disponivel: true,
      sacola: {
        versao: 1,
        alteradaEm: AGORA - 1000,
        itens: [{ codigo: "0042", quantidade: 2, precoVisto: 600, aPartirDe: false }],
      },
    });
  });

  it("aceita preço nulo, a partir de e o maior código (2147483647)", () => {
    const { storage } = comBruto(valido({}, { c: "2147483647", p: null, a: true }));
    const l = lerSacola(storage, AGORA);
    expect(l.disponivel && l.sacola.itens[0]).toEqual({
      codigo: "2147483647",
      quantidade: 2,
      precoVisto: null,
      aPartirDe: true,
    });
  });

  it("aceita t no futuro até 1 dia e idade exatamente 7 dias", () => {
    expect(vazia(lerSacola(comBruto(valido({ t: AGORA + DIA })).storage, AGORA))).toBe(false);
    expect(vazia(lerSacola(comBruto(valido({ t: AGORA - VALIDADE_MS })).storage, AGORA))).toBe(false);
  });

  const quinze = Array.from({ length: 15 }, (_, k) => ({ c: String(1000 + k), q: 1, p: 100, a: false }));
  it("aceita 15 itens", () => {
    const l = lerSacola(comBruto(JSON.stringify({ v: 1, t: AGORA, i: quinze })).storage, AGORA);
    expect(l.disponivel && l.sacola.itens).toHaveLength(15);
  });

  it.each<[string, string | null]>([
    ["chave ausente", null],
    ["JSON corrompido", "{v:1"],
    ["JSON que não é objeto", "[]"],
    ["v: 0", valido({ v: 0 })],
    ["t com mais de 7 dias", valido({ t: AGORA - VALIDADE_MS - 1 })],
    ["t mais de 1 dia no futuro", valido({ t: AGORA + DIA + 1 })],
    ["t não inteiro", valido({ t: AGORA - 0.5 })],
    ["quantidade 0", valido({}, { q: 0 })],
    ["quantidade 11", valido({}, { q: 11 })],
    ['código "42"', valido({}, { c: "42" })],
    ['código "0000"', valido({}, { c: "0000" })],
    ['código "2147483648"', valido({}, { c: "2147483648" })],
    ['código "12345678901"', valido({}, { c: "12345678901" })],
    ['código "01234"', valido({}, { c: "01234" })],
    ["código número", valido({}, { c: 42 })],
    [
      "código repetido",
      JSON.stringify({
        v: 1,
        t: AGORA,
        i: [
          { c: "0042", q: 1, p: 600, a: false },
          { c: "0042", q: 2, p: 600, a: false },
        ],
      }),
    ],
    ["16 itens", JSON.stringify({ v: 1, t: AGORA, i: [...quinze, { c: "0042", q: 1, p: 1, a: false }] })],
    ["p 0", valido({}, { p: 0 })],
    ["p 10.000.000", valido({}, { p: 10_000_000 })],
    ["a ausente", JSON.stringify({ v: 1, t: AGORA, i: [{ c: "0042", q: 1, p: 600 }] })],
    ["chave extra no topo", valido({ nome: "Ana" })],
    ["chave extra no item", valido({}, { n: "Meia" })],
  ])("devolve vazia sem gravar: %s", (_nome, bruto) => {
    const { storage, setItem, removeItem } = comBruto(bruto);
    expect(vazia(lerSacola(storage, AGORA))).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("storage() que lança ⇒ indisponível (US4.4)", () => {
    const storage = () => {
      throw new DOMException("bloqueado", "SecurityError");
    };
    expect(lerSacola(storage, AGORA)).toEqual({ disponivel: false });
  });

  it("getItem que lança ⇒ indisponível", () => {
    const { s, storage } = comBruto(valido());
    vi.spyOn(s, "getItem").mockImplementation(() => {
      throw new Error("x");
    });
    expect(lerSacola(storage, AGORA)).toEqual({ disponivel: false });
  });
});

describe("alterarSacola", () => {
  it("relê imediatamente antes de gravar e aplica a operação sobre a relida", () => {
    const { s, storage } = comBruto(valido());
    // Outra aba grava entre a leitura da tela e o toque: a operação vê o que está no aparelho.
    s.dados.set(CHAVE, valido({}, { c: "0007" }));
    const r = alterarSacola(storage, adicionar({ codigo: "0042", precoCentavos: 600, aPartirDe: false }), AGORA);
    expect(r.ok).toBe(true);
    const l = lerSacola(storage, AGORA);
    expect(l.disponivel && l.sacola.itens.map((i) => i.codigo)).toEqual(["0007", "0042"]);
  });

  it("a ordem é getItem → setItem", () => {
    const { s, storage } = comBruto(null);
    const ordem: string[] = [];
    vi.spyOn(s, "getItem").mockImplementation((k) => (ordem.push("get"), s.dados.get(k) ?? null));
    vi.spyOn(s, "setItem").mockImplementation((k, v) => (ordem.push("set"), void s.dados.set(k, v)));
    alterarSacola(storage, adicionar({ codigo: "0042", precoCentavos: 600, aPartirDe: false }), AGORA, alvoFalso().alvo);
    expect(ordem).toEqual(["get", "set"]);
  });

  it("grava o formato fechado com só v, t e i[].c/q/p/a (US4.5, FR-006)", () => {
    const { s, storage } = comBruto(null);
    alterarSacola(storage, adicionar({ codigo: "0042", precoCentavos: 600, aPartirDe: true }), AGORA, alvoFalso().alvo);
    const gravado = JSON.parse(s.dados.get(CHAVE)!);
    expect(gravado).toEqual({ v: 1, t: AGORA, i: [{ c: "0042", q: 1, p: 600, a: true }] });
    expect(Object.keys(gravado).sort()).toEqual(["i", "t", "v"]);
    expect(Object.keys(gravado.i[0]).sort()).toEqual(["a", "c", "p", "q"]);
  });

  it("dispara roseshop:sacola depois de gravar", () => {
    const { storage } = comBruto(null);
    const { alvo, eventos } = alvoFalso();
    alterarSacola(storage, adicionar({ codigo: "0042", precoCentavos: 600, aPartirDe: false }), AGORA, alvo);
    expect(eventos).toEqual([EVENTO_LOCAL]);
  });

  it("sem mudança não grava nem dispara evento", () => {
    const { storage, setItem, removeItem } = comBruto(valido());
    const { alvo, eventos } = alvoFalso();
    const r = alterarSacola(storage, adicionar({ codigo: "0042", precoCentavos: 600, aPartirDe: false }), AGORA, alvo);
    expect(r).toMatchObject({ ok: true, mudou: false });
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(eventos).toEqual([]);
  });

  it("operação recusada não grava e devolve o motivo", () => {
    const { storage, setItem } = comBruto(valido());
    const r = alterarSacola(storage, mudarQuantidade("0042", 11), AGORA, alvoFalso().alvo);
    expect(r).toEqual({ ok: false, motivo: "quantidade_fora" });
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each([
    ["remover o último", remover("0042")],
    ["limpar", limpar()],
  ])("%s limpa com removeItem", (_nome, op) => {
    const { s, storage, setItem, removeItem } = comBruto(valido());
    const { alvo, eventos } = alvoFalso();
    expect(alterarSacola(storage, op, AGORA, alvo)).toMatchObject({ ok: true, mudou: true });
    expect(removeItem).toHaveBeenCalledWith(CHAVE);
    expect(setItem).not.toHaveBeenCalled();
    expect(s.dados.has(CHAVE)).toBe(false);
    expect(eventos).toEqual([EVENTO_LOCAL]);
  });

  it("setItem que lança ⇒ { ok: false, motivo: armazenamento }, sem evento", () => {
    const { s, storage } = comBruto(null);
    vi.spyOn(s, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    const { alvo, eventos } = alvoFalso();
    const r = alterarSacola(storage, adicionar({ codigo: "0042", precoCentavos: 600, aPartirDe: false }), AGORA, alvo);
    expect(r).toEqual({ ok: false, motivo: "armazenamento" });
    expect(eventos).toEqual([]);
  });

  it("removeItem que lança ⇒ armazenamento", () => {
    const { s, storage } = comBruto(valido());
    vi.spyOn(s, "removeItem").mockImplementation(() => {
      throw new Error("x");
    });
    expect(alterarSacola(storage, limpar(), AGORA, alvoFalso().alvo)).toEqual({ ok: false, motivo: "armazenamento" });
  });

  it("armazenamento indisponível na leitura ⇒ armazenamento, operação não roda", () => {
    const op = vi.fn();
    const storage = () => {
      throw new Error("x");
    };
    expect(alterarSacola(storage, op, AGORA, alvoFalso().alvo)).toEqual({ ok: false, motivo: "armazenamento" });
    expect(op).not.toHaveBeenCalled();
  });

  it("sacola vencida é tratada como vazia e sobrescrita na alteração", () => {
    const { s, storage } = comBruto(valido({ t: AGORA - VALIDADE_MS - 1 }));
    alterarSacola(storage, adicionar({ codigo: "0007", precoCentavos: null, aPartirDe: false }), AGORA, alvoFalso().alvo);
    expect(JSON.parse(s.dados.get(CHAVE)!).i).toEqual([{ c: "0007", q: 1, p: null, a: false }]);
  });

  it("sem alvo explícito, usa o window quando existe e não quebra quando não existe", () => {
    const { storage } = comBruto(null);
    expect(typeof globalThis.window).toBe("undefined");
    const r = alterarSacola(storage, adicionar({ codigo: "0042", precoCentavos: 600, aPartirDe: false }), AGORA);
    expect(r).toMatchObject({ ok: true, mudou: true });
  });
});

describe("assinarSacola", () => {
  function storageEvento(key: string | null): Event {
    return Object.assign(new Event("storage"), { key });
  }

  it("reage a storage com a chave da sacola ou key null, e a roseshop:sacola", () => {
    const alvo = new EventTarget() as unknown as Window;
    const aoMudar = vi.fn();
    assinarSacola(alvo, aoMudar);
    alvo.dispatchEvent(storageEvento(CHAVE));
    alvo.dispatchEvent(storageEvento(null));
    alvo.dispatchEvent(new Event(EVENTO_LOCAL));
    expect(aoMudar).toHaveBeenCalledTimes(3);
  });

  it("ignora storage de outra chave", () => {
    const alvo = new EventTarget() as unknown as Window;
    const aoMudar = vi.fn();
    assinarSacola(alvo, aoMudar);
    alvo.dispatchEvent(storageEvento("outra.coisa"));
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("nunca grava (FR-008a)", () => {
    const { s, setItem, removeItem } = comBruto(valido());
    const alvo = new EventTarget() as unknown as Window;
    assinarSacola(alvo, () => {
      // O assinante relê; o módulo não grava por conta própria.
      lerSacola(() => s, AGORA);
    });
    alvo.dispatchEvent(storageEvento(CHAVE));
    alvo.dispatchEvent(new Event(EVENTO_LOCAL));
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("devolve a função de cancelar", () => {
    const alvo = new EventTarget() as unknown as Window;
    const aoMudar = vi.fn();
    const cancelar = assinarSacola(alvo, aoMudar);
    cancelar();
    alvo.dispatchEvent(storageEvento(CHAVE));
    alvo.dispatchEvent(new Event(EVENTO_LOCAL));
    expect(aoMudar).not.toHaveBeenCalled();
  });
});
