import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirProduto, limparProdutos } from "@/test/db/produtos-fixtures";

import { codigoSqlstate, nomeConstraint } from "./erros-pg";
import { destacar, disponibilizar, esgotar, tirarDoDestaque } from "./produtos";

// Feature 003, T029 (SF5): status e destaque de produtos (US2-AC1-3/5/6, US5-AC1-6, SC-005 teto;
// estendido pela 004, T054: destaque sempre com foto).
// Integração com o banco local. Roda em série com os demais arquivos de integração.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const sessao: AdminSession = { email: "admin@teste.local", name: "Admin" };
const AUTOR_ANTIGO = "antigo@teste.local";
const RODADAS = 10;

let cat1 = 0;

type Linha = {
  esgotado: boolean;
  destaque_vaga: number | null;
  versao: number;
  atualizado_por: string;
  atualizado_em: Date | string;
};

async function estado(id: number): Promise<Linha> {
  const r = await db.execute(
    sql`SELECT esgotado, destaque_vaga, versao, atualizado_por, atualizado_em FROM produtos WHERE id = ${id}`,
  );
  return (r.rows as Linha[])[0];
}

/** Produto novo, com autoria e data antigas para provar que a ação as atualiza. */
async function criar(): Promise<number> {
  const id = await inserirProduto(db, cat1);
  await db.execute(
    sql`UPDATE produtos SET atualizado_por = ${AUTOR_ANTIGO}, atualizado_em = '2020-01-01T00:00:00Z' WHERE id = ${id}`,
  );
  return id;
}

/** Cenário: coloca o produto no destaque numa vaga explícita (UPDATE direto, sem a função testada). */
async function colocarEmDestaque(id: number, vaga: number): Promise<void> {
  await db.execute(sql`UPDATE produtos SET destaque_vaga = ${vaga} WHERE id = ${id}`);
}

async function criarEmDestaque(vaga: number): Promise<number> {
  const id = await criar();
  await colocarEmDestaque(id, vaga);
  return id;
}

async function marcarEsgotadoDireto(id: number): Promise<void> {
  await db.execute(sql`UPDATE produtos SET esgotado = true, destaque_vaga = NULL WHERE id = ${id}`);
}

/** Enche as vagas 1..n com produtos novos e devolve os ids (índice i = vaga i+1). */
async function encher(n: number): Promise<number[]> {
  const ids: number[] = [];
  for (let v = 1; v <= n; v++) ids.push(await criarEmDestaque(v));
  return ids;
}

async function vagasOcupadas(): Promise<number[]> {
  const r = await db.execute(
    sql`SELECT destaque_vaga FROM produtos WHERE destaque_vaga IS NOT NULL ORDER BY destaque_vaga`,
  );
  return (r.rows as { destaque_vaga: number }[]).map((x) => x.destaque_vaga);
}

/** Feature 004 (FR-004): produtos em destaque sem nenhuma linha em `produto_fotos`. */
async function destaquesSemFoto(): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM produtos p
    WHERE p.destaque_vaga IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM produto_fotos f WHERE f.produto_id = p.id)`);
  return (r.rows as { n: number }[])[0].n;
}

async function violacoesEsgotadoComVaga(): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM produtos WHERE esgotado AND destaque_vaga IS NOT NULL`,
  );
  return (r.rows as { n: number }[])[0].n;
}

function expectAutoriaAtualizada(l: Linha, versaoEsperada: number) {
  expect(l.versao).toBe(versaoEsperada);
  expect(l.atualizado_por).toBe(sessao.email);
  expect(new Date(l.atualizado_em).getTime()).toBeGreaterThan(new Date("2021-01-01T00:00:00Z").getTime());
}

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(sql`SELECT id FROM categorias ORDER BY id LIMIT 1`);
  cat1 = (r.rows as { id: number }[])[0].id;
});
beforeEach(() => limparProdutos(db));
afterAll(() => resetCategorias(db));

