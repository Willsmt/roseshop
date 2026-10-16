// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ARQUIVO_005, CASOS_005, gerarHtml005 } from "@/test/catalogo-html";

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
