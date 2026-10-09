import { describe, expect, it } from "vitest";
import type { FotoLinha } from "@/lib/db/fotos";
import { aplicarAcao, MAXIMO_FOTOS, type AcaoConjunto, type NovaFoto, type ResultadoRegra } from "./conjunto";

// Feature 004, T072: regra pura do conjunto de fotos (contracts/fotos.md §3, FR-003, FR-025, US4-AC4).

const EM = new Date("2026-01-01T00:00:00Z");

/** Foto de teste: a chave é o próprio nome, para a tabela ficar legível. */
function foto(chave: string, posicao: number): FotoLinha {
  return { posicao, chave, enviadoPor: `admin-${chave}@exemplo.com`, enviadoEm: new Date(EM.getTime() + posicao * 1000) };
}

function nova(chave: string): NovaFoto {
  return { chave, enviadoPor: `admin-${chave}@exemplo.com`, enviadoEm: new Date(EM.getTime() + 999_000) };
}

/** Conjunto a partir das chaves, posições 1..n. */
function conjunto(...chaves: string[]): FotoLinha[] {
  return chaves.map((c, i) => foto(c, i + 1));
}

function chaves(r: ResultadoRegra): string[] {
  if (!r.ok) throw new Error(`esperava ok, veio ${r.motivo}`);
  return r.novas.map((f) => f.chave);
}

type CasoOk = { nome: string; atuais: string[]; acao: AcaoConjunto; esperado: string[]; saiu?: string };
type CasoFalha = { nome: string; atuais: string[]; acao: AcaoConjunto; motivo: "limite" | "ultima" | "falha_geral" };

const casosOk: CasoOk[] = [
  // adicionar
  { nome: "adicionar com 0 fotos (produto antigo da 003) ⇒ posição 1", atuais: [], acao: { tipo: "adicionar", nova: nova("x") }, esperado: ["x"] },
  { nome: "adicionar com 1 foto", atuais: ["a"], acao: { tipo: "adicionar", nova: nova("x") }, esperado: ["a", "x"] },
  { nome: "adicionar com 2 fotos", atuais: ["a", "b"], acao: { tipo: "adicionar", nova: nova("x") }, esperado: ["a", "b", "x"] },
  // trocar
  { nome: "trocar posição 1 de 3", atuais: ["a", "b", "c"], acao: { tipo: "trocar", posicao: 1, nova: nova("x") }, esperado: ["x", "b", "c"], saiu: "a" },
  { nome: "trocar posição 2 de 3", atuais: ["a", "b", "c"], acao: { tipo: "trocar", posicao: 2, nova: nova("x") }, esperado: ["a", "x", "c"], saiu: "b" },
  { nome: "trocar posição 3 de 3", atuais: ["a", "b", "c"], acao: { tipo: "trocar", posicao: 3, nova: nova("x") }, esperado: ["a", "b", "x"], saiu: "c" },
  { nome: "trocar a única foto", atuais: ["a"], acao: { tipo: "trocar", posicao: 1, nova: nova("x") }, esperado: ["x"], saiu: "a" },
  // remover
  { nome: "remover posição 1 de 3 (as demais sobem)", atuais: ["a", "b", "c"], acao: { tipo: "remover", posicao: 1 }, esperado: ["b", "c"], saiu: "a" },
  { nome: "remover posição 2 de 3", atuais: ["a", "b", "c"], acao: { tipo: "remover", posicao: 2 }, esperado: ["a", "c"], saiu: "b" },
  { nome: "remover posição 3 de 3", atuais: ["a", "b", "c"], acao: { tipo: "remover", posicao: 3 }, esperado: ["a", "b"], saiu: "c" },
  { nome: "remover posição 1 de 2", atuais: ["a", "b"], acao: { tipo: "remover", posicao: 1 }, esperado: ["b"], saiu: "a" },
  // mover
  { nome: "mover de 1 para 3", atuais: ["a", "b", "c"], acao: { tipo: "mover", de: 1, para: 3 }, esperado: ["b", "c", "a"] },
  { nome: "mover de 3 para 1", atuais: ["a", "b", "c"], acao: { tipo: "mover", de: 3, para: 1 }, esperado: ["c", "a", "b"] },
  { nome: "mover de 2 para 3", atuais: ["a", "b", "c"], acao: { tipo: "mover", de: 2, para: 3 }, esperado: ["a", "c", "b"] },
  { nome: "mover de 2 para 1 (duas fotos)", atuais: ["a", "b"], acao: { tipo: "mover", de: 2, para: 1 }, esperado: ["b", "a"] },
];

