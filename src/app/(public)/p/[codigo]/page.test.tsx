// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { violacoesGraves } from "@/test/axe";

// Feature 005, T060 (US2, US3, US5, FR-003): detalhe do produto, ramo FALLBACK.

const lerProduto = vi.hoisted(() => vi.fn());
const configCatalogo = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const permanentRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);

vi.mock("@/lib/catalogo", () => ({ lerProduto, configCatalogo }));
vi.mock("next/navigation", () => ({
  notFound,
  permanentRedirect,
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

import Page, { generateMetadata } from "./page";

afterEach(cleanup);

type Produto = {
  codigo: string;
  href: string;
  nome: string;
  preco: string;
  esgotado: boolean;
  capa: { url: string; alt: string } | null;
  categoria: string;
  descricao: string | null;
  fotos: { url: string; alt: string }[];
  whatsapp: { href: string } | null;
};

const foto = (n: number, nome = "Meia Rosa") => ({
  url: `/fotos/11111111-1111-4111-8111-11111111111${n}.webp`,
  alt: `${nome} — foto ${n} de 3`,
});

function produto(sobre: Partial<Produto> = {}): Produto {
  const fotos = [foto(1), foto(2), foto(3)];
  return {
    codigo: "#0042",
    href: "/p/0042",
    nome: "Meia Rosa",
    preco: "R$ 12,90",
    esgotado: false,
    capa: fotos[0],
    categoria: "Meias",
    descricao: "Linha 1\nLinha 2",
    fotos,
    whatsapp: { href: "https://wa.me/5511999999999?text=Ol%C3%A1" },
    ...sobre,
  };
}

const params = (codigo = "0042") => Promise.resolve({ codigo });

async function desenhar(p: Produto) {
  lerProduto.mockResolvedValue(p);
  return render(await Page({ params: params() }));
}

beforeEach(() => {
  lerProduto.mockReset();
  configCatalogo.mockReset().mockReturnValue({ whatsapp: "+5511999999999", siteUrl: null });
  notFound.mockClear();
  permanentRedirect.mockClear();
});

describe("detalhe do produto (T060)", () => {
  it("produto com 3 fotos: h1, código e categoria, preço, imagens em ordem com alt (US2)", async () => {
    const { container } = await desenhar(produto());
    expect(container.querySelector("h1")?.textContent).toBe("Meia Rosa");
    expect(container.textContent).toContain("#0042 · Meias");
    expect(container.textContent).toContain("R$ 12,90");
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("alt"))).toEqual([
      "Meia Rosa — foto 1 de 3",
      "Meia Rosa — foto 2 de 3",
      "Meia Rosa — foto 3 de 3",
    ]);
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(produto().fotos.map((f) => f.url));
  });

  it("a descrição aparece em whitespace-pre-line, com a seção Descrição", async () => {
    const { container } = await desenhar(produto());
    expect(container.querySelector("h2")?.textContent).toBe("Descrição");
    const p = container.querySelector("p.whitespace-pre-line");
    expect(p?.textContent).toBe("Linha 1\nLinha 2");
  });

  it("FR-003: nome com HTML e markdown aparece literal", async () => {
    const nome = "<b>x</b> e **x**";
    const { container } = await desenhar(produto({ nome }));
    expect(container.querySelector("h1")?.textContent).toBe(nome);
    expect(container.querySelector("h1 b")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("FR-003: descrição com HTML aparece literal, sem elemento", async () => {
    const { container } = await desenhar(produto({ descricao: "<i>y</i> **y**" }));
    expect(container.querySelector("p.whitespace-pre-line")?.textContent).toBe("<i>y</i> **y**");
    expect(container.querySelector("i")).toBeNull();
  });

  it.each([null, ""])("descrição %j: sem seção Descrição", async (descricao) => {
    const { container } = await desenhar(produto({ descricao }));
    expect(container.textContent).not.toContain("Descrição");
    expect(container.querySelector("h2")).toBeNull();
  });

  it("disponível com número: link do WhatsApp sem target=_blank (US3)", async () => {
    const { container } = await desenhar(produto());
    const a = container.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]');
    expect(a).not.toBeNull();
    expect(a?.textContent).toBe("Perguntar no WhatsApp");
    expect(a?.getAttribute("target")).not.toBe("_blank");
    expect(a?.hasAttribute("target")).toBe(false);
  });

  it("esgotado: texto Esgotado e sem link do WhatsApp (US3)", async () => {
    const { container } = await desenhar(produto({ esgotado: true, whatsapp: null }));
    expect(container.querySelector("strong")?.textContent).toBe("Esgotado");
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull();
  });

  it("disponível não mostra Esgotado", async () => {
    const { container } = await desenhar(produto());
    expect(container.textContent).not.toContain("Esgotado");
  });

  it("whatsapp null: sem link do WhatsApp", async () => {
    const { container } = await desenhar(produto({ whatsapp: null }));
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull();
    expect(container.textContent).not.toContain("Perguntar no WhatsApp");
  });

  it("tem o link Voltar ao catálogo para /", async () => {
    const { container } = await desenhar(produto());
    const a = [...container.querySelectorAll("a")].find((x) => x.textContent === "Voltar ao catálogo");
    expect(a?.getAttribute("href")).toBe("/");
  });

  it("axe: sem violações graves", async () => {
    const { container } = await desenhar(produto());
    expect(await violacoesGraves(container)).toEqual([]);
  });

  it("axe: esgotado e sem descrição, sem violações graves", async () => {
    const { container } = await desenhar(produto({ esgotado: true, whatsapp: null, descricao: null }));
    expect(await violacoesGraves(container)).toEqual([]);
  });
});

describe("roteamento da página (T060, T064)", () => {
  it("nao_encontrado chama notFound()", async () => {
    lerProduto.mockResolvedValue("nao_encontrado");
    await expect(Page({ params: params("9999") })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("código não canônico redireciona permanentemente para o canônico", async () => {
    lerProduto.mockResolvedValue(produto());
    await expect(Page({ params: params("42") })).rejects.toThrow("NEXT_REDIRECT:/p/0042");
    expect(permanentRedirect).toHaveBeenCalledWith("/p/0042");
  });

  it("falha de leitura propaga e nunca vira notFound()", async () => {
    lerProduto.mockRejectedValue(new Error("banco fora"));
    await expect(Page({ params: params() })).rejects.toThrow("banco fora");
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("generateMetadata (T060)", () => {
  it("title = nome e openGraph.images = URL da capa, sem preço nem descrição", async () => {
    lerProduto.mockResolvedValue(produto());
    configCatalogo.mockReturnValue({ whatsapp: null, siteUrl: "https://loja.example" });
    const m = await generateMetadata({ params: params() });
    expect(m.title).toBe("Meia Rosa");
    const imagens = m.openGraph?.images;
    const urls = (Array.isArray(imagens) ? imagens : [imagens]).map((i) =>
      typeof i === "string" || i instanceof URL ? String(i) : (i as { url: string | URL }).url,
    );
    expect(urls.map(String)).toEqual([produto().capa!.url]);
    const texto = JSON.stringify(m);
    expect(texto).not.toContain("12,90");
    expect(texto).not.toContain("Linha 1");
    expect(m.description).toBeUndefined();
    expect(m.openGraph?.description).toBeUndefined();
  });

  it("sem SITE_URL a prévia sai sem imagem (URL relativa não serve sem metadataBase)", async () => {
    lerProduto.mockResolvedValue(produto());
    const m = await generateMetadata({ params: params() });
    expect(m.title).toBe("Meia Rosa");
    expect(m.openGraph?.images).toBeUndefined();
    expect(m.metadataBase).toBeUndefined();
  });

  it("não encontrado: só o title, sem openGraph", async () => {
    lerProduto.mockResolvedValue("nao_encontrado");
    const m = await generateMetadata({ params: params() });
    expect(m.title).toBe("Produto não encontrado");
    expect(m.openGraph).toBeUndefined();
  });

  it("falha de leitura propaga no generateMetadata", async () => {
    lerProduto.mockRejectedValue(new Error("banco fora"));
    await expect(generateMetadata({ params: params() })).rejects.toThrow("banco fora");
  });
});
