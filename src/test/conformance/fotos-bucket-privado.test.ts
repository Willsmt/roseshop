import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// Feature 005, T041a (US6.5, FR-016): o bucket de fotos é privado. Só o repositório é conferido;
// acesso público r2.dev e domínio do bucket ficam na conferência manual do quickstart §1.5.

const RAIZ = process.cwd();

function lerJsonc(arquivo: string): unknown {
  const texto = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
  const { config, error } = ts.parseConfigFileTextToJson(arquivo, texto);
  expect(error, `${arquivo} não é JSONC válido`).toBeUndefined();
  return config;
}

// Todos os pares [caminho, valor] de objetos e arrays, em qualquer nível.
function percorrer(v: unknown, caminho = "$"): [string, unknown][] {
  const out: [string, unknown][] = [[caminho, v]];
  if (Array.isArray(v)) {
    v.forEach((x, i) => out.push(...percorrer(x, `${caminho}[${i}]`)));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) out.push(...percorrer(x, `${caminho}.${k}`));
  }
  return out;
}

const arquivosCors = fs
  .readdirSync(path.join(RAIZ, "infra/r2"))
  .filter((f) => /^cors\..+\.json$/.test(f))
  .map((f) => `infra/r2/${f}`);

describe("CORS dos buckets (T041a)", () => {
  it("existe ao menos um cors.*.json", () => {
    expect(arquivosCors.length).toBeGreaterThan(0);
  });

  it.each(arquivosCors)("%s só permite PUT e nenhuma origem *", (arquivo) => {
    const cfg = lerJsonc(arquivo) as {
      rules?: { allowed?: { origins?: string[]; methods?: string[] } }[];
    };
    expect(cfg.rules?.length ?? 0).toBeGreaterThan(0);
    for (const regra of cfg.rules ?? []) {
      expect(regra.allowed?.methods).toEqual(["PUT"]);
      expect(regra.allowed?.origins?.length ?? 0).toBeGreaterThan(0);
      for (const o of regra.allowed?.origins ?? []) expect(o).not.toContain("*");
    }
  });
});

describe("wrangler.jsonc (T041a)", () => {
  const cfg = lerJsonc("wrangler.jsonc");
  const nos = percorrer(cfg);

  it("não declara routes, route nem custom_domain em nenhum nível", () => {
    const proibidos = nos
      .map(([c]) => c)
      .filter((c) => /\.(routes?|custom_domain)$/.test(c));
    expect(proibidos).toEqual([]);
  });

  it("todo r2_buckets tem só o binding PRODUCT_IMAGES", () => {
    const listas = nos.filter(([c]) => /\.r2_buckets$/.test(c));
    expect(listas.length).toBeGreaterThanOrEqual(3); // local, dev e production
    for (const [caminho, lista] of listas) {
      expect(Array.isArray(lista), caminho).toBe(true);
      const bindings = (lista as { binding?: string }[]).map((b) => b.binding);
      expect(bindings, caminho).toEqual(["PRODUCT_IMAGES"]);
    }
  });
});
