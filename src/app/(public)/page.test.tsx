// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { violacoesGraves } from "@/test/axe";

// Feature 005, T068 (US1.1, US1.3, US1.4, US1.6 a US1.8, US4.3, US4.4, FR-008), ramo FALLBACK.
// Mantém as regras da 001 (US5-1, US5-2, FR-018): a página pública não oferece entrar/login.

const lerVitrine = vi.hoisted(() => vi.fn());
const configCatalogo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogo", () => ({ lerVitrine, configCatalogo }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import Home, { dynamic, generateMetadata } from "./page";

afterEach(cleanup);

type Cartao = {
  codigo: string;
  href: string;
  nome: string;
  preco: string;
  esgotado: boolean;
  capa: { url: string; alt: string } | null;
};

const cartao = (n: number, prefixo = "Produto"): Cartao => {
  const cod = String(n).padStart(4, "0");
  return {
    codigo: `#${cod}`,
    href: `/p/${cod}`,
    nome: `${prefixo} ${n}`,
    preco: "R$ 10,00",
    esgotado: false,
    capa: { url: `/fotos/11111111-1111-4111-8111-1111111111${String(n).padStart(2, "0")}.webp`, alt: `${prefixo} ${n}` },
  };
};

type Vitrine = {
  destaques: Cartao[];
  categorias: { slug: string; nome: string }[];
  bloco: { itens: Cartao[]; proximo: string | null; categoria: string | null };
};

function vitrine(sobre: Partial<Vitrine> = {}): Vitrine {
  return {
    destaques: [],
    categorias: [],
    bloco: { itens: [], proximo: null, categoria: null },
    ...sobre,
  };
}

async function desenhar(v: Vitrine = vitrine(), searchParams: Record<string, string> = {}) {
  lerVitrine.mockResolvedValue(v);
  return render(await Home({ searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  lerVitrine.mockReset().mockResolvedValue(vitrine());
  configCatalogo.mockReset().mockReturnValue({ whatsapp: null, siteUrl: null });
});

// Cada nó de texto é testado separadamente: `textContent` junta textos de elementos
// vizinhos sem separador ("docsEntrar") e escondia a fronteira de palavra do `\b`.
const PROIBIDO = /\b(entrar|login)\b/i;
const nosComTextoProibido = (container: HTMLElement): string[] => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const achados: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const texto = n.nodeValue ?? "";
    if (PROIBIDO.test(texto)) achados.push(texto);
  }
  return achados;
};

const imgsDe = (el: Element | null) => [...(el?.querySelectorAll("img") ?? [])];
const loading = (el: Element | null) => imgsDe(el).map((i) => i.getAttribute("loading"));

describe("página inicial pública (US5-1, US5-2, FR-011, FR-018)", () => {
  it("não tem links para /painel nem /api/auth (US5-1, FR-018)", async () => {
    const { container } = await desenhar(vitrine({ bloco: { itens: [cartao(1)], proximo: null, categoria: null } }));
    expect(container.querySelectorAll('a[href^="/painel"], a[href^="/api/auth"]')).toHaveLength(0);
  });

  it("nenhum href absoluto aponta para /painel ou /api/auth", async () => {
    const { container } = await desenhar(vitrine({ bloco: { itens: [cartao(1)], proximo: null, categoria: null } }));
    for (const a of container.querySelectorAll("a[href]")) {
      const { pathname } = new URL(a.getAttribute("href") ?? "", "http://localhost");
      expect(pathname).not.toMatch(/^\/(painel|api\/auth)(\/|$)/);
    }
  });

  it("o texto visível não tem 'Entrar' nem 'Login' (US5-2, FR-018)", async () => {
    const { container } = await desenhar();
    expect(nosComTextoProibido(container)).toEqual([]);
  });
});

