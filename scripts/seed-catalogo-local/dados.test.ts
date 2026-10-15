import { describe, expect, it } from "vitest";

import { CATEGORIAS, NOME_ESPECIAL, planejarProdutos } from "./dados";
import { gerarJpegGradiente } from "./jpeg";

const produtos = planejarProdutos();

describe("planejarProdutos", () => {
  it("gera o bastante para dois blocos de 24", () => {
    expect(produtos).toHaveLength(41);
    expect(produtos.length).toBeGreaterThan(30);
  });

  it("respeita os CHECKs de nome do banco e a unicidade da chave", () => {
    const chaves = new Set<string>();
    for (const p of produtos) {
      expect([...p.nome].length).toBeGreaterThanOrEqual(3);
      expect([...p.nome].length).toBeLessThanOrEqual(80);
      expect(p.nome).toBe(p.nome.trim());
      expect(p.nome).not.toMatch(/\s{2,}/);
      const chave = p.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/-/g, " ");
      expect(chaves.has(chave)).toBe(false);
      chaves.add(chave);
    }
  });

  it("usa datas distintas", () => {
    expect(new Set(produtos.map((p) => p.diasAtras)).size).toBe(produtos.length);
  });

  it("tem destaques em vagas únicas de 1 a 8, nunca em produto esgotado", () => {
    const vagas = produtos.flatMap((p) => (p.destaqueVaga === null ? [] : [p.destaqueVaga]));
    expect(vagas.length).toBeGreaterThanOrEqual(3);
    expect(new Set(vagas).size).toBe(vagas.length);
    for (const v of vagas) expect(v >= 1 && v <= 8).toBe(true);
    expect(produtos.some((p) => p.esgotado && p.destaqueVaga !== null)).toBe(false);
  });

  it("tem esgotados comuns, uma categoria só com esgotados e outra vazia", () => {
    expect(produtos.filter((p) => p.esgotado && p.categoria !== CATEGORIAS.soEsgotados).length).toBeGreaterThan(0);
    const dela = produtos.filter((p) => p.categoria === CATEGORIAS.soEsgotados);
    expect(dela.length).toBeGreaterThan(0);
    expect(dela.every((p) => p.esgotado)).toBe(true);
    expect(produtos.some((p) => p.categoria === CATEGORIAS.vazia)).toBe(false);
  });

  it("inclui o nome com &, #, ?, acento e emoji", () => {
    const especial = produtos.find((p) => p.nome === NOME_ESPECIAL);
    expect(especial).toBeDefined();
    expect(NOME_ESPECIAL).toMatch(/&.*#.*\?/);
  });

  it("respeita as regras de preço", () => {
    for (const p of produtos) {
      if (p.precoCentavos !== null) expect(p.precoCentavos >= 1 && p.precoCentavos <= 9_999_999).toBe(true);
      if (p.aPartirDe) expect(p.precoCentavos).not.toBeNull();
    }
  });
});

describe("gerarJpegGradiente", () => {
  it("gera um JPEG baseline 400x400 delimitado por SOI e EOI", () => {
    const b = gerarJpegGradiente([240, 120, 160], [90, 40, 120]);
    expect([b[0], b[1]]).toEqual([0xff, 0xd8]);
    expect([b[b.length - 2], b[b.length - 1]]).toEqual([0xff, 0xd9]);
    const sof = b.findIndex((_, i) => b[i] === 0xff && b[i + 1] === 0xc0);
    expect(sof).toBeGreaterThan(0);
    expect((b[sof + 5] << 8) | b[sof + 6]).toBe(400);
    expect((b[sof + 7] << 8) | b[sof + 8]).toBe(400);
    expect(b.length).toBeLessThan(1_048_576);
  });

  it("recusa lado que não é múltiplo de 8", () => {
    expect(() => gerarJpegGradiente([0, 0, 0], [255, 255, 255], 401)).toThrow();
  });
});
