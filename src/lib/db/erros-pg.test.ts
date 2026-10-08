import { NeonDbError } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import { codigoSqlstate, nomeConstraint } from "./erros-pg";

const embrulhado = (code?: unknown) =>
  Object.assign(new Error("Failed query"), {
    cause: Object.assign(new Error("dup"), code === undefined ? {} : { code }),
  });

describe("codigoSqlstate (cause.code; code no topo só se instância de NeonDbError)", () => {
  it.each(["23505", "23001"])("lê %s de cause.code", (code) => {
    expect(codigoSqlstate(embrulhado(code))).toBe(code);
  });

  it("code sozinho, sem cause, é ignorado", () => {
    expect(codigoSqlstate(Object.assign(new Error("x"), { code: "23505" }))).toBeUndefined();
  });

  it("code no topo é ignorado mesmo com cause sem code", () => {
    const e = Object.assign(new Error("x"), { code: "23505", cause: new Error("y") });
    expect(codigoSqlstate(e)).toBeUndefined();
  });

  it("objeto com name NeonDbError que não é instância tem o code do topo ignorado", () => {
    const falso = Object.assign(new Error("x"), { name: "NeonDbError", code: "23001" });
    expect(codigoSqlstate(falso)).toBeUndefined();
    expect(codigoSqlstate({ name: "NeonDbError", code: "23505" })).toBeUndefined();
  });

  it.each(["23001", "23505"])("lê %s de error.code quando é instância de NeonDbError", (code) => {
    const e = new NeonDbError("falha");
    e.code = code;
    expect(codigoSqlstate(e)).toBe(code);
  });

  it("NeonDbError sem code ⇒ undefined", () => {
    expect(codigoSqlstate(new NeonDbError("falha"))).toBeUndefined();
  });

  it("NeonDbError com code não string ⇒ undefined", () => {
    const e = new NeonDbError("falha");
    (e as unknown as { code: unknown }).code = 23001;
    expect(codigoSqlstate(e)).toBeUndefined();
  });

  it("erro sem código", () => {
    expect(codigoSqlstate(new Error("x"))).toBeUndefined();
  });

  it("cause sem code", () => {
    expect(codigoSqlstate(embrulhado())).toBeUndefined();
  });

  it("cause.code não string", () => {
    expect(codigoSqlstate(embrulhado(23505))).toBeUndefined();
  });

  it.each([null, undefined, "23505"])("valor %o ⇒ undefined", (v) => {
    expect(codigoSqlstate(v)).toBeUndefined();
  });
});

describe("nomeConstraint (mesma regra de codigoSqlstate)", () => {
  it("lê cause.constraint", () => {
    const e = Object.assign(new Error("x"), { cause: { constraint: "produtos_chave_unique" } });
    expect(nomeConstraint(e)).toBe("produtos_chave_unique");
  });

  it("NeonDbError sem embrulho (forma do db.batch) tem o constraint do topo lido", () => {
    const e = Object.assign(new NeonDbError("x"), { constraint: "produtos_destaque_vaga_unique" });
    expect(nomeConstraint(e)).toBe("produtos_destaque_vaga_unique");
  });

  it("constraint no topo de erro que não é NeonDbError é ignorado", () => {
    expect(nomeConstraint(Object.assign(new Error("x"), { constraint: "a" }))).toBeUndefined();
  });

  it("constraint que não é string é ignorado", () => {
    expect(nomeConstraint({ cause: { constraint: 5 } })).toBeUndefined();
  });
});
