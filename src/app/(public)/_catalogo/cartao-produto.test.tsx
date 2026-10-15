// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ProdutoCartao } from "@/lib/catalogo";
import { violacoesGraves } from "@/test/axe";

import { CartaoProduto } from "./cartao-produto";

// Feature 005, T067 (US1.1, US1.3, US1.4, FR-008): cartão do produto.

afterEach(cleanup);

function produto(sobre: Partial<ProdutoCartao> = {}): ProdutoCartao {
  return {
    codigo: "#0042",
    href: "/p/0042",
    nome: "Meia Rosa",
    preco: "R$ 12,90",
    esgotado: false,
    capa: { url: "/fotos/11111111-1111-4111-8111-111111111111.webp", alt: "Meia Rosa" },
    ...sobre,
  };
}

const desenhar = (p: ProdutoCartao, eager = false) =>
  render(
    <ul>
      <li>
        <CartaoProduto produto={p} eager={eager} />
      </li>
    </ul>,
  );

describe("CartaoProduto (T067)", () => {
  it("um único link para /p/<código> envolve foto, nome, código e preço", () => {
    const { container } = desenhar(produto());
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    const a = links[0];
    expect(a.getAttribute("href")).toBe("/p/0042");
    expect(a.querySelector("img")?.getAttribute("src")).toBe(produto().capa!.url);
    expect(a.querySelector("img")?.getAttribute("alt")).toBe("Meia Rosa");
    expect(a.textContent).toContain("Meia Rosa");
    expect(a.textContent).toContain("#0042");
    expect(a.textContent).toContain("R$ 12,90");
  });

  it("sem capa: marcador 'Sem foto' em texto e nenhuma imagem", () => {
    const { container } = desenhar(produto({ capa: null }));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")?.textContent).toContain("Sem foto");
  });

  it("com capa: não mostra 'Sem foto'", () => {
    const { container } = desenhar(produto());
    expect(container.textContent).not.toContain("Sem foto");
  });

  it("esgotado: 'Esgotado' em texto; disponível: sem o texto", () => {
    const esgotado = desenhar(produto({ esgotado: true }));
    expect(esgotado.container.textContent).toContain("Esgotado");
    cleanup();
    const disponivel = desenhar(produto());
    expect(disponivel.container.textContent).not.toContain("Esgotado");
  });

  it("FR-008: eager ⇒ loading=eager; senão lazy", () => {
    expect(desenhar(produto(), true).container.querySelector("img")?.getAttribute("loading")).toBe("eager");
    cleanup();
    expect(desenhar(produto(), false).container.querySelector("img")?.getAttribute("loading")).toBe("lazy");
  });

  it("FR-003: nome com HTML aparece literal", () => {
    const nome = "<b>x</b> e **x**";
    const { container } = desenhar(produto({ nome }));
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain(nome);
  });

  it("axe: sem violações graves (com foto, sem foto, esgotado)", async () => {
    for (const p of [produto(), produto({ capa: null }), produto({ esgotado: true })]) {
      const { container } = desenhar(p);
      expect(await violacoesGraves(container)).toEqual([]);
      cleanup();
    }
  });
});
