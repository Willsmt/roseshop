import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { contarEnvios, inserirEnvio, limparEnvios } from "@/test/db/fotos-fixtures";

import {
  descartarEnvio,
  emitirEnvio,
  enviosValidos,
  marcarConfirmado,
  obterEnvio,
  TETO_PENDENTES,
} from "./fotos";

// Feature 004, T043 (SF4): contracts/fotos.md §2.1. Integração com o banco local.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const ana: AdminSession = { email: "ana@teste.local", name: "Ana" };
const bia: AdminSession = { email: "bia@teste.local", name: "Bia" };

const UUID_V4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

async function confirmadoEm(id: string): Promise<string | null | undefined> {
  const r = await db.execute(sql`SELECT confirmado_em::text AS c FROM fotos_envio WHERE id = ${id}::uuid`);
  return (r.rows as { c: string | null }[])[0]?.c;
}

async function existe(id: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 AS x FROM fotos_envio WHERE id = ${id}::uuid`);
  return r.rows.length === 1;
}

beforeEach(() => limparEnvios(db));
afterAll(() => limparEnvios(db));

describe("emitirEnvio", () => {
  it("TETO_PENDENTES é 20", () => {
    expect(TETO_PENDENTES).toBe(20);
  });

  it("insere o envio 'emitido' e devolve a chave .webp", async () => {
    const id = randomUUID();
    const r = await emitirEnvio(db, ana, { id, formato: "webp", tamanho: 4321 });
    expect(r).toEqual({ tipo: "ok", chave: `fotos/${id}.webp` });
    const l = await obterEnvio(db, ana, id);
    expect(l).toMatchObject({
      id,
      formato: "webp",
      chave: `fotos/${id}.webp`,
      tamanho: 4321,
      enviadoPor: ana.email,
      estado: "emitido",
      confirmadoEm: null,
    });
    expect(l?.criadoEm).toBeInstanceOf(Date);
  });

  it("jpeg ⇒ chave .jpg", async () => {
    const id = randomUUID();
    const r = await emitirEnvio(db, ana, { id, formato: "jpeg", tamanho: 10 });
    expect(r).toEqual({ tipo: "ok", chave: `fotos/${id}.jpg` });
    expect(r.tipo === "ok" && r.chave).toMatch(new RegExp(`^fotos/${UUID_V4}\\.jpg$`));
  });

  it("D13: com 20 envios nas últimas 24 h da pessoa, o 21º ⇒ muitos_pendentes e nada é inserido", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await emitirEnvio(db, ana, { id: randomUUID(), formato: "webp", tamanho: 1 })).tipo).toBe("ok");
    }
    expect(await contarEnvios(db)).toBe(20);
    const id = randomUUID();
    expect(await emitirEnvio(db, ana, { id, formato: "webp", tamanho: 1 })).toEqual({ tipo: "muitos_pendentes" });
    expect(await contarEnvios(db)).toBe(20);
    expect(await existe(id)).toBe(false);
  });

  it("envios com mais de 24 h não contam para o teto", async () => {
    for (let i = 0; i < 20; i++) {
      await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido", idadeHoras: 25 });
    }
    const r = await emitirEnvio(db, ana, { id: randomUUID(), formato: "webp", tamanho: 1 });
    expect(r.tipo).toBe("ok");
  });

  it("19 recentes + 1 antigo: o próximo ainda é aceito; o seguinte (20 recentes) é recusado", async () => {
    for (let i = 0; i < 19; i++) await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido", idadeHoras: 30 });
    expect((await emitirEnvio(db, ana, { id: randomUUID(), formato: "webp", tamanho: 1 })).tipo).toBe("ok");
    expect((await emitirEnvio(db, ana, { id: randomUUID(), formato: "webp", tamanho: 1 })).tipo).toBe(
      "muitos_pendentes",
    );
  });

  it("outra pessoa não é afetada pelo teto de ana", async () => {
    for (let i = 0; i < 20; i++) await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    expect((await emitirEnvio(db, ana, { id: randomUUID(), formato: "webp", tamanho: 1 })).tipo).toBe(
      "muitos_pendentes",
    );
    expect((await emitirEnvio(db, bia, { id: randomUUID(), formato: "webp", tamanho: 1 })).tipo).toBe("ok");
  });
});

describe("obterEnvio", () => {
  it("devolve a linha da própria pessoa", async () => {
    const e = await inserirEnvio(db, { enviadoPor: ana.email, estado: "confirmado", formato: "jpeg", tamanho: 77 });
    const l = await obterEnvio(db, ana, e.id);
    expect(l).toMatchObject({
      id: e.id,
      formato: "jpeg",
      chave: e.chave,
      tamanho: 77,
      enviadoPor: ana.email,
      estado: "confirmado",
    });
    expect(l?.confirmadoEm).toBeInstanceOf(Date);
  });

  it("filtra por enviado_por: envio de outra pessoa ⇒ undefined", async () => {
    const e = await inserirEnvio(db, { enviadoPor: bia.email, estado: "emitido" });
    expect(await obterEnvio(db, ana, e.id)).toBeUndefined();
    expect(await obterEnvio(db, bia, e.id)).toBeDefined();
  });

  it("id inexistente ⇒ undefined", async () => {
    expect(await obterEnvio(db, ana, randomUUID())).toBeUndefined();
  });
});

describe("marcarConfirmado", () => {
  it("emitido ⇒ confirmado, true, e preenche confirmado_em", async () => {
    const e = await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    expect(await confirmadoEm(e.id)).toBeNull();
    expect(await marcarConfirmado(db, ana, e.id)).toBe(true);
    const l = await obterEnvio(db, ana, e.id);
    expect(l?.estado).toBe("confirmado");
    expect(l?.confirmadoEm).toBeInstanceOf(Date);
  });

  it("idempotente no SQL: segunda chamada ⇒ false e confirmado_em inalterado", async () => {
    const e = await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    expect(await marcarConfirmado(db, ana, e.id)).toBe(true);
    const antes = await confirmadoEm(e.id);
    expect(antes).toBeTruthy();
    expect(await marcarConfirmado(db, ana, e.id)).toBe(false);
    expect(await confirmadoEm(e.id)).toBe(antes);
  });

  it("envio de outra pessoa ⇒ false e continua emitido", async () => {
    const e = await inserirEnvio(db, { enviadoPor: bia.email, estado: "emitido" });
    expect(await marcarConfirmado(db, ana, e.id)).toBe(false);
    expect((await obterEnvio(db, bia, e.id))?.estado).toBe("emitido");
  });

  it("id inexistente ⇒ false", async () => {
    expect(await marcarConfirmado(db, ana, randomUUID())).toBe(false);
  });
});

describe("descartarEnvio", () => {
  it("apaga o 'emitido' da própria pessoa e devolve a chave", async () => {
    const e = await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    expect(await descartarEnvio(db, ana, e.id)).toBe(e.chave);
    expect(await existe(e.id)).toBe(false);
  });

  it("'confirmado' ⇒ undefined e a linha fica", async () => {
    const e = await inserirEnvio(db, { enviadoPor: ana.email, estado: "confirmado" });
    expect(await descartarEnvio(db, ana, e.id)).toBeUndefined();
    expect(await existe(e.id)).toBe(true);
  });

  it("envio de outra pessoa ⇒ undefined e a linha fica", async () => {
    const e = await inserirEnvio(db, { enviadoPor: bia.email, estado: "emitido" });
    expect(await descartarEnvio(db, ana, e.id)).toBeUndefined();
    expect(await existe(e.id)).toBe(true);
  });

  it("id inexistente ⇒ undefined", async () => {
    expect(await descartarEnvio(db, ana, randomUUID())).toBeUndefined();
  });
});

describe("enviosValidos", () => {
  it("devolve só ids da pessoa, confirmados e com menos de 24 h (mistura de estados)", async () => {
    const valido1 = await inserirEnvio(db, { enviadoPor: ana.email, estado: "confirmado", idadeHoras: 0 });
    const valido2 = await inserirEnvio(db, { enviadoPor: ana.email, estado: "confirmado", idadeHoras: 23 });
    const alheio = await inserirEnvio(db, { enviadoPor: bia.email, estado: "confirmado" });
    const emitido = await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    const expirado = await inserirEnvio(db, { enviadoPor: ana.email, estado: "confirmado", idadeHoras: 25 });
    const inexistente = randomUUID();

    const r = await enviosValidos(db, ana, [
      valido1.id,
      valido2.id,
      alheio.id,
      emitido.id,
      expirado.id,
      inexistente,
    ]);
    expect(r).toBeInstanceOf(Set);
    expect([...r].sort()).toEqual([valido1.id, valido2.id].sort());
  });

  it("lista vazia ⇒ conjunto vazio", async () => {
    expect((await enviosValidos(db, ana, [])).size).toBe(0);
  });
});
