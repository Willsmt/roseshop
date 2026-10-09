import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Feature 004, SF8: o pipeline do aparelho é código de navegador puro (sem server-only, db, r2, auth, next).

const DIR = dirname(fileURLToPath(import.meta.url));

const ESPERADOS = ["detectar-tipo.ts", "recortar.ts", "codificar.ts", "preparar-foto.ts", "suporta-webp.ts"];

const PERMITIDOS_ABSOLUTOS = new Set(["@/lib/fotos/mensagens", "@/lib/fotos/tipos"]);
const PERMITIDOS_PAI = new Set(["../mensagens", "../tipos"]);

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

function permitido(spec: string): boolean {
  if (PERMITIDOS_ABSOLUTOS.has(spec) || PERMITIDOS_PAI.has(spec)) return true;
  // caminho relativo do próprio diretório: "./x", sem subir
  return /^\.\/[A-Za-z0-9_.-]+$/.test(spec);
}

describe("fronteira do pipeline do aparelho", () => {
  it("os 5 arquivos esperados existem", () => {
    const presentes = fontes();
    for (const nome of ESPERADOS) expect(presentes).toContain(nome);
  });

  it.each(ESPERADOS)("%s só importa módulos permitidos", (nome) => {
    const codigo = readFileSync(join(DIR, nome), "utf8");
    const proibidos = importados(codigo).filter((s) => !permitido(s));
    expect(proibidos).toEqual([]);
  });

  it("nenhuma fonte do diretório importa server-only, r2, db, auth ou next", () => {
    const ruins: string[] = [];
    for (const nome of fontes()) {
      const codigo = readFileSync(join(DIR, nome), "utf8");
      for (const spec of importados(codigo)) {
        if (
          spec === "server-only" ||
          spec.startsWith("@/lib/r2") ||
          spec.startsWith("@/lib/db") ||
          spec.startsWith("@/lib/auth") ||
          spec === "next" ||
          spec.startsWith("next/") ||
          !permitido(spec)
        ) {
          ruins.push(`${nome}: ${spec}`);
        }
      }
    }
    expect(ruins).toEqual([]);
  });

  it("o detector de importações pega os casos proibidos (sanidade do teste)", () => {
    const codigo = [
      'import "server-only";',
      'import { x } from "@/lib/r2";',
      'const y = await import("@/lib/db/fotos");',
      'export { z } from "next/headers";',
      '// import w from "@/lib/auth"',
    ].join("\n");
    const achados = importados(codigo);
    expect([...achados].sort()).toEqual(["@/lib/db/fotos", "@/lib/r2", "next/headers", "server-only"]);
    expect(achados.filter((s) => !permitido(s)).sort()).toEqual(["@/lib/db/fotos", "@/lib/r2", "next/headers", "server-only"]);
  });
});
