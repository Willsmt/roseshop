// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHAVE } from "@/lib/sacola/armazenamento";

import LayoutPublico from "./layout";

// Feature 006, SF5, T047 (CT§1, FR-002a, US4.6, SC-005): o único acréscimo do layout é o espaço
// reservado do cabeçalho, vazio no HTML do servidor. A altura fixa (h-12) evita o salto da tela.

const ESPACO = '<div data-sacola="cabecalho" class="mx-auto flex h-12 max-w-xl justify-end px-4"></div>';

describe("layout público com o espaço da sacola", () => {
  it("tem o espaço do cabeçalho vazio, antes do conteúdo", () => {
    window.localStorage.setItem(
      CHAVE,
      JSON.stringify({ v: 1, t: Date.now(), i: [{ c: "0042", q: 1, p: 600, a: false }] }),
    );
    const html = renderToStaticMarkup(
      <LayoutPublico>
        <main>conteúdo</main>
      </LayoutPublico>,
    );
    expect(html).toBe(`${ESPACO}<main>conteúdo</main>`);
    window.localStorage.clear();
  });

  it("nenhum texto da sacola no HTML do servidor (FR-002a, US4.6)", () => {
    const html = renderToStaticMarkup(
      <LayoutPublico>
        <main />
      </LayoutPublico>,
    );
    expect(html).not.toContain("Sacola,");
    expect(html).not.toContain("/sacola");
  });
});
