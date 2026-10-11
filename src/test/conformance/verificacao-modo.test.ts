import fs from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// T026 (TL-17) + T094a: durante a SF10, FOTOS_VERIFICACAO existe só em
// env.dev.vars, com o valor exato "registro". Fora dali o teste nega por padrão:
// falha se a chave aparecer em qualquer outro lugar do wrangler.jsonc (nível de
// cima, env.production, outro ambiente, env.dev fora de vars) ou numa linha do
// .dev.vars.example. A T099 volta à proibição total.

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

// Cópia da config sem env.dev.vars.FOTOS_VERIFICACAO (o único lugar permitido).
function semPermitida(config: Record<string, unknown>, chave: string): unknown {
  const copia = structuredClone(config) as {
    env?: { dev?: { vars?: Record<string, unknown> } };
  };
  if (copia.env?.dev?.vars) delete copia.env.dev.vars[chave];
  return copia;
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

describe("FOTOS_VERIFICACAO só em env.dev.vars durante a SF10", () => {
  it('env.dev.vars declara a chave com o valor exato "registro"', () => {
    const env = lerWrangler().env as { dev?: { vars?: Record<string, unknown> } } | undefined;
    expect(env?.dev?.vars?.[CHAVE]).toBe("registro");
  });

  it("wrangler.jsonc não declara a chave em nenhum outro lugar", () => {
    const config = lerWrangler();
    expect(contemChave(semPermitida(config, CHAVE), CHAVE)).toBe(false);
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

  it("semPermitida só tira a chave de env.dev.vars", () => {
    const permitida = { env: { dev: { vars: { FOTOS_VERIFICACAO: "registro", OUTRA: 1 } } } };
    expect(contemChave(semPermitida(permitida, CHAVE), CHAVE)).toBe(false);
    expect(permitida.env.dev.vars.FOTOS_VERIFICACAO).toBe("registro");

    const proibidas = [
      { vars: { FOTOS_VERIFICACAO: "registro" } },
      { env: { production: { vars: { FOTOS_VERIFICACAO: "registro" } } } },
      { env: { outro: { vars: { FOTOS_VERIFICACAO: "registro" } } } },
      { env: { dev: { FOTOS_VERIFICACAO: "registro" } } },
      { env: { dev: { vars: { FOTOS_VERIFICACAO: "registro" }, x: { FOTOS_VERIFICACAO: 1 } } } },
    ];
    for (const config of proibidas) {
      expect(contemChave(semPermitida(config, CHAVE), CHAVE)).toBe(true);
    }
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
