import { describe, expect, it, vi } from "vitest";

import { createDb } from "./client";
import { checkDb, checkDbFromEnv } from "./health";

describe("createDb", () => {
  it("recusa iniciar sem DATABASE_URL", () => {
    expect(() => createDb({ DATABASE_URL: "" })).toThrow("DATABASE_URL não configurada");
  });
});

describe("checkDb", () => {
  it("retorna true quando a consulta funciona", async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }) };
    await expect(checkDb(db as never)).resolves.toBe(true);
  });

  it("retorna false e não vaza a mensagem do erro quando a consulta falha", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { execute: vi.fn().mockRejectedValue(new Error("password=segredo host=x")) };

    await expect(checkDb(db as never)).resolves.toBe(false);

    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("segredo");
    expect(logged).toContain("Error");
    spy.mockRestore();
  });
});

describe("checkDbFromEnv", () => {
  it("retorna false (sem lançar) quando DATABASE_URL está ausente", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(checkDbFromEnv({ DATABASE_URL: "" })).resolves.toBe(false);
    expect(spy).toHaveBeenCalledWith("[health] configuração do banco ausente ou inválida");
    spy.mockRestore();
  });
});
