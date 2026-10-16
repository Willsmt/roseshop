import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Feature 006, SF1, T010 (research D1): o núcleo da sacola é código puro, importável por componente
// cliente (sem server-only, next, db, auth, r2, barrel do catálogo nem zod cheio).

const DIR = dirname(fileURLToPath(import.meta.url));

// As SFs seguintes acrescentam mensagem.ts, conferencia.ts e armazenamento.ts a esta lista.
const ESPERADOS = ["observacao.ts", "sacola.ts", "total.ts", "textos.ts"];

const PERMITIDOS_EXATOS = new Set(["@/lib/produtos/preco", "@/lib/catalogo/exibicao", "zod/mini"]);

function fontes(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith(".ts") && !/\.test\.tsx?$/.test(f));
}

function importados(codigo: string): string[] {
  const sem = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const achados: string[] = [];
  const padroes = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const p of padroes) for (const m of sem.matchAll(p)) achados.push(m[1]!);
  return achados;
}

function permitido(spec: string, existe: (arquivo: string) => boolean = (a) => existsSync(join(DIR, a))): boolean {
  if (PERMITIDOS_EXATOS.has(spec)) return true;
  const rel = /^\.\/([A-Za-z0-9_-]+)$/.exec(spec);
  return rel !== null && (existe(`${rel[1]}.ts`) || existe(`${rel[1]}.tsx`));
}

describe("fronteira do módulo da sacola", () => {
  it("os arquivos esperados existem", () => {
    const presentes = fontes();
    for (const nome of ESPERADOS) expect(presentes).toContain(nome);
  });

  it.each(ESPERADOS)("%s só importa módulos permitidos", (nome) => {
    const codigo = readFileSync(join(DIR, nome), "utf8");
    const proibidos = importados(codigo).filter((s) => !permitido(s));
    expect(proibidos).toEqual([]);
  });

  it("nenhuma fonte do diretório importa server-only, next, db, auth, r2, o barrel do catálogo ou zod cheio", () => {
    const ruins: string[] = [];
    for (const nome of fontes()) {
      const codigo = readFileSync(join(DIR, nome), "utf8");
      for (const spec of importados(codigo)) {
        if (!permitido(spec)) ruins.push(`${nome}: ${spec}`);
      }
    }
    expect(ruins).toEqual([]);
  });

  it("o detector de importações pega os casos proibidos (sanidade do teste)", () => {
    const codigo = [
      'import "server-only";',
      'import { x } from "@/lib/r2";',
      'const y = await import("@/lib/db/catalogo");',
      'export { z } from "next/headers";',
      'import { c } from "@/lib/catalogo";',
      'import { z } from "zod";',
      'import { m } from "zod/mini";',
      'import { p } from "@/lib/produtos/preco";',
      'import { e } from "@/lib/catalogo/exibicao";',
      'import { o } from "./inexistente";',
      '// import w from "@/lib/auth"',
    ].join("\n");
    const achados = importados(codigo);
    expect(achados).not.toContain("@/lib/auth");
    const nunca = () => false;
    expect(achados.filter((s) => !permitido(s, nunca)).sort()).toEqual(
      ["./inexistente", "@/lib/catalogo", "@/lib/db/catalogo", "@/lib/r2", "next/headers", "server-only", "zod"].sort(),
    );
  });

  it("aceita ./arquivo só quando ele existe no módulo (sanidade do teste)", () => {
    expect(permitido("./x", (a) => a === "x.ts")).toBe(true);
    expect(permitido("./x", () => false)).toBe(false);
    expect(permitido("../x", () => true)).toBe(false);
  });
});
