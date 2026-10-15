import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ajustarResposta } from "../../../cloudflare/publico";
import {
  NAVEGADOR_FOTOS_S,
  NAVEGADOR_LISTA_S,
  NAVEGADOR_PAGINA_S,
} from "../../lib/catalogo/prazos";

// T053a (K1; FR-020, SC-005, US5.4, US6.3), ramo FALLBACK: o orçamento de 60 s é a soma do que o
// navegador guarda; sem ISR, o servidor não guarda nada. A SF7 e a SF8 acrescentam o literal
// `revalidate` das páginas.
const RAIZ = join(__dirname, "../../..");

const max = (cc: string | null) => Number(/max-age=(\d+)/.exec(cc ?? "")?.[1]);

describe("orçamento de 60 s (prazos.ts)", () => {
  it("páginas, lista e fotos guardam no navegador no máximo 60 s", () => {
    expect(NAVEGADOR_PAGINA_S).toBeLessThanOrEqual(60);
    expect(NAVEGADOR_LISTA_S).toBeLessThanOrEqual(60);
    expect(NAVEGADOR_FOTOS_S).toBeLessThanOrEqual(60);
  });

  it("os valores são os do contrato: 60 / 20 / 60", () => {
    expect([NAVEGADOR_PAGINA_S, NAVEGADOR_LISTA_S, NAVEGADOR_FOTOS_S]).toEqual([60, 20, 60]);
  });

  it("o max-age que o worker aplica a / e /p/* é NAVEGADOR_PAGINA_S", () => {
    for (const caminho of ["/", "/p/0042"]) {
      const r = ajustarResposta(caminho, new Response(null, { status: 200 }), null);
      expect(max(r.headers.get("cache-control"))).toBe(NAVEGADOR_PAGINA_S);
    }
  });

  it("o next.config.ts não tem expireTime (sem ISR, sem cache de servidor)", () => {
    const fonte = readFileSync(join(RAIZ, "next.config.ts"), "utf8");
    expect(fonte).not.toMatch(/expireTime/);
  });

  it("os route handlers usam os prazos de prazos.ts, sem literal próprio", () => {
    const lista = readFileSync(join(RAIZ, "src/app/api/catalogo/produtos/route.ts"), "utf8");
    const fotos = readFileSync(join(RAIZ, "src/app/fotos/[arquivo]/route.ts"), "utf8");
    expect(lista).toMatch(/NAVEGADOR_LISTA_S/);
    expect(lista).not.toMatch(/max-age=\d/);
    expect(fotos).toMatch(/NAVEGADOR_FOTOS_S/);
    expect(fotos).not.toMatch(/max-age=\d/);
  });
});

// T061 [FALLBACK]: sem ISR, a página do detalhe é dinâmica e não guarda nada no servidor.
describe("detalhe sem cache de servidor (T061, FALLBACK)", () => {
  const fonte = () => readFileSync(join(RAIZ, "src/app/(public)/p/[codigo]/page.tsx"), "utf8");

  it('exporta dynamic = "force-dynamic"', () => {
    expect(fonte()).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  });

  it("não exporta revalidate", () => {
    expect(fonte()).not.toMatch(/\brevalidate\b/);
  });
});

// T068 [FALLBACK]: a página inicial também é dinâmica e não guarda nada no servidor.
describe("página inicial sem cache de servidor (T068, FALLBACK)", () => {
  const fonte = () => readFileSync(join(RAIZ, "src/app/(public)/page.tsx"), "utf8");

  it('exporta dynamic = "force-dynamic"', () => {
    expect(fonte()).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  });

  it("não exporta revalidate", () => {
    expect(fonte()).not.toMatch(/\brevalidate\b/);
  });
});
