import "server-only";

import {
  categoriasComProdutos,
  conferirProdutos,
  fotoPublica,
  listarBloco,
  listarDestaques,
  obterPublico,
  type CartaoDb,
  type CategoriaFiltroDb,
  type ProdutoPublicoDb,
} from "@/lib/db/catalogo";
import { dbDoContexto } from "@/lib/db/contexto";
import { formatarCodigo } from "@/lib/produtos/codigo";
import { arquivoDaChave, chaveDoArquivo } from "@/lib/r2";

import { configCatalogo } from "./config";
import { codificarCursor, lerCursor } from "./cursor";
import {
  altFoto,
  codigoCanonico,
  hrefProduto,
  linkWhatsapp,
  mensagemWhatsapp,
  mostrarWhatsapp,
  precoPublico,
} from "./exibicao";
import { marcarCausaBanco } from "./registro";
import { validarSlug } from "./slug";

// Visões públicas (data-model §1). Único lugar da 005 que chama `dbDoContexto`. Nenhuma visão
// carrega id de categoria, versão, fotos_versao, destaque_vaga nem campos de auditoria (FR-002).

export type FotoPublica = { url: string; alt: string };

export type ProdutoCartao = {
  codigo: string;
  href: string;
  nome: string;
  preco: string;
  esgotado: boolean;
  capa: FotoPublica | null;
};

// `sacola` alimenta só a ilha do detalhe (feature 006, DM§8): `null` se esgotado. O `codigo` dela é
// o canônico sem "#" ("0042"), diferente de `codigo` do cartão, que já vem formatado ("#0042").
export type DadosSacola = { codigo: string; precoCentavos: number | null; aPartirDe: boolean };

export type ProdutoPublico = ProdutoCartao & {
  categoria: string;
  descricao: string | null;
  fotos: FotoPublica[];
  whatsapp: { href: string } | null;
  sacola: DadosSacola | null;
};

export type CategoriaFiltro = { slug: string; nome: string };

export type BlocoLista = {
  itens: ProdutoCartao[];
  proximo: string | null;
  categoria: string | null;
};

export type Vitrine = {
  destaques: ProdutoCartao[];
  categorias: CategoriaFiltro[];
  bloco: BlocoLista;
};

// FR-024: falha de banco marca a causa para o worker e é relançada; nunca vira "não encontrado".
async function comBanco<T>(consulta: (db: Awaited<ReturnType<typeof dbDoContexto>>) => Promise<T>) {
  try {
    return await consulta(await dbDoContexto());
  } catch (erro) {
    await marcarCausaBanco();
    throw erro;
  }
}

function urlFoto(chave: string | null): string | null {
  const arquivo = chave === null ? null : arquivoDaChave(chave);
  return arquivo ? `/fotos/${arquivo}` : null;
}

function cartao(c: CartaoDb): ProdutoCartao {
  const url = urlFoto(c.capaChave);
  return {
    codigo: formatarCodigo(c.id),
    href: hrefProduto(c.id),
    nome: c.nome,
    preco: precoPublico(c.precoCentavos, c.aPartirDe),
    esgotado: c.esgotado,
    capa: url ? { url, alt: c.nome } : null,
  };
}

function publico(p: ProdutoPublicoDb): ProdutoPublico {
  const urls = p.fotos.map(urlFoto).filter((u): u is string => u !== null);
  const fotos = urls.map((url, i) => ({ url, alt: altFoto(p.nome, i + 1, urls.length) }));
  const { whatsapp, siteUrl } = configCatalogo();
  return {
    ...cartao({ ...p, capaChave: null }),
    capa: fotos[0] ?? null,
    categoria: p.categoria,
    descricao: p.descricao,
    fotos,
    whatsapp:
      whatsapp !== null && mostrarWhatsapp(p.esgotado, true)
        ? { href: linkWhatsapp(whatsapp, mensagemWhatsapp(p.nome, p.id, siteUrl)) }
        : null,
    sacola: p.esgotado
      ? null
      : { codigo: codigoCanonico(p.id), precoCentavos: p.precoCentavos, aPartirDe: p.aPartirDe },
  };
}

function filtros(categorias: CategoriaFiltroDb[]): CategoriaFiltro[] {
  return categorias.map(({ slug, nome }) => ({ slug, nome }));
}

