// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ProdutoCartao } from "@/lib/catalogo";
import { violacoesGraves } from "@/test/axe";

import { Destaques } from "./destaques";

// Feature 005, T067 (US1.3, FR-005, FR-008): seção de destaques.

afterEach(cleanup);

function itens(n: number): ProdutoCartao[] {
  return Array.from({ length: n }, (_, i) => {
    const cod = String(i + 1).padStart(4, "0");
    return {
      codigo: `#${cod}`,
      href: `/p/${cod}`,
      nome: `Destaque ${i + 1}`,
      preco: "R$ 10,00",
      esgotado: false,
      capa: { url: `/fotos/11111111-1111-4111-8111-11111111111${i}.webp`, alt: `Destaque ${i + 1}` },
    };
  });
}

describe("Destaques (T067)", () => {
  it("sem itens: não renderiza nada", () => {
    const { container } = render(<Destaques itens={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("section aria-labelledby=destaques com h2 'Destaques'", () => {
    const { container } = render(<Destaques itens={itens(3)} />);
    const s = container.querySelector("section");
    expect(s?.getAttribute("aria-labelledby")).toBe("destaques");
    const h2 = container.querySelector("h2");
    expect(h2?.id).toBe("destaques");
    expect(h2?.textContent).toBe("Destaques");
  });

  it("um item de lista por destaque, com link para o detalhe (até 8)", () => {
    const { container } = render(<Destaques itens={itens(8)} />);
    const lis = container.querySelectorAll("ul > li");
    expect(lis).toHaveLength(8);
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(
      itens(8).map((i) => i.href),
    );
  });

  it("FR-008: todas as fotos dos destaques são eager", () => {
    const { container } = render(<Destaques itens={itens(8)} />);
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs).toHaveLength(8);
    expect(imgs.map((i) => i.getAttribute("loading"))).toEqual(Array(8).fill("eager"));
  });

  it("axe: sem violações graves", async () => {
    const { container } = render(<Destaques itens={itens(3)} />);
    expect(await violacoesGraves(container)).toEqual([]);
  });
});
