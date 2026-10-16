import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { listar as listarCategoriasDoPainel } from "@/lib/db/categorias";
import { createDb } from "@/lib/db/client";
import {
  limparCatalogo,
  montarCatalogo,
  type CatalogoFixture,
} from "@/test/db/catalogo-fixtures";

import {
  categoriasComProdutos,
  conferirProdutos,
  fotoPublica,
  listarBloco,
  listarDestaques,
  obterPublico,
} from "./catalogo";

// Feature 005, SF1 (T021): SQL público do catálogo. Integração com o banco local; em série.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

let fx: CatalogoFixture;

beforeAll(async () => {
  fx = await montarCatalogo(db);
});

afterAll(async () => {
  await limparCatalogo(db);
});

const ids = (itens: { id: number }[]) => itens.map((i) => i.id);

const PROIBIDOS = [
  "versao", "fotos_versao", "fotosVersao", "fotos_operacao", "fotosOperacao", "destaque_vaga",
  "destaqueVaga", "criado_por", "criadoPor", "atualizado_por", "atualizadoPor", "atualizado_em",
  "atualizadoEm", "enviado_por", "enviadoPor", "enviado_em", "enviadoEm", "categoriaId",
  "categoria_id",
];

function semCampoProibido(valor: unknown): void {
  const texto = JSON.stringify(valor);
  for (const campo of PROIBIDOS) {
    expect(texto, `campo proibido "${campo}"`).not.toContain(`"${campo}"`);
  }
}

describe("listarDestaques", () => {
  it("só destaques, por vaga ascendente, com capa da posição 1 ou null", async () => {
    const r = await listarDestaques(db);
    expect(ids(r)).toEqual(fx.destaques.map((d) => d.id));
    const [c, d, b] = r;
    expect(c.capaChave).toBe(fx.meias[3].chaves[0]);
    expect(d.capaChave).toBeNull();
    expect(b.capaChave).not.toBeNull();
    semCampoProibido(r);
  });
});

describe("listarBloco", () => {
  it("ordena por criado_em DESC, id DESC e não mostra campos internos", async () => {
    const r = await listarBloco(db, {});
    expect(ids(r.itens)).toEqual(ordemEsperada);
    expect(r.haMais).toBe(false);
    expect(r.proximo).toBeNull();
    semCampoProibido(r);
  });

  it("capa é a foto da posição 1; produto sem foto tem capa null", async () => {
    const r = await listarBloco(db, { categoriaId: fx.categorias.meias });
    const porId = new Map(r.itens.map((i) => [i.id, i]));
    expect(porId.get(fx.meias[4].id)!.capaChave).toBeNull();
    expect(porId.get(fx.meias[3].id)!.capaChave).toBe(fx.meias[3].chaves[0]);
  });

  it("filtra por categoriaId", async () => {
    const r = await listarBloco(db, { categoriaId: fx.categorias.guardaChuvas });
    expect(ids(r.itens)).toEqual([fx.guardaChuva.id]);
  });

  it("cursor no empate de criado_em (µs 123456) devolve o outro empatado em seguida", async () => {
    const [maior, menor] = fx.empatados;
    const r = await listarBloco(db, {
      categoriaId: fx.categorias.meias,
      depois: { us: "1772359200123456", id: maior },
    });
    expect(ids(r.itens)[0]).toBe(menor);
  });

  it("devolve o µs do último item como texto, sem perda", async () => {
    const r = await listarBloco(db, { categoriaId: fx.categorias.meias });
    expect(r.proximo).toBeNull(); // 5 itens, cabem no bloco
    const t = await db.execute(sql`
      SELECT floor(extract(epoch from criado_em)*1e6)::bigint::text AS us FROM produtos
      WHERE id = ${fx.empatados[0]}`);
    const us = (t.rows as { us: string }[])[0].us;
    expect(us.endsWith("123456")).toBe(true);
  });

  describe("paginação com 30 produtos", () => {
    const criados: number[] = [];

    beforeAll(async () => {
      for (let i = 0; i < 30; i++) {
        const r = await db.execute(sql`
          INSERT INTO produtos (categoria_id, nome, criado_por, atualizado_por, criado_em)
          VALUES (${fx.categorias.vazia}, ${`Paginado ${String(i).padStart(2, "0")}`},
                  'admin@teste.local', 'admin@teste.local',
                  '2027-01-01 00:00:00+00'::timestamptz + ${Math.floor(i / 2)} * interval '1 microsecond')
          RETURNING id`);
        criados.push((r.rows as { id: number }[])[0].id);
      }
    });

    // `criado_em` empata de dois em dois: o desempate por id DESC é o que se testa.
    const esperado = () =>
      [...criados].reverse(); // i maior = criado_em maior ou igual; id maior primeiro

    it("24 itens + haMais; o bloco 2 continua sem repetir nem pular", async () => {
      const filtro = { categoriaId: fx.categorias.vazia };
      const b1 = await listarBloco(db, filtro);
      expect(b1.itens).toHaveLength(24);
      expect(b1.haMais).toBe(true);
      expect(b1.proximo).not.toBeNull();
      expect(typeof b1.proximo!.us).toBe("string");
      expect(b1.proximo!.id).toBe(b1.itens[23].id);

      const b2 = await listarBloco(db, { ...filtro, depois: b1.proximo! });
      expect(b2.itens).toHaveLength(6);
      expect(b2.haMais).toBe(false);
      expect([...ids(b1.itens), ...ids(b2.itens)]).toEqual(esperado());
    });

    it("remover o último item do bloco 1 antes do bloco 2 não repete nem pula", async () => {
      const filtro = { categoriaId: fx.categorias.vazia };
      const b1 = await listarBloco(db, filtro);
      const cursor = b1.proximo!;
      await db.execute(sql`DELETE FROM produtos WHERE id = ${cursor.id}`);
      const b2 = await listarBloco(db, { ...filtro, depois: cursor });
      const restante = esperado().slice(24);
      expect(ids(b2.itens)).toEqual(restante);
      expect(ids(b2.itens)).not.toContain(cursor.id);
    });

    it("produto editado não muda de lugar", async () => {
      const filtro = { categoriaId: fx.categorias.vazia };
      const antes = ids((await listarBloco(db, filtro)).itens);
      await db.execute(sql`UPDATE produtos SET atualizado_em = now(), nome = 'Editado' WHERE id = ${antes[3]}`);
      const depois = ids((await listarBloco(db, filtro)).itens);
      expect(depois).toEqual(antes);
    });

    it("limpeza do cenário paginado", async () => {
      await db.execute(sql`DELETE FROM produtos WHERE categoria_id = ${fx.categorias.vazia}`);
    });
  });
});