describe("esgotar (US2, US5)", () => {
  it("US2-AC1: marca esgotado, mantém destaque_vaga NULL, saiuDoDestaque=false, incrementa versao/autoria", async () => {
    const id = await criar();
    expect(await esgotar(db, sessao, id, 1)).toEqual({ tipo: "ok", saiuDoDestaque: false });
    const l = await estado(id);
    expect(l.esgotado).toBe(true);
    expect(l.destaque_vaga).toBeNull();
    expectAutoriaAtualizada(l, 2);
  });

  it("US5-AC3: esgotar produto em destaque tira a vaga na mesma linha e devolve saiuDoDestaque=true", async () => {
    const id = await criarEmDestaque(3);
    expect(await esgotar(db, sessao, id, 1)).toEqual({ tipo: "ok", saiuDoDestaque: true });
    const l = await estado(id);
    expect(l.esgotado).toBe(true);
    expect(l.destaque_vaga).toBeNull();
    expectAutoriaAtualizada(l, 2);
  });

  it("ausente: id inexistente ⇒ ausente", async () => {
    expect(await esgotar(db, sessao, 999_999_999, 1)).toEqual({ tipo: "ausente" });
  });

  it("versao_diferente: nada alterado (inclusive o destaque)", async () => {
    const id = await criarEmDestaque(2);
    expect(await esgotar(db, sessao, id, 7)).toEqual({ tipo: "versao_diferente" });
    const l = await estado(id);
    expect(l.esgotado).toBe(false);
    expect(l.destaque_vaga).toBe(2);
    expect(l.versao).toBe(1);
    expect(l.atualizado_por).toBe(AUTOR_ANTIGO);
  });
});

describe("disponibilizar (US2, FR-017)", () => {
  it("US2-AC2: esgotado=false, incrementa versao/autoria", async () => {
    const id = await criar();
    await marcarEsgotadoDireto(id);
    expect(await disponibilizar(db, sessao, id, 1)).toEqual({ tipo: "ok" });
    const l = await estado(id);
    expect(l.esgotado).toBe(false);
    expectAutoriaAtualizada(l, 2);
  });

  it("FR-017 / US5-AC3: esgotar em destaque e disponibilizar NÃO recoloca no destaque", async () => {
    const id = await criarEmDestaque(1);
    expect(await esgotar(db, sessao, id, 1)).toEqual({ tipo: "ok", saiuDoDestaque: true });
    expect(await disponibilizar(db, sessao, id, 2)).toEqual({ tipo: "ok" });
    const l = await estado(id);
    expect(l.esgotado).toBe(false);
    expect(l.destaque_vaga).toBeNull();
    expect(l.versao).toBe(3);
  });

  it("ausente: id inexistente ⇒ ausente", async () => {
    expect(await disponibilizar(db, sessao, 999_999_999, 1)).toEqual({ tipo: "ausente" });
  });

  it("versao_diferente: nada alterado", async () => {
    const id = await criar();
    await marcarEsgotadoDireto(id);
    expect(await disponibilizar(db, sessao, id, 9)).toEqual({ tipo: "versao_diferente" });
    const l = await estado(id);
    expect(l.esgotado).toBe(true);
    expect(l.versao).toBe(1);
    expect(l.atualizado_por).toBe(AUTOR_ANTIGO);
  });
});

