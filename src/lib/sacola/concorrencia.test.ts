import { describe, expect, it } from "vitest";
import { CHAVE, alterarSacola, lerSacola } from "./armazenamento";
import { adicionar, aplicarConferencia, mudarQuantidade, type ItemConferencia, type Operacao } from "./sacola";

// Feature 006, SF4, T037 (FR-008a, research D4/D5, risco R1): duas abas sobre o mesmo aparelho,
// intercaladas. Cada alteração relê o que está gravado imediatamente antes, então a operação de
// uma aba não apaga a da outra. Sem navigator.locks: o que fica de fora é só a corrida dentro do
// mesmo instante, que o JavaScript de uma aba não intercala.

const AGORA = 1_760_600_000_000;

// Um único Storage compartilhado, como o localStorage das duas abas do mesmo site.
function aparelho() {
  const dados = new Map<string, string>();
  const s = {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (k: string) => dados.get(k) ?? null,
    key: (i: number) => [...dados.keys()][i] ?? null,
    removeItem: (k: string) => void dados.delete(k),
    setItem: (k: string, v: string) => void dados.set(k, v),
  } satisfies Storage;
  return { dados, storage: () => s as Storage };
}

const alvo = new EventTarget();

function aba(storage: () => Storage) {
  return {
    // O que a tela da aba mostra (lido em algum momento antes do toque).
    ler: () => {
      const l = lerSacola(storage, AGORA);
      if (!l.disponivel) throw new Error("indisponível");
      return l.sacola;
    },
    tocar: (op: Operacao, t = AGORA) => alterarSacola(storage, op, t, alvo),
  };
}

const codigos = (storage: () => Storage) => {
  const l = lerSacola(storage, AGORA);
  return l.disponivel ? l.sacola.itens.map((i) => i.codigo).sort() : null;
};

const item = (codigo: string) => ({ codigo, precoCentavos: 600, aPartirDe: false });

describe("concorrência entre abas (FR-008a)", () => {
  it("A lê, B lê, A adiciona X, B adiciona Y ⇒ X e Y presentes", () => {
    const { storage } = aparelho();
    const a = aba(storage);
    const b = aba(storage);
    a.ler();
    b.ler();
    expect(a.tocar(adicionar(item("0042")))).toMatchObject({ ok: true });
    expect(b.tocar(adicionar(item("0007")))).toMatchObject({ ok: true });
    expect(codigos(storage)).toEqual(["0007", "0042"]);
  });

  it("mesmo produto com quantidades diferentes ⇒ vale a última operação", () => {
    const { storage } = aparelho();
    const a = aba(storage);
    const b = aba(storage);
    a.tocar(adicionar(item("0042")));
    a.ler();
    b.ler();
    a.tocar(mudarQuantidade("0042", 3), AGORA + 1);
    b.tocar(mudarQuantidade("0042", 5), AGORA + 2);
    const l = lerSacola(storage, AGORA + 2);
    expect(l.disponivel && l.sacola.itens).toEqual([
      { codigo: "0042", quantidade: 5, precoVisto: 600, aPartirDe: false },
    ]);
  });

  it("sacola com 14: A e B adicionam códigos diferentes ⇒ a segunda é recusada sobre a relida", () => {
    const { dados, storage } = aparelho();
    const i = Array.from({ length: 14 }, (_, k) => ({ c: String(1000 + k), q: 1, p: 100, a: false }));
    dados.set(CHAVE, JSON.stringify({ v: 1, t: AGORA, i }));
    const a = aba(storage);
    const b = aba(storage);
    expect(a.ler().itens).toHaveLength(14);
    expect(b.ler().itens).toHaveLength(14);
    expect(a.tocar(adicionar(item("0042")))).toMatchObject({ ok: true, mudou: true });
    expect(b.tocar(adicionar(item("0007")))).toEqual({ ok: false, motivo: "limite_produtos" });
    const l = lerSacola(storage, AGORA);
    expect(l.disponivel && l.sacola.itens).toHaveLength(15);
    expect(codigos(storage)).toContain("0042");
    expect(codigos(storage)).not.toContain("0007");
  });

  it("aplicarConferencia de A cobrindo só X não apaga Y que B adicionou no meio", () => {
    const { storage } = aparelho();
    const a = aba(storage);
    const b = aba(storage);
    a.tocar(adicionar(item("0042")));
    // A pede a conferência de X; enquanto espera, B adiciona Y.
    a.ler();
    b.tocar(adicionar(item("0007")));
    const conferencia: ItemConferencia[] = [
      {
        codigo: "0042",
        estado: "ok",
        produto: { nome: "Meia", href: "/p/0042", precoCentavos: 700, aPartirDe: false, capa: null },
      },
    ];
    expect(a.tocar(aplicarConferencia(conferencia))).toMatchObject({ ok: true, mudou: true });
    const l = lerSacola(storage, AGORA);
    expect(l.disponivel && l.sacola.itens).toEqual([
      { codigo: "0042", quantidade: 1, precoVisto: 700, aPartirDe: false },
      { codigo: "0007", quantidade: 1, precoVisto: 600, aPartirDe: false },
    ]);
  });

  it("aplicarConferencia com inexistente de A não apaga Y de B", () => {
    const { storage } = aparelho();
    const a = aba(storage);
    const b = aba(storage);
    a.tocar(adicionar(item("0042")));
    b.tocar(adicionar(item("0007")));
    a.tocar(aplicarConferencia([{ codigo: "0042", estado: "inexistente" }]));
    expect(codigos(storage)).toEqual(["0007"]);
  });
});