describe("página inicial: conteúdo (T068)", () => {
  it("h1 'Roseshop'", async () => {
    const { container } = await desenhar();
    expect(container.querySelector("h1")?.textContent).toBe("Roseshop");
  });

  it("US1.1: nenhuma ação de administração (form, button, href /painel)", async () => {
    const { container } = await desenhar(
      vitrine({
        destaques: [cartao(9, "Destaque")],
        categorias: [{ slug: "meias", nome: "Meias" }],
        bloco: { itens: [cartao(1)], proximo: null, categoria: null },
      }),
    );
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.innerHTML).not.toContain("/painel");
  });

  it("US1.6: sem produtos ⇒ 'Ainda não há produtos.' e nenhuma lista de produtos", async () => {
    const { container } = await desenhar();
    expect(container.textContent).toContain("Ainda não há produtos.");
    expect(container.querySelector("section[aria-labelledby='destaques']")).toBeNull();
    expect(container.querySelectorAll("li a[href^='/p/']")).toHaveLength(0);
  });

  it("com produtos: não mostra 'Ainda não há produtos.' e lista cada um com link", async () => {
    const itens = [cartao(1), cartao(2), cartao(3)];
    const { container } = await desenhar(vitrine({ bloco: { itens, proximo: null, categoria: null } }));
    expect(container.textContent).not.toContain("Ainda não há produtos.");
    expect([...container.querySelectorAll("li a[href^='/p/']")].map((a) => a.getAttribute("href"))).toEqual(
      itens.map((i) => i.href),
    );
  });

  it("US1.3: sem destaques a seção Destaques é omitida; com destaques aparece", async () => {
    const sem = await desenhar(vitrine({ bloco: { itens: [cartao(1)], proximo: null, categoria: null } }));
    expect(sem.container.querySelector("section[aria-labelledby='destaques']")).toBeNull();
    cleanup();
    const com = await desenhar(
      vitrine({ destaques: [cartao(9, "Destaque")], bloco: { itens: [cartao(1)], proximo: null, categoria: null } }),
    );
    expect(com.container.querySelector("section[aria-labelledby='destaques'] h2")?.textContent).toBe("Destaques");
  });

  it("FR-008: destaques todos eager; na lista, os 4 primeiros eager e o resto lazy", async () => {
    const destaques = [cartao(21, "Destaque"), cartao(22, "Destaque"), cartao(23, "Destaque")];
    const itens = Array.from({ length: 6 }, (_, i) => cartao(i + 1));
    const { container } = await desenhar(vitrine({ destaques, bloco: { itens, proximo: null, categoria: null } }));
    expect(loading(container.querySelector("section[aria-labelledby='destaques']"))).toEqual([
      "eager",
      "eager",
      "eager",
    ]);
    expect(loading(container.querySelector("section[aria-labelledby='produtos']"))).toEqual([
      "eager",
      "eager",
      "eager",
      "eager",
      "lazy",
      "lazy",
    ]);
  });

  it("US4.3: filtro com Todas e categorias; sem categorias a nav é omitida", async () => {
    const com = await desenhar(
      vitrine({
        categorias: [{ slug: "meias", nome: "Meias" }],
        bloco: { itens: [cartao(1)], proximo: null, categoria: null },
      }),
    );
    const nav = com.container.querySelector("nav[aria-label='Filtrar por categoria']");
    expect([...(nav?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toEqual([
      "/",
      "/?categoria=meias",
    ]);
    cleanup();
    const sem = await desenhar(vitrine({ bloco: { itens: [cartao(1)], proximo: null, categoria: null } }));
    expect(sem.container.querySelector("nav[aria-label='Filtrar por categoria']")).toBeNull();
  });

  it("US4.3: ?categoria=meias repassa o slug a lerVitrine e marca a categoria", async () => {
    const { container } = await desenhar(
      vitrine({
        categorias: [{ slug: "meias", nome: "Meias" }],
        bloco: { itens: [cartao(1)], proximo: null, categoria: "meias" },
      }),
      { categoria: "meias" },
    );
    expect(lerVitrine).toHaveBeenCalledWith("meias");
    const atual = container.querySelectorAll("nav a[aria-current='page']");
    expect([...atual].map((a) => a.textContent)).toEqual(["Meias"]);
    expect(container.querySelector("[aria-live='polite']")?.textContent).toBe(
      "Mostrando produtos de Meias",
    );
  });

  it("US4.4: slug inexistente (bloco.categoria null) ⇒ 'Todas' marcada", async () => {
    const { container } = await desenhar(
      vitrine({
        categorias: [{ slug: "meias", nome: "Meias" }],
        bloco: { itens: [cartao(1)], proximo: null, categoria: null },
      }),
      { categoria: "inexistente" },
    );
    expect(lerVitrine).toHaveBeenCalledWith("inexistente");
    const atual = container.querySelectorAll("nav a[aria-current='page']");
    expect([...atual].map((a) => a.textContent)).toEqual(["Todas"]);
    expect(container.querySelector("[aria-live='polite']")?.textContent).toBe(
      "Mostrando todos os produtos",
    );
  });

  it("sem ?categoria: lerVitrine recebe undefined ou null", async () => {
    await desenhar();
    expect([undefined, null]).toContainEqual(lerVitrine.mock.calls[0][0]);
  });

  it("falha de leitura propaga (vira error.tsx, nunca estado vazio)", async () => {
    lerVitrine.mockRejectedValue(new Error("banco fora"));
    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow("banco fora");
  });

  it("axe: sem violações graves (cheia e vazia)", async () => {
    const cheia = await desenhar(
      vitrine({
        destaques: [cartao(9, "Destaque")],
        categorias: [{ slug: "meias", nome: "Meias" }],
        bloco: { itens: [cartao(1), cartao(2)], proximo: null, categoria: null },
      }),
    );
    expect(await violacoesGraves(cheia.container)).toEqual([]);
    cleanup();
    const vazia = await desenhar();
    expect(await violacoesGraves(vazia.container)).toEqual([]);
  });
});

describe("configuração da página (T068)", () => {
  it('exporta dynamic = "force-dynamic"', () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("generateMetadata: metadataBase vem de configCatalogo().siteUrl", async () => {
    configCatalogo.mockReturnValue({ whatsapp: null, siteUrl: "https://loja.example" });
    const m = await generateMetadata();
    expect(String(m.metadataBase)).toBe("https://loja.example/");
  });

  it("generateMetadata: sem siteUrl, sem metadataBase", async () => {
    const m = await generateMetadata();
    expect(m.metadataBase).toBeUndefined();
  });
});