// Ordem global esperada (criado_em DESC, id DESC), montada a partir da fixture: D (1/abr),
// F guarda-chuva (15/mar), empatados (1/mar, maior id antes), esgotado G (15/fev), C (1/fev),
// garrafa I (11/jan), bolsa H (10/jan), E (1/jan).
const ordemEsperada: number[] = [];
beforeAll(() => {
  ordemEsperada.push(
    fx.meias[0].id,
    fx.guardaChuva.id,
    fx.empatados[0],
    fx.empatados[1],
    fx.esgotado.id,
    fx.meias[3].id,
    fx.garrafa.id,
    fx.bolsa.id,
    fx.meias[4].id,
  );
});

describe("categoriasComProdutos", () => {
  it("só categorias com produto (a só de esgotados entra; a vazia não), com slug", async () => {
    const r = await categoriasComProdutos(db);
    const slugs = r.map((c) => c.slug);
    expect(slugs).toContain("meias");
    expect(slugs).toContain("guarda-chuvas");
    expect(slugs).toContain("so-esgotados");
    expect(slugs).not.toContain("vazia");
    const gc = r.find((c) => c.slug === "guarda-chuvas")!;
    expect(gc.nome).toBe("Guarda-chuvas");
    expect(gc.id).toBe(fx.categorias.guardaChuvas);
  });

  it('ordena pela chave com collation "C": "Água" antes de "Bolsas", como o painel da 002', async () => {
    const r = await categoriasComProdutos(db);
    expect(r.map((c) => c.nome)).toEqual([
      "Água", "Bolsas", "Guarda-chuvas", "Meias", "Só esgotados",
    ]);
    const painel = await listarCategoriasDoPainel(db);
    const comProdutos = new Set(r.map((c) => c.id));
    expect(painel.filter((c) => comProdutos.has(c.id)).map((c) => c.id)).toEqual(
      r.map((c) => c.id),
    );
  });
});

describe("obterPublico", () => {
  it("devolve produto, nome da categoria e fotos por posição", async () => {
    const p = await obterPublico(db, fx.empatados[0] === fx.meias[1].id ? fx.meias[1].id : fx.meias[2].id);
    expect(p).not.toBeNull();
    expect(p!.categoria).toBe("Meias");
    semCampoProibido(p);
  });

  it("fotos ordenadas por posicao", async () => {
    const comTres = fx.meias.find((m) => m.chaves.length === 3)!;
    const p = await obterPublico(db, comTres.id);
    expect(p!.fotos).toEqual(comTres.chaves);
  });

  it("produto sem foto devolve lista vazia; descrição nula vira null", async () => {
    const p = await obterPublico(db, fx.semFoto.id);
    expect(p!.fotos).toEqual([]);
    expect(p!.descricao).toBeNull();
  });

  it("devolve a descrição", async () => {
    const p = await obterPublico(db, fx.guardaChuva.id);
    expect(p!.descricao).toBe("Dobrável");
  });

  it("devolve null para id inexistente", async () => {
    expect(await obterPublico(db, 2_000_000_000)).toBeNull();
  });
});