// Slug desconhecido ou de categoria vazia ⇒ "Todas" (US4.6); o `id` fica aqui dentro.
function resolver(categorias: CategoriaFiltroDb[], slug: string | null | undefined) {
  const valido = validarSlug(slug);
  return valido === null ? undefined : categorias.find((c) => c.slug === valido);
}

async function bloco(
  db: Awaited<ReturnType<typeof dbDoContexto>>,
  categoria: CategoriaFiltroDb | undefined,
  depois?: { us: string; id: number },
): Promise<BlocoLista> {
  const r = await listarBloco(db, {
    ...(categoria ? { categoriaId: categoria.id } : {}),
    ...(depois ? { depois } : {}),
  });
  return {
    itens: r.itens.map(cartao),
    proximo: r.haMais && r.proximo ? codificarCursor(r.proximo.us, r.proximo.id) : null,
    categoria: categoria?.slug ?? null,
  };
}

// [FALLBACK] a página lê o slug da URL no servidor e passa aqui.
export async function lerVitrine(categoria?: string | null): Promise<Vitrine> {
  return comBanco(async (db) => {
    const [destaques, categorias] = await Promise.all([
      listarDestaques(db),
      categoriasComProdutos(db),
    ]);
    return {
      destaques: destaques.map(cartao),
      categorias: filtros(categorias),
      bloco: await bloco(db, resolver(categorias, categoria)),
    };
  });
}

export async function lerBloco(query: {
  categoria?: string | null;
  depois?: string | null;
}): Promise<BlocoLista | "invalido"> {
  const cursor = query.depois == null ? undefined : lerCursor(query.depois);
  if (cursor === null) return "invalido";
  return comBanco(async (db) => {
    const categorias = await categoriasComProdutos(db);
    return bloco(
      db,
      resolver(categorias, query.categoria),
      cursor ? { us: cursor.micros, id: cursor.id } : undefined,
    );
  });
}

const MAX_ID = 2_147_483_647;

export async function lerProduto(codigo: string): Promise<ProdutoPublico | "nao_encontrado"> {
  if (!/^\d{1,10}$/.test(codigo)) return "nao_encontrado";
  const id = Number(codigo);
  if (id < 1 || id > MAX_ID) return "nao_encontrado";
  const p = await comBanco((db) => obterPublico(db, id));
  return p ? publico(p) : "nao_encontrado";
}

// Conferência da sacola (feature 006, contracts/conferencia.md §2, research D8). A rota já validou
// os códigos (canônicos, sem "#"). Falha do banco vira `BancoIndisponivel` para a rota responder
// 503 só nesse caso; qualquer outra exceção segue como está.
export type ProdutoConferido = {
  nome: string;
  href: string;
  precoCentavos: number | null;
  aPartirDe: boolean;
  capa: FotoPublica | null;
};

export type ItemConferencia =
  | { codigo: string; estado: "ok"; produto: ProdutoConferido }
  | { codigo: string; estado: "esgotado"; produto: ProdutoConferido }
  | { codigo: string; estado: "inexistente" };

export class BancoIndisponivel extends Error {
  constructor(options?: { cause?: unknown }) {
    super("banco indisponível", options);
    this.name = "BancoIndisponivel";
  }
}

export async function lerConferencia(codigos: string[]): Promise<ItemConferencia[]> {
  let linhas: CartaoDb[];
  try {
    linhas = await comBanco((db) => conferirProdutos(db, codigos.map(Number)));
  } catch (erro) {
    throw new BancoIndisponivel({ cause: erro });
  }
  const porId = new Map(linhas.map((l) => [l.id, l]));
  return codigos.map((codigo): ItemConferencia => {
    const l = porId.get(Number(codigo));
    if (!l) return { codigo, estado: "inexistente" };
    const url = urlFoto(l.capaChave);
    const produto: ProdutoConferido = {
      nome: l.nome,
      href: hrefProduto(l.id),
      precoCentavos: l.precoCentavos,
      aPartirDe: l.aPartirDe,
      capa: url ? { url, alt: l.nome } : null,
    };
    return { codigo, estado: l.esgotado ? "esgotado" : "ok", produto };
  });
}

// Devolve a chave do objeto só para foto vinculada a produto (US6); o resto é 404 na rota.
export async function lerFoto(arquivo: string): Promise<string | null> {
  const chave = chaveDoArquivo(arquivo);
  if (chave === null) return null;
  return (await comBanco((db) => fotoPublica(db, chave))) ? chave : null;
}
