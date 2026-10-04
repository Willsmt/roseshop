import { describe, expect, it } from "vitest";

import { codigoSqlstate } from "./erros-pg";

const embrulhado = (code?: unknown) =>
  Object.assign(new Error("Failed query"), {
    cause: Object.assign(new Error("dup"), code === undefined ? {} : { code }),
  });

describe("codigoSqlstate (decisão 3: só error.cause.code)", () => {
  it.each(["23505", "23503"])("lê %s de cause.code", (code) => {
    expect(codigoSqlstate(embrulhado(code))).toBe(code);
  });

  it("code sozinho, sem cause, é ignorado", () => {
    expect(codigoSqlstate(Object.assign(new Error("x"), { code: "23505" }))).toBeUndefined();
  });

  it("code no topo é ignorado mesmo com cause sem code", () => {
    const e = Object.assign(new Error("x"), { code: "23505", cause: new Error("y") });
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
