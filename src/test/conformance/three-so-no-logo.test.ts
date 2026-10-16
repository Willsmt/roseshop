import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Fase 7 (ADR-005): o three existe só na cena do logo da página inicial, e essa cena entra só por
// import() dinâmico. Nem o painel nem outra tela do catálogo importam o pacote.

const RAIZ = join(process.cwd(), "src");
const CENA = "app/(public)/_catalogo/logo-3d/cena.ts";

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

const IMPORTA_THREE = /from\s+["']three(\/[^"']*)?["']|import\(\s*["']three/;

describe("three só no logo 3D", () => {
  it("só a cena do logo importa o pacote three", () => {
    const quem = arquivos(RAIZ)
      .filter((f) => IMPORTA_THREE.test(readFileSync(f, "utf8")))
      .map((f) => relative(RAIZ, f));
    expect(quem).toEqual([CENA]);
  });

  it("a cena não usa examples, addons nem loaders", () => {
    const fonte = readFileSync(join(RAIZ, CENA), "utf8");
    expect(fonte).not.toMatch(/three\/(examples|addons)/);
    expect(fonte).not.toMatch(/Loader\b/);
  });

  it("a cena só entra por import() dinâmico; os demais só importam o tipo", () => {
    const estatico = /^import\s+(?!type\b)[^;]*from\s+["'][^"']*logo-3d\/cena["']/m;
    const quem = arquivos(RAIZ)
      .filter((f) => estatico.test(readFileSync(f, "utf8")))
      .map((f) => relative(RAIZ, f));
    expect(quem).toEqual([]);
  });
});