describe("fotoPublica", () => {
  it("true só para chave em produto_fotos", async () => {
    expect(await fotoPublica(db, fx.guardaChuva.chaves[0])).toBe(true);
  });

  it("false para envio pendente, envio confirmado não adotado e uuid inventado", async () => {
    expect(await fotoPublica(db, fx.envioPendente.chave)).toBe(false);
    expect(await fotoPublica(db, fx.envioNaoAdotado.chave)).toBe(false);
    expect(await fotoPublica(db, "fotos/6f1c2b1e-5d3a-4c8e-9b7a-0123456789ab.webp")).toBe(false);
  });

  it("false para chave removida", async () => {
    const chave = fx.guardaChuva.chaves[0];
    await db.execute(sql`DELETE FROM produto_fotos WHERE chave_objeto = ${chave}`);
    expect(await fotoPublica(db, chave)).toBe(false);
  });
});

// Feature 006, SF3 (T024): conferência da sacola. `conferirProdutos(db, ids)` devolve só os
// produtos que existem (id inexistente fica de fora), em ordem NÃO garantida, com uma só consulta.
describe("conferirProdutos (T024, CC§5)", () => {
  const porId = <T extends { id: number }>(itens: T[]) => [...itens].sort((a, b) => a.id - b.id);

  it("produto disponível com capa: campos em camelCase e capaChave da posição 1", async () => {
    const [a] = fx.meias.filter((m) => m.nome === "Meia antiga C");
    const r = await conferirProdutos(db, [a.id]);
    expect(r).toEqual([
      {
        id: a.id,
        nome: "Meia antiga C",
        precoCentavos: null,
        aPartirDe: false,
        esgotado: false,
        capaChave: a.chaves[0],
      },
    ]);
  });

  it("preço e a_partir_de vêm do banco; a capa é a da posição 1 entre várias fotos", async () => {
    const preco = fx.meias.find((m) => m.nome === "Meia empatada A")!;
    const aPartir = fx.meias.find((m) => m.nome === "Meia empatada B")!;
    const r = porId(await conferirProdutos(db, [preco.id, aPartir.id]));
    const a = r.find((i) => i.id === preco.id)!;
    const b = r.find((i) => i.id === aPartir.id)!;
    expect(a).toMatchObject({ precoCentavos: 1290, aPartirDe: false, capaChave: preco.chaves[0] });
    expect(b).toMatchObject({ precoCentavos: 1590, aPartirDe: true, capaChave: aPartir.chaves[0] });
  });

  it("produto esgotado: esgotado true", async () => {
    const r = await conferirProdutos(db, [fx.esgotado.id]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: fx.esgotado.id, nome: "Produto esgotado G", esgotado: true });
  });

  it("produto sem foto: capaChave null", async () => {
    const r = await conferirProdutos(db, [fx.semFoto.id]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: fx.semFoto.id, capaChave: null });
  });

  it("id inexistente fica fora do resultado; os existentes voltam", async () => {
    const inexistente = 2_000_000_000;
    const r = await conferirProdutos(db, [fx.guardaChuva.id, inexistente, fx.semFoto.id]);
    expect(porId(r).map((i) => i.id)).toEqual([fx.guardaChuva.id, fx.semFoto.id].sort((x, y) => x - y));
    expect(r.map((i) => i.id)).not.toContain(inexistente);
  });

  it("só inexistentes ⇒ []", async () => {
    expect(await conferirProdutos(db, [2_000_000_000, 1_999_999_999])).toEqual([]);
  });

  it("ids vazio ⇒ [] sem chamar o banco", async () => {
    const execute = vi.spyOn(db, "execute");
    try {
      expect(await conferirProdutos(db, [])).toEqual([]);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      execute.mockRestore();
    }
  });

  it("15 ids ⇒ UMA única chamada a db.execute", async () => {
    // `semFoto` é a "Meia muito antiga E", que já está em `meias`: sem repetição, como a rota manda.
    const reais = [
      ...new Set([
        fx.guardaChuva.id, fx.esgotado.id, fx.semFoto.id, fx.bolsa.id, fx.garrafa.id,
        ...fx.meias.map((m) => m.id),
      ]),
    ];
    const pedidos = [...reais, ...Array.from({ length: 15 - reais.length }, (_, i) => 2_000_000_000 + i)];
    expect(pedidos).toHaveLength(15);
    const execute = vi.spyOn(db, "execute");
    try {
      const r = await conferirProdutos(db, pedidos);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(porId(r).map((i) => i.id)).toEqual([...reais].sort((x, y) => x - y));
    } finally {
      execute.mockRestore();
    }
  });

  it("não expõe campos internos (categoria, versão, auditoria)", async () => {
    const r = await conferirProdutos(db, [fx.guardaChuva.id]);
    expect(Object.keys(r[0]).sort()).toEqual(
      ["aPartirDe", "capaChave", "esgotado", "id", "nome", "precoCentavos"],
    );
    semCampoProibido(r);
  });
});
