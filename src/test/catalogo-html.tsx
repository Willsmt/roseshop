// Feature 006, T001: gera o HTML do servidor da 005 com dados fixos, sem rede e sem banco.
// Os vi.mock abaixo são içados (hoisting) dentro deste módulo, que deve ser importado antes
// das páginas; por isso as páginas entram por import dinâmico em gerarHtml005.
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";

const lerProduto = vi.hoisted(() => vi.fn());
const lerVitrine = vi.hoisted(() => vi.fn());
const configCatalogo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogo", () => ({ lerProduto, lerVitrine, configCatalogo }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

export type Caso005 = "detalhe" | "detalhe-esgotado" | "inicio";

export const CASOS_005: readonly Caso005[] = ["detalhe", "detalhe-esgotado", "inicio"];

export const ARQUIVO_005: Record<Caso005, string> = {
  detalhe: "src/test/fixtures/catalogo/detalhe-005.html",
  "detalhe-esgotado": "src/test/fixtures/catalogo/detalhe-esgotado-005.html",
  inicio: "src/test/fixtures/catalogo/inicio-005.html",
};

const fotos = [
  { url: "/fotos/11111111-1111-4111-8111-111111111111.webp", alt: "Meia Rosa — foto 1 de 2" },
  { url: "/fotos/11111111-1111-4111-8111-111111111112.webp", alt: "Meia Rosa — foto 2 de 2" },
];

const detalhe = (esgotado: boolean) => ({
  codigo: "#0042",
  href: "/p/0042",
  nome: "Meia Rosa",
  preco: "R$ 6,00",
  esgotado,
  capa: fotos[0],
  categoria: "Meias",
  descricao: "Meia de algodão.\nCor rosa.",
  fotos,
  whatsapp: esgotado ? null : { href: "https://wa.me/5511999999999?text=Ol%C3%A1" },
});

const cartao = (n: number, esgotado = false) => {
  const cod = String(n).padStart(4, "0");
  return {
    codigo: `#${cod}`,
    href: `/p/${cod}`,
    nome: `Produto ${n}`,
    preco: "R$ 6,00",
    esgotado,
    capa: { url: `/fotos/11111111-1111-4111-8111-1111111111${String(n).padStart(2, "0")}.webp`, alt: `Produto ${n}` },
  };
};

const vitrine = () => ({
  destaques: [cartao(9), cartao(8)],
  categorias: [
    { slug: "meias", nome: "Meias" },
    { slug: "toucas", nome: "Toucas" },
  ],
  bloco: { itens: [cartao(1), cartao(2, true), cartao(3), cartao(4), cartao(5)], proximo: null, categoria: null },
});

export async function gerarHtml005(caso: Caso005): Promise<string> {
  configCatalogo.mockReset().mockReturnValue({ whatsapp: "+5511999999999", siteUrl: null });
  const { default: Layout } = await import("@/app/(public)/layout");
  if (caso === "inicio") {
    lerVitrine.mockReset().mockResolvedValue(vitrine());
    const { default: Home } = await import("@/app/(public)/page");
    const pagina = await Home({ searchParams: Promise.resolve({}) });
    return renderToStaticMarkup(<Layout>{pagina}</Layout>);
  }
  lerProduto.mockReset().mockResolvedValue(detalhe(caso === "detalhe-esgotado"));
  const { default: Detalhe } = await import("@/app/(public)/p/[codigo]/page");
  const pagina = await Detalhe({ params: Promise.resolve({ codigo: "0042" }) });
  return renderToStaticMarkup(<Layout>{pagina}</Layout>);
}