describe("destacar (US5)", () => {
  it("US5-AC1: primeiro destaque usa a vaga 1; incrementa versao/autoria", async () => {
    const id = await criar();
    expect(await destacar(db, sessao, id, 1)).toEqual({ tipo: "ok" });
    const l = await estado(id);
    expect(l.destaque_vaga).toBe(1);
    expect(l.esgotado).toBe(false);
    expectAutoriaAtualizada(l, 2);
  });

  it("US5-AC1: usa sempre a menor vaga livre (1, 2, 3 em sequência)", async () => {
    const ids = [await criar(), await criar(), await criar()];
    for (const id of ids) expect(await destacar(db, sessao, id, 1)).toEqual({ tipo: "ok" });
    const vagas = [];
    for (const id of ids) vagas.push((await estado(id)).destaque_vaga);
    expect(vagas).toEqual([1, 2, 3]);
  });

  it("US5-AC2: reaproveita a vaga liberada (destaca 3, tira o 2º, destaca novo ⇒ pega a vaga 2)", async () => {
    const [a, b, c] = [await criar(), await criar(), await criar()];
    for (const id of [a, b, c]) expect(await destacar(db, sessao, id, 1)).toEqual({ tipo: "ok" });
    expect(await tirarDoDestaque(db, sessao, b, 2)).toEqual({ tipo: "ok" });
    const novo = await criar();
    expect(await destacar(db, sessao, novo, 1)).toEqual({ tipo: "ok" });
    expect((await estado(novo)).destaque_vaga).toBe(2);
    expect(await vagasOcupadas()).toEqual([1, 2, 3]);
  });

  it("US5-AC4: produto esgotado ⇒ esgotado, nada alterado", async () => {
    const id = await criar();
    await marcarEsgotadoDireto(id);
    expect(await destacar(db, sessao, id, 1)).toEqual({ tipo: "esgotado" });
    const l = await estado(id);
    expect(l.destaque_vaga).toBeNull();
    expect(l.versao).toBe(1);
    expect(l.atualizado_por).toBe(AUTOR_ANTIGO);
  });

  it("US5-AC5 / SC-005: com 8 em destaque ⇒ limite, nada alterado", async () => {
    await encher(8);
    const id = await criar();
    expect(await destacar(db, sessao, id, 1)).toEqual({ tipo: "limite" });
    const l = await estado(id);
    expect(l.destaque_vaga).toBeNull();
    expect(l.versao).toBe(1);
    expect(l.atualizado_por).toBe(AUTOR_ANTIGO);
    expect(await vagasOcupadas()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("US5-AC6: já em destaque com a versao correta ⇒ ja_em_destaque, sem alterar nada (nem versao)", async () => {
    const id = await criarEmDestaque(4);
    const antes = await estado(id);
    expect(await destacar(db, sessao, id, 1)).toEqual({ tipo: "ja_em_destaque" });
    const depois = await estado(id);
    expect(depois.destaque_vaga).toBe(4);
    expect(depois.versao).toBe(1);
    expect(depois.atualizado_por).toBe(AUTOR_ANTIGO);
    expect(new Date(depois.atualizado_em).getTime()).toBe(new Date(antes.atualizado_em).getTime());
  });

  it("ausente: id inexistente ⇒ ausente", async () => {
    expect(await destacar(db, sessao, 999_999_999, 1)).toEqual({ tipo: "ausente" });
  });

  it("versao_diferente: nada alterado", async () => {
    const id = await criar();
    expect(await destacar(db, sessao, id, 5)).toEqual({ tipo: "versao_diferente" });
    const l = await estado(id);
    expect(l.destaque_vaga).toBeNull();
    expect(l.versao).toBe(1);
    expect(l.atualizado_por).toBe(AUTOR_ANTIGO);
  });
});

describe("destacar: precedência da leitura após 0 linhas (C§2)", () => {
  it("ausente vence tudo: id inexistente com qualquer versão ⇒ ausente (mesmo com 8 cheios)", async () => {
    await encher(8);
    expect(await destacar(db, sessao, 999_999_999, 1)).toEqual({ tipo: "ausente" });
    expect(await destacar(db, sessao, 999_999_999, 42)).toEqual({ tipo: "ausente" });
  });

  it("versao_diferente > esgotado: versão errada + esgotado ⇒ versao_diferente", async () => {
    const id = await criar();
    await marcarEsgotadoDireto(id);
    expect(await destacar(db, sessao, id, 9)).toEqual({ tipo: "versao_diferente" });
  });

  it("versao_diferente > ja_em_destaque: versão errada + já em destaque ⇒ versao_diferente", async () => {
    const id = await criarEmDestaque(1);
    expect(await destacar(db, sessao, id, 9)).toEqual({ tipo: "versao_diferente" });
  });

  it("versao_diferente > limite: versão errada + 8 cheios ⇒ versao_diferente", async () => {
    await encher(8);
    const id = await criar();
    expect(await destacar(db, sessao, id, 9)).toEqual({ tipo: "versao_diferente" });
  });

  it("esgotado > limite: esgotado + 8 cheios ⇒ esgotado", async () => {
    await encher(8);
    const id = await criar();
    await marcarEsgotadoDireto(id);
    expect(await destacar(db, sessao, id, 1)).toEqual({ tipo: "esgotado" });
  });

  it("ja_em_destaque > limite: já em destaque + 8 cheios ⇒ ja_em_destaque", async () => {
    const ids = await encher(8);
    expect(await destacar(db, sessao, ids[2], 1)).toEqual({ tipo: "ja_em_destaque" });
  });

  it("esgotado > ja_em_destaque: estado inalcançável pelo CHECK; esgotado + vaga é rejeitado pelo banco", async () => {
    const id = await criar();
    const erro = await db
      .execute(sql`UPDATE produtos SET esgotado = true, destaque_vaga = 1 WHERE id = ${id}`)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(codigoSqlstate(erro)).toBe("23514");
    expect(nomeConstraint(erro)).toBe("produtos_destaque_disponivel");
  });
});

describe("status repetido (premissa: toda escrita incrementa versao)", () => {
  it("esgotar produto já esgotado ⇒ ok, saiuDoDestaque=false, versao+1", async () => {
    const id = await criar();
    await esgotar(db, sessao, id, 1);
    expect(await esgotar(db, sessao, id, 2)).toEqual({ tipo: "ok", saiuDoDestaque: false });
    expect((await estado(id)).versao).toBe(3);
  });

  it("disponibilizar produto já disponível ⇒ ok, versao+1", async () => {
    const id = await criar();
    expect(await disponibilizar(db, sessao, id, 1)).toEqual({ tipo: "ok" });
    expectAutoriaAtualizada(await estado(id), 2);
  });
});

describe("tirarDoDestaque (US5)", () => {
  it("zera a vaga e incrementa versao/autoria", async () => {
    const id = await criarEmDestaque(5);
    expect(await tirarDoDestaque(db, sessao, id, 1)).toEqual({ tipo: "ok" });
    const l = await estado(id);
    expect(l.destaque_vaga).toBeNull();
    expect(l.esgotado).toBe(false);
    expectAutoriaAtualizada(l, 2);
  });

  it("ausente: id inexistente ⇒ ausente", async () => {
    expect(await tirarDoDestaque(db, sessao, 999_999_999, 1)).toEqual({ tipo: "ausente" });
  });

  it("versao_diferente: nada alterado (continua em destaque)", async () => {
    const id = await criarEmDestaque(5);
    expect(await tirarDoDestaque(db, sessao, id, 3)).toEqual({ tipo: "versao_diferente" });
    const l = await estado(id);
    expect(l.destaque_vaga).toBe(5);
    expect(l.versao).toBe(1);
    expect(l.atualizado_por).toBe(AUTOR_ANTIGO);
  });
});

describe("concorrência (SC-005, FR-026)", () => {
  it(
    "SC-005: 7 em destaque + 2 destacar simultâneos de produtos diferentes ⇒ exatamente 1 ok e o outro recusado (vaga_disputada ou limite); total 8",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        await encher(7);
        const [p, q] = [await criar(), await criar()];
        const rs = await Promise.all([destacar(db, sessao, p, 1), destacar(db, sessao, q, 1)]);
        const ctx = `rodada ${i}: ${JSON.stringify(rs)}`;
        expect(rs.filter((r) => r.tipo === "ok"), ctx).toHaveLength(1);
        // Colisão na mesma vaga ⇒ vaga_disputada (23505). Se o segundo UPDATE só começa depois
        // do commit do primeiro, já não há vaga livre ⇒ limite. Os dois são recusas corretas; a
        // tradução do 23505 é coberta de forma determinística em produtos.test.ts.
        const recusado = rs.find((r) => r.tipo !== "ok");
        expect(["vaga_disputada", "limite"], ctx).toContain(recusado?.tipo);
        expect(await vagasOcupadas(), ctx).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        // SC-005 estendido pela 004: o destaque nunca mostra produto sem foto.
        expect(await destaquesSemFoto(), ctx).toBe(0);
      }
    },
    120_000,
  );

  it(
    "esgotar × destacar no MESMO produto e MESMA versao ⇒ 1 aceita e a outra versao_diferente; nunca esgotado com vaga",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const id = await criar();
        const [rEsg, rDes] = await Promise.all([esgotar(db, sessao, id, 1), destacar(db, sessao, id, 1)]);
        const ctx = `rodada ${i}: ${JSON.stringify([rEsg, rDes])}`;
        expect((rEsg.tipo === "ok") !== (rDes.tipo === "ok"), ctx).toBe(true);
        if (rEsg.tipo === "ok") expect(rDes, ctx).toEqual({ tipo: "versao_diferente" });
        else expect(rEsg, ctx).toEqual({ tipo: "versao_diferente" });
        expect(await violacoesEsgotadoComVaga(), ctx).toBe(0);
        const l = await estado(id);
        expect(l.versao, ctx).toBe(2);
        if (rEsg.tipo === "ok") expect(l.destaque_vaga, ctx).toBeNull();
        else expect(l.esgotado, ctx).toBe(false);
      }
    },
    120_000,
  );

  it(
    "tirarDoDestaque × esgotar num produto em destaque, mesma versao ⇒ 1 aceita, a outra versao_diferente",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const id = await criarEmDestaque(1);
        const rs = await Promise.all([tirarDoDestaque(db, sessao, id, 1), esgotar(db, sessao, id, 1)]);
        const ctx = `rodada ${i}: ${JSON.stringify(rs)}`;
        expect(rs.filter((r) => r.tipo === "ok"), ctx).toHaveLength(1);
        expect(rs.filter((r) => r.tipo === "versao_diferente"), ctx).toHaveLength(1);
        expect((await estado(id)).versao, ctx).toBe(2);
        expect(await violacoesEsgotadoComVaga(), ctx).toBe(0);
      }
    },
    120_000,
  );

  it(
    "disponibilizar × esgotar, mesma versao ⇒ 1 aceita, a outra versao_diferente",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const id = await criar();
        const rs = await Promise.all([disponibilizar(db, sessao, id, 1), esgotar(db, sessao, id, 1)]);
        const ctx = `rodada ${i}: ${JSON.stringify(rs)}`;
        expect(rs.filter((r) => r.tipo === "ok"), ctx).toHaveLength(1);
        expect(rs.filter((r) => r.tipo === "versao_diferente"), ctx).toHaveLength(1);
        expect((await estado(id)).versao, ctx).toBe(2);
      }
    },
    120_000,
  );

  it(
    "dois destacar do mesmo produto e mesma versao ⇒ 1 ok e 1 versao_diferente; ocupa uma só vaga",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const id = await criar();
        const rs = await Promise.all([destacar(db, sessao, id, 1), destacar(db, sessao, id, 1)]);
        const ctx = `rodada ${i}: ${JSON.stringify(rs)}`;
        expect(rs.filter((r) => r.tipo === "ok"), ctx).toHaveLength(1);
        expect(rs.filter((r) => r.tipo === "versao_diferente"), ctx).toHaveLength(1);
        expect(await vagasOcupadas(), ctx).toEqual([1]);
      }
    },
    120_000,
  );
});

describe("vaga_disputada pelo caminho real (23505 do índice único)", () => {
  it(
    "primeiro grava a vaga 8 e demora a commitar; destacar de outro produto espera o índice e recebe vaga_disputada",
    async () => {
      await encher(7);
      const [p, q] = [await criar(), await criar()];
      // Um batch é uma transação só: o UPDATE fica sem commit durante o pg_sleep.
      const segurando = db.batch([
        db.execute(sql`UPDATE produtos SET destaque_vaga = 8 WHERE id = ${p}`),
        db.execute(sql`SELECT pg_sleep(1.5)`),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const r = await destacar(db, sessao, q, 1);
      await segurando;
      expect(r).toEqual({ tipo: "vaga_disputada" });
      expect(await vagasOcupadas()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect((await estado(q)).destaque_vaga).toBeNull();
    },
    30_000,
  );
});
