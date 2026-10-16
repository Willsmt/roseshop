// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CHAVE } from "@/lib/sacola/armazenamento";
import { ARQUIVO_005, CASOS_005, gerarHtml005, gerarHtmlSacola } from "@/test/catalogo-html";

// Feature 006, T002 (US4, SC-005): o HTML do servidor da 005 não muda, exceto pelos elementos
// [data-sacola]. Fixture e saída passam pelo mesmo parser; só a saída perde os [data-sacola].
// Este teste só compara: nunca grava. Fixture ausente falha (readFileSync lança).

const corpo = (html: string, tirarSacola: boolean): string => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (tirarSacola) for (const el of doc.querySelectorAll("[data-sacola]")) el.remove();
  return doc.body.innerHTML;
};

describe("HTML do servidor igual ao da 005 (SC-005)", () => {
  it.each(CASOS_005)("%s: igual ao fixture sem os [data-sacola]", async (caso) => {
    const fixture = readFileSync(ARQUIVO_005[caso], "utf8");
    const saida = await gerarHtml005(caso);
    expect(corpo(saida, true)).toBe(corpo(fixture, false));
  });
});

// Feature 006, SF6 (US4.6, FR-002a, FR-009): sem JavaScript, a /sacola tem só o aviso do <noscript>
// e o caminho de volta; nada da sacola nem do estado do armazenamento vem do servidor.
describe("/sacola sem JavaScript", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  const conferir = (html: string) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const noscript = doc.querySelector("main noscript");
    expect(noscript?.innerHTML).toContain("Ative o JavaScript para usar a sacola");
    const dentro = new DOMParser().parseFromString(noscript?.innerHTML ?? "", "text/html");
    expect(dentro.querySelector("a")?.getAttribute("href")).toBe("/");
    expect(dentro.querySelector("a")?.textContent).toBe("Ver o catálogo");
    for (const el of doc.querySelectorAll("noscript")) el.remove();
    for (const el of doc.querySelectorAll("[data-sacola]")) expect(el.innerHTML).toBe("");
    expect(doc.body.textContent).toBe("");
    for (const texto of ["Sacola", "Não foi possível abrir", "Sua sacola", "Conferindo", "Enviar pedido", "wa.me"]) {
      expect(html).not.toContain(texto);
    }
  };

  it("com sacola gravada no aparelho", async () => {
    window.localStorage.setItem(
      CHAVE,
      JSON.stringify({ v: 1, t: Date.now(), i: [{ c: "0042", q: 2, p: 600, a: false }] }),
    );
    conferir(await gerarHtmlSacola());
  });

  it("com o armazenamento bloqueado", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    conferir(await gerarHtmlSacola());
  });
});
