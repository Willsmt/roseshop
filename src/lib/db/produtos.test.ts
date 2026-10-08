import { describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import type { Db } from "@/lib/db/client";

import { destacar, editar, inserir } from "./produtos";

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
  it("inserir: 23505 e lookup vazio ⇒ nome_repetido sem codigoExistente", async () => {
    const { db, consumidas } = dbSimulado();
    const r = await inserir(db, sessao, campos);
    expect(r).toEqual({ tipo: "nome_repetido" });
    expect(r).not.toHaveProperty("codigoExistente");
    expect(consumidas()).toBe(2); // INSERT + lookup do nome existente
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