const casosFalha: CasoFalha[] = [
  // adicionar
  { nome: "adicionar com 3 fotos ⇒ limite", atuais: ["a", "b", "c"], acao: { tipo: "adicionar", nova: nova("x") }, motivo: "limite" },
  { nome: "adicionar com mais de 3 fotos ⇒ limite", atuais: ["a", "b", "c", "d"], acao: { tipo: "adicionar", nova: nova("x") }, motivo: "limite" },
  { nome: "adicionar chave já presente ⇒ falha_geral", atuais: ["a", "b"], acao: { tipo: "adicionar", nova: nova("b") }, motivo: "falha_geral" },
  // trocar
  { nome: "trocar posição 0 ⇒ falha_geral", atuais: ["a", "b", "c"], acao: { tipo: "trocar", posicao: 0, nova: nova("x") }, motivo: "falha_geral" },
  { nome: "trocar posição 4 ⇒ falha_geral", atuais: ["a", "b", "c"], acao: { tipo: "trocar", posicao: 4, nova: nova("x") }, motivo: "falha_geral" },
  { nome: "trocar posição acima do tamanho (2 de 1) ⇒ falha_geral", atuais: ["a"], acao: { tipo: "trocar", posicao: 2, nova: nova("x") }, motivo: "falha_geral" },
  { nome: "trocar com 0 fotos ⇒ falha_geral", atuais: [], acao: { tipo: "trocar", posicao: 1, nova: nova("x") }, motivo: "falha_geral" },
  { nome: "trocar por chave já presente ⇒ falha_geral", atuais: ["a", "b", "c"], acao: { tipo: "trocar", posicao: 1, nova: nova("c") }, motivo: "falha_geral" },
  // remover
  { nome: "remover posição 0 ⇒ falha_geral", atuais: ["a", "b"], acao: { tipo: "remover", posicao: 0 }, motivo: "falha_geral" },
  { nome: "remover posição inexistente ⇒ falha_geral", atuais: ["a", "b"], acao: { tipo: "remover", posicao: 3 }, motivo: "falha_geral" },
  { nome: "remover com 0 fotos ⇒ falha_geral (checada antes de ultima)", atuais: [], acao: { tipo: "remover", posicao: 1 }, motivo: "falha_geral" },
  { nome: "remover posição inexistente com 1 foto ⇒ falha_geral (antes de ultima)", atuais: ["a"], acao: { tipo: "remover", posicao: 2 }, motivo: "falha_geral" },
  { nome: "remover a última foto ⇒ ultima (US4-AC4)", atuais: ["a"], acao: { tipo: "remover", posicao: 1 }, motivo: "ultima" },
  // mover
  { nome: "mover de = para ⇒ falha_geral", atuais: ["a", "b", "c"], acao: { tipo: "mover", de: 2, para: 2 }, motivo: "falha_geral" },
  { nome: "mover de inexistente ⇒ falha_geral", atuais: ["a", "b"], acao: { tipo: "mover", de: 3, para: 1 }, motivo: "falha_geral" },
  { nome: "mover para inexistente ⇒ falha_geral", atuais: ["a", "b"], acao: { tipo: "mover", de: 1, para: 3 }, motivo: "falha_geral" },
  { nome: "mover de 0 ⇒ falha_geral", atuais: ["a", "b"], acao: { tipo: "mover", de: 0, para: 1 }, motivo: "falha_geral" },
  { nome: "mover com 0 fotos ⇒ falha_geral", atuais: [], acao: { tipo: "mover", de: 1, para: 2 }, motivo: "falha_geral" },
];

describe("MAXIMO_FOTOS", () => {
  it("é 3 (FR-003)", () => {
    expect(MAXIMO_FOTOS).toBe(3);
  });
});

describe("aplicarAcao: resultados ok", () => {
  it.each(casosOk)("$nome", ({ atuais, acao, esperado, saiu }) => {
    const r = aplicarAcao(conjunto(...atuais), acao);
    expect(r.ok).toBe(true);
    expect(chaves(r)).toEqual(esperado);
    if (r.ok) {
      if (saiu === undefined) expect(r.saiu).toBeUndefined();
      else expect(r.saiu).toBe(saiu);
    }
  });
});

describe("aplicarAcao: falhas", () => {
  it.each(casosFalha)("$nome", ({ atuais, acao, motivo }) => {
    const r = aplicarAcao(conjunto(...atuais), acao);
    expect(r).toEqual({ ok: false, motivo });
  });
});

describe("aplicarAcao: invariantes de todo resultado ok", () => {
  describe.each(casosOk)("$nome", ({ atuais, acao }) => {
    const entrada = Object.freeze(conjunto(...atuais).map((f) => Object.freeze(f))) as FotoLinha[];
    const copia = structuredClone(entrada);
    const r = aplicarAcao(entrada, acao);

    it("entre 1 e 3 fotos", () => {
      if (!r.ok) throw new Error("esperava ok");
      expect(r.novas.length).toBeGreaterThanOrEqual(1);
      expect(r.novas.length).toBeLessThanOrEqual(MAXIMO_FOTOS);
    });

    it("posições contíguas 1..n", () => {
      if (!r.ok) throw new Error("esperava ok");
      expect(r.novas.map((f) => f.posicao)).toEqual(r.novas.map((_, i) => i + 1));
    });

    it("chaves distintas", () => {
      expect(new Set(chaves(r)).size).toBe(chaves(r).length);
    });

    it("preserva chave, enviadoPor e enviadoEm (só a posição muda)", () => {
      if (!r.ok) throw new Error("esperava ok");
      const porChave = new Map(copia.map((f) => [f.chave, f]));
      for (const f of r.novas) {
        const antiga = porChave.get(f.chave);
        if (!antiga) {
          // foto nova: só pode vir da própria ação
          expect(acao.tipo === "adicionar" || acao.tipo === "trocar").toBe(true);
          const n = (acao as { nova: NovaFoto }).nova;
          expect(f).toEqual({ ...n, posicao: f.posicao });
        } else {
          expect(f).toEqual({ ...antiga, posicao: f.posicao });
        }
      }
    });

    it("não muta atuais", () => {
      expect(entrada).toEqual(copia);
    });
  });
});
