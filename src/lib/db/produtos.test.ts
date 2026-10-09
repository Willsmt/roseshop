import { NeonDbError } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import type { Db } from "@/lib/db/client";

import { destacar, editar, inserirComFotos } from "./produtos";

// Feature 003, T023 (SF4), unitário com db simulado: 23505 seguido de lookup vazio (a linha
// conflitante foi removida ou renomeada no meio) ⇒ nome_repetido SEM codigoExistente.
// O mock é agnóstico ao estilo de consulta (db.execute ou builder do Drizzle): toda chamada ou
// await consome a próxima resposta roteirizada, na ordem.
const sessao: AdminSession = { email: "admin@teste.local", name: "Admin" };
const campos = {
  nome: "Bolsa de Praia",
  categoriaId: 1,
  descricao: null,
  precoCentavos: 1000,
  aPartirDe: false,
};

function violacaoUnica() {
  return Object.assign(new Error("Failed query"), {
    cause: Object.assign(new Error('duplicate key value violates unique constraint "produtos_chave_unique"'), {
      code: "23505",
    }),
  });
}

function dbSimulado() {
  const fila: Array<() => unknown> = [
    () => {
      throw violacaoUnica();
    },
    () => Object.assign([], { rows: [] }), // lookup por chave: nada encontrado
  ];
  let consumidas = 0;
  const proximo = () => {
    consumidas += 1;
    const passo = fila.shift();
    return passo ? passo() : Object.assign([], { rows: [] });
  };
  const encadeavel: unknown = new Proxy(function () {}, {
    get: (_alvo, prop) => {
      if (prop === "then") {
        return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
          try {
            return Promise.resolve(proximo()).then(ok, ko);
          } catch (e) {
            return Promise.reject(e).then(ok, ko);
          }
        };
      }
      return encadeavel;
    },
    apply: () => encadeavel,
  });
  return { db: encadeavel as Db, consumidas: () => consumidas };
}

describe("fallback do lookup após 23505 (sem codigoExistente)", () => {
  // Feature 004: o `inserir` da 003 saiu (SF6, T067); o cadastro é `inserirComFotos`, cujo
  // batch entrega o NeonDbError sem embrulho (R3).
  it("inserirComFotos: 23505 do nome e lookup vazio ⇒ nome_repetido sem codigoExistente", async () => {
    const erro = new NeonDbError("duplicate key value violates unique constraint");
    erro.code = "23505";
    erro.constraint = "produtos_chave_unique";
    // Batch falha; qualquer consulta encadeada (o lookup do nome) resolve vazia.
    const db: unknown = new Proxy(function () {}, {
      get: (_alvo, prop) => {
        if (prop === "batch") return () => Promise.reject(erro);
        if (prop === "then") return (ok: (v: unknown) => unknown) => Promise.resolve([]).then(ok);
        return db;
      },
      apply: () => db,
    });
    const r = await inserirComFotos(db as Db, sessao, campos, [
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(r).toEqual({ tipo: "nome_repetido" });
    expect(r).not.toHaveProperty("codigoExistente");
  });

  it("editar: 23505 e lookup vazio ⇒ nome_repetido sem codigoExistente", async () => {
    const { db, consumidas } = dbSimulado();
    const r = await editar(db, sessao, 7, 1, campos);
    expect(r).toEqual({ tipo: "nome_repetido" });
    expect(r).not.toHaveProperty("codigoExistente");
    expect(consumidas()).toBe(2); // UPDATE + lookup do nome existente
  });
});

// SF5: o 23505 de `destacar` só vira vaga_disputada quando a constraint é a da vaga (ADR-008).
function dbQueFalha(erro: unknown) {
  return {
    execute: () => Promise.reject(erro),
  } as unknown as Db;
}

function unicidade(constraint: string) {
  return Object.assign(new Error("Failed query"), {
    cause: Object.assign(new Error("duplicate key"), { code: "23505", constraint }),
  });
}

describe("destacar: tradução do 23505 pela constraint", () => {
  it("produtos_destaque_vaga_unique ⇒ vaga_disputada, sem retry", async () => {
    let chamadas = 0;
    const db = {
      execute: () => {
        chamadas += 1;
        return Promise.reject(unicidade("produtos_destaque_vaga_unique"));
      },
    } as unknown as Db;
    expect(await destacar(db, sessao, 7, 1)).toEqual({ tipo: "vaga_disputada" });
    expect(chamadas).toBe(1);
  });

  it("outra constraint única ⇒ erro propaga", async () => {
    const erro = unicidade("produtos_chave_unique");
    await expect(destacar(dbQueFalha(erro), sessao, 7, 1)).rejects.toBe(erro);
  });

  it("23505 sem nome de constraint ⇒ erro propaga", async () => {
    const erro = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("dup"), { code: "23505" }),
    });
    await expect(destacar(dbQueFalha(erro), sessao, 7, 1)).rejects.toBe(erro);
  });
});

// R3: no batch de inserirComFotos o NeonDbError chega sem embrulho; 23503 só vira
// categoria_ausente pela FK da categoria (comparação exata do nome da constraint).
function violacaoDeFk(constraint: string) {
  const e = new NeonDbError("insert or update violates foreign key constraint");
  e.code = "23503";
  e.constraint = constraint;
  return e;
}

function dbComBatchQueFalha(erro: unknown) {
  return {
    execute: () => ({}),
    batch: () => Promise.reject(erro),
  } as unknown as Db;
}

const envioId = "11111111-1111-4111-8111-111111111111";

describe("inserirComFotos: tradução do 23503 pela constraint (R3)", () => {
  it("23503 de outra FK (outra_fk) ⇒ erro propaga", async () => {
    const erro = violacaoDeFk("outra_fk");
    await expect(inserirComFotos(dbComBatchQueFalha(erro), sessao, campos, [envioId])).rejects.toBe(erro);
  });

  it("23503 sem nome de constraint ⇒ erro propaga", async () => {
    const erro = new NeonDbError("fk");
    erro.code = "23503";
    await expect(inserirComFotos(dbComBatchQueFalha(erro), sessao, campos, [envioId])).rejects.toBe(erro);
  });

  it("23503 de produtos_categoria_id_categorias_id_fk ⇒ categoria_ausente", async () => {
    const erro = violacaoDeFk("produtos_categoria_id_categorias_id_fk");
    expect(await inserirComFotos(dbComBatchQueFalha(erro), sessao, campos, [envioId])).toEqual({
      tipo: "categoria_ausente",
    });
  });
});
