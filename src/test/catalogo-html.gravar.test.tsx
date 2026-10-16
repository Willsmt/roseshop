// Feature 006, T001: modo gravação dos fixtures da 005. Só roda com GRAVAR_HTML_005=1
// (uma vez, na T001; os fixtures nunca são regravados depois).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { ARQUIVO_005, CASOS_005, gerarHtml005 } from "./catalogo-html";

describe.skipIf(process.env.GRAVAR_HTML_005 !== "1")("gravar fixtures do HTML da 005", () => {
  it.each(CASOS_005)("grava %s", async (caso) => {
    const html = await gerarHtml005(caso);
    expect(html.length).toBeGreaterThan(0);
    mkdirSync(dirname(ARQUIVO_005[caso]), { recursive: true });
    writeFileSync(ARQUIVO_005[caso], html);
  });
});
