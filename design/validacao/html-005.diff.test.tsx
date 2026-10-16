// @vitest-environment jsdom
// Fase 5 do redesenho: gera o HTML do servidor que os fixtures da 005 cobririam, para comparar com
// os fixtures atuais SEM regravá-los. Escreve só em HTML_005_SAIDA (fora do repositório).
// Rodar: HTML_005_SAIDA=<pasta> npx vitest run --config design/validacao/vitest.html-005.config.mts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CASOS_005, gerarHtml005 } from "@/test/catalogo-html";

const saida = process.env.HTML_005_SAIDA;

describe("HTML novo da 005 (só leitura dos fixtures)", () => {
  it.each(CASOS_005)("%s", async (caso) => {
    expect(saida, "defina HTML_005_SAIDA").toBeTruthy();
    writeFileSync(join(saida!, `${caso}.novo.html`), await gerarHtml005(caso));
  });
});
