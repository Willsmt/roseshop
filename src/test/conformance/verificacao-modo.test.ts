import fs from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// T026 (TL-17): FOTOS_VERIFICACAO só entra na SF10 (T094a); até lá, proibida
// em qualquer ambiente. Este teste nega por padrão: falha se a chave aparecer
// em qualquer lugar do wrangler.jsonc ou numa linha do .dev.vars.example.

const CHAVE = "FOTOS_VERIFICACAO";
const WRANGLER = "wrangler.jsonc";
const DEV_VARS_EXAMPLE = ".dev.vars.example";

function contemChave(valor: unknown, chave: string): boolean {
  if (Array.isArray(valor)) return valor.some((v) => contemChave(v, chave));
  if (valor !== null && typeof valor === "object") {
    return Object.entries(valor).some(
      ([k, v]) => k === chave || contemChave(v, chave),
    );
  }
  return false;
}

function devVarsDeclara(conteudo: string, chave: string): boolean {
  return new RegExp(`^\\s*(export\\s+)?${chave}\\s*=`, "m").test(conteudo);
}

function lerWrangler(): Record<string, unknown> {
  const texto = fs.readFileSync(WRANGLER, "utf8");
  const { config, error } = ts.parseConfigFileTextToJson(WRANGLER, texto);
  expect(error, "erro de parse do wrangler.jsonc").toBeUndefined();
  return config as Record<string, unknown>;
}

describe("FOTOS_VERIFICACAO fora da configuração até a SF10", () => {
  it("wrangler.jsonc não declara a chave em nenhum ambiente", () => {
    const config = lerWrangler();
    expect(contemChave(config, CHAVE)).toBe(false);
  });

  it("guarda: o parse achou env.dev e env.production", () => {
    const env = lerWrangler().env as Record<string, unknown> | undefined;
    expect(env).toBeDefined();
    expect(env).toHaveProperty("dev");
    expect(env).toHaveProperty("production");
  });

  it(".dev.vars.example não declara a chave", () => {
    if (!fs.existsSync(DEV_VARS_EXAMPLE)) return;
    const conteudo = fs.readFileSync(DEV_VARS_EXAMPLE, "utf8");
    expect(devVarsDeclara(conteudo, CHAVE)).toBe(false);
  });
});

describe("controle: as buscas acham a chave quando ela existe", () => {
  it("contemChave acha a chave num objeto aninhado", () => {
    const sintetico = { env: { dev: { vars: { FOTOS_VERIFICACAO: "registro" } } } };
    expect(contemChave(sintetico, CHAVE)).toBe(true);
  });

  it("contemChave acha a chave dentro de array e no nível de cima", () => {
    expect(contemChave({ itens: [{ a: { FOTOS_VERIFICACAO: 1 } }] }, CHAVE)).toBe(true);
    expect(contemChave({ FOTOS_VERIFICACAO: "x" }, CHAVE)).toBe(true);
  });

  it("contemChave não acha em objeto sem a chave (nem no valor)", () => {
    expect(contemChave({ env: { dev: { vars: { OUTRA: "FOTOS_VERIFICACAO" } } } }, CHAVE)).toBe(
      false,
    );
  });

  it("devVarsDeclara acha a linha, com espaços e com export", () => {
    expect(devVarsDeclara("A=1\nFOTOS_VERIFICACAO=registro\n", CHAVE)).toBe(true);
    expect(devVarsDeclara("  FOTOS_VERIFICACAO = registro", CHAVE)).toBe(true);
    expect(devVarsDeclara("export FOTOS_VERIFICACAO=registro", CHAVE)).toBe(true);
  });

  it("devVarsDeclara ignora comentário e outras chaves", () => {
    expect(devVarsDeclara("# FOTOS_VERIFICACAO=registro\nOUTRA=1", CHAVE)).toBe(false);
  });
});
