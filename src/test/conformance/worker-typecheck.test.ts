import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// T112 (TL-6): o typecheck não pode depender de .open-next/ existir. Verificação estática
// (a comparação real com e sem o diretório é feita à parte, com output real).

function lerJsonc(arquivo: string): Record<string, unknown> {
  const texto = fs.readFileSync(arquivo, "utf8");
  const { config, error } = ts.parseConfigFileTextToJson(arquivo, texto);
  expect(error, `erro de parse de ${arquivo}`).toBeUndefined();
  return config as Record<string, unknown>;
}

const WORKER = "cloudflare/worker.ts";
const DTS = "cloudflare/open-next-worker.d.ts";
const CRON = ["0 6 * * *"];

describe("worker e typecheck independentes do build (T112, TL-6)", () => {
  it("tsconfig.json exclui .open-next", () => {
    const tsconfig = lerJsonc("tsconfig.json");
    expect(tsconfig.exclude as string[]).toContain(".open-next");
  });

  it("cloudflare/worker.ts importa o worker só por 'open-next-worker'", () => {
    const fonte = fs.readFileSync(WORKER, "utf8");
    const sf = ts.createSourceFile(WORKER, fonte, ts.ScriptTarget.Latest, true);
    const especificadores: string[] = [];
    sf.forEachChild((n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        especificadores.push(n.moduleSpecifier.text);
      }
    });
    expect(especificadores).toContain("open-next-worker");
    expect(especificadores.filter((e) => e.includes(".open-next"))).toEqual([]);
  });

  it("nenhum @ts-expect-error / @ts-ignore / @ts-nocheck em cloudflare/", () => {
    const arquivos = fs
      .readdirSync("cloudflare", { recursive: true })
      .map(String)
      .filter((f) => /\.(ts|tsx|mts)$/.test(f) && !/\.test\.ts$/.test(f));
    expect(arquivos.length).toBeGreaterThan(0);
    for (const f of arquivos) {
      const fonte = fs.readFileSync(path.join("cloudflare", f), "utf8");
      expect(fonte, f).not.toMatch(/@ts-(expect-error|ignore|nocheck)/);
    }
  });

  it("cloudflare/open-next-worker.d.ts declara o módulo 'open-next-worker'", () => {
    expect(fs.readFileSync(DTS, "utf8")).toMatch(
      /declare\s+module\s+["']open-next-worker["']/,
    );
  });

  it("wrangler.jsonc: main, alias e cron (topo, env.dev e env.production)", () => {
    const w = lerJsonc("wrangler.jsonc") as {
      main?: string;
      alias?: Record<string, string>;
      triggers?: { crons?: string[] };
      env?: Record<string, { triggers?: { crons?: string[] } }>;
    };
    expect(w.main).toBe("cloudflare/worker.ts");
    expect(w.alias?.["open-next-worker"]).toBe("./.open-next/worker.js");
    expect(w.triggers?.crons, "topo").toEqual(CRON);
    expect(w.env?.dev?.triggers?.crons, "env.dev").toEqual(CRON);
    expect(w.env?.production?.triggers?.crons, "env.production").toEqual(CRON);
  });
});
