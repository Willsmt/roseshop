// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Home from "./page";

afterEach(cleanup);

// Cada nó de texto é testado separadamente: `textContent` junta textos de elementos
// vizinhos sem separador ("docsEntrar") e escondia a fronteira de palavra do `\b`.
const PROIBIDO = /\b(entrar|login)\b/i;
const nosComTextoProibido = (container: HTMLElement): string[] => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const achados: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const texto = n.nodeValue ?? "";
    if (PROIBIDO.test(texto)) achados.push(texto);
  }
  return achados;
};

describe("página inicial pública (US5-1, US5-2, FR-011, FR-018)", () => {
  it("não tem links para /painel nem /api/auth (US5-1, FR-018)", () => {
    const { container } = render(<Home />);
    expect(container.querySelectorAll('a[href^="/painel"], a[href^="/api/auth"]')).toHaveLength(0);
  });

  it("nenhum href absoluto aponta para /painel ou /api/auth", () => {
    const { container } = render(<Home />);
    for (const a of container.querySelectorAll("a[href]")) {
      const { pathname } = new URL(a.getAttribute("href") ?? "", "http://localhost");
      expect(pathname).not.toMatch(/^\/(painel|api\/auth)(\/|$)/);
    }
  });

  it("o texto visível não tem 'Entrar' nem 'Login' (US5-2, FR-018)", () => {
    const { container } = render(<Home />);
    expect(nosComTextoProibido(container)).toEqual([]);
  });
});
