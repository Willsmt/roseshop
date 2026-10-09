import { describe, expect, it } from "vitest";

import {
  FLAG_ICC,
  TAGS_ICC_PERMITIDAS,
  iccEmPedacos,
  iccp,
  jpegValido,
  perfilIcc,
  vp8,
  vp8x,
  riff,
  webpValido,
} from "./fixtures";
import { ICC_LIMITE_BYTES, verificarIcc } from "./icc";
import { verificarImagem } from "./index";

// T023 (FR-006): perfil ICC só com tags de cor (lista de permitidos), até 8 KB.
// verificarIcc direto + embutido em JPEG (APP2) e WebP (ICCP).

describe("verificarIcc direto", () => {
  it("o limite é 8192 bytes", () => {
    expect(ICC_LIMITE_BYTES).toBe(8192);
  });

  it("perfil com as 13 tags permitidas => ok", () => {
    expect(TAGS_ICC_PERMITIDAS).toHaveLength(13);
    expect(verificarIcc(perfilIcc())).toBe("ok");
  });

  it.each(TAGS_ICC_PERMITIDAS)("tag permitida %s sozinha => ok", (tag) => {
    expect(verificarIcc(perfilIcc({ tags: [tag] }))).toBe("ok");
  });

  it("perfil sem nenhuma tag (132 bytes) => ok", () => {
    expect(verificarIcc(perfilIcc({ tags: [] }))).toBe("ok");
  });

  it.each(["dmnd", "dmdd", "meta", "ZXYZ", "APPL"])("tag %s => metadado", (tag) => {
    expect(verificarIcc(perfilIcc({ tags: ["wtpt", tag] }))).toBe("metadado");
  });

  it("perfil com exatamente 8192 bytes e só tags permitidas => ok", () => {
    const perfil = perfilIcc({ tamanhoFinal: 8192 });
    expect(perfil.length).toBe(8192);
    expect(verificarIcc(perfil)).toBe("ok");
  });

  it("perfil com 8193 bytes => metadado", () => {
    const perfil = perfilIcc({ tamanhoFinal: 8193 });
    expect(perfil.length).toBe(8193);
    expect(verificarIcc(perfil)).toBe("metadado");
  });

  it("perfil muito grande (20000 bytes) => metadado", () => {
    expect(verificarIcc(perfilIcc({ tamanhoFinal: 20000 }))).toBe("metadado");
  });

  it("vazio => corrompida", () => {
    expect(verificarIcc(new Uint8Array(0))).toBe("corrompida");
  });

  it("131 bytes (menor que o cabeçalho + contagem) => corrompida", () => {
    expect(verificarIcc(new Uint8Array(131))).toBe("corrompida");
  });

  it("tamanho declarado menor que o real => corrompida", () => {
    const perfil = perfilIcc();
    expect(verificarIcc(perfilIcc({ tamanhoDeclarado: perfil.length - 1 }))).toBe("corrompida");
  });

  it("tamanho declarado maior que o real => corrompida", () => {
    const perfil = perfilIcc();
    expect(verificarIcc(perfilIcc({ tamanhoDeclarado: perfil.length + 1 }))).toBe("corrompida");
  });

  it("sem acsp nos bytes 36-39 => corrompida", () => {
    expect(verificarIcc(perfilIcc({ semAcsp: true }))).toBe("corrompida");
  });

  it("tabela de tags estourando o perfil => corrompida", () => {
    expect(verificarIcc(perfilIcc({ contagemDeclarada: 1000 }))).toBe("corrompida");
  });

  it("contagem de tags enorme (u32 máximo) => corrompida", () => {
    expect(verificarIcc(perfilIcc({ contagemDeclarada: 0xffffffff }))).toBe("corrompida");
  });

  it("tag com offset+tamanho além do perfil => corrompida", () => {
    expect(verificarIcc(perfilIcc({ primeiraEntrada: { offset: 100000, tamanho: 8 } }))).toBe(
      "corrompida",
    );
  });

  it("tag com tamanho que ultrapassa o fim => corrompida", () => {
    expect(verificarIcc(perfilIcc({ primeiraEntrada: { tamanho: 100000 } }))).toBe("corrompida");
  });

  it("offset e tamanho que estouram u32 ao somar => corrompida", () => {
    expect(
      verificarIcc(perfilIcc({ primeiraEntrada: { offset: 0xfffffff0, tamanho: 0x20 } })),
    ).toBe("corrompida");
  });

  it("estrutura corrompida vence metadado (tag proibida sem acsp)", () => {
    expect(verificarIcc(perfilIcc({ tags: ["dmnd"], semAcsp: true }))).toBe("corrompida");
  });

  it("estrutura corrompida vence tamanho acima de 8 KB", () => {
    expect(verificarIcc(perfilIcc({ tamanhoFinal: 9000, semAcsp: true }))).toBe("corrompida");
    expect(verificarIcc(perfilIcc({ tamanhoFinal: 9000, tamanhoDeclarado: 9001 }))).toBe(
      "corrompida",
    );
  });
});

describe("ICC embutido em JPEG (APP2)", () => {
  const jpeg = (antes: Uint8Array[]) =>
    verificarImagem(jpegValido({ antes }), { declarado: "jpeg", modo: "recusar" });

  it("perfil com as 13 tags => ok", () => {
    expect(jpeg(iccEmPedacos(perfilIcc(), 1))).toMatchObject({ ok: true });
  });

  it.each(["dmnd", "dmdd", "meta", "ZXYZ"])("tag %s => metadado, listada em blocos", (tag) => {
    const r = jpeg(iccEmPedacos(perfilIcc({ tags: ["wtpt", tag] }), 1));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain(`ICC:${tag}`);
  });

  it("tag com caractere fora de [A-Za-z0-9 ] vira ? no nome do bloco", () => {
    const r = jpeg(iccEmPedacos(perfilIcc({ tags: ["a/b!"] }), 1));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain("ICC:a?b?");
  });

  it("tag proibida repetida aparece uma vez em blocos", () => {
    const r = jpeg(iccEmPedacos(perfilIcc({ tags: ["dmnd", "dmnd"] }), 1));
    expect(r.blocos.filter((b) => b === "ICC:dmnd")).toHaveLength(1);
  });

  it("perfil acima de 8 KB => metadado", () => {
    expect(jpeg(iccEmPedacos(perfilIcc({ tamanhoFinal: 8193 }), 1))).toMatchObject({
      ok: false,
      motivo: "metadado",
    });
  });

  it("perfil com exatamente 8192 bytes => ok", () => {
    expect(jpeg(iccEmPedacos(perfilIcc({ tamanhoFinal: 8192 }), 1))).toMatchObject({ ok: true });
  });

  it("perfil com 8193 bytes montado em 3 pedaços => metadado", () => {
    expect(jpeg(iccEmPedacos(perfilIcc({ tamanhoFinal: 8193 }), 3))).toMatchObject({
      ok: false,
      motivo: "metadado",
    });
  });

  it.each([
    ["sem acsp", perfilIcc({ semAcsp: true })],
    ["tamanho declarado diferente do real", perfilIcc({ tamanhoDeclarado: 999 })],
    ["tabela estourando", perfilIcc({ contagemDeclarada: 1000 })],
    ["tag fora do perfil", perfilIcc({ primeiraEntrada: { offset: 100000 } })],
  ])("perfil corrompido (%s) => corrompida", (_n, perfil) => {
    expect(jpeg(iccEmPedacos(perfil, 1))).toMatchObject({ ok: false, motivo: "corrompida" });
  });
});

describe("ICC embutido em WebP (ICCP)", () => {
  const webp = (perfil: Uint8Array) =>
    verificarImagem(
      webpValido({ flags: FLAG_ICC, antes: [iccp(perfil)] }),
      { declarado: "webp", modo: "recusar" },
    );

  it("perfil com as 13 tags => ok", () => {
    expect(webp(perfilIcc())).toMatchObject({ ok: true });
  });

  it.each(["dmnd", "dmdd", "meta", "ZXYZ"])("tag %s => metadado, listada em blocos", (tag) => {
    const r = webp(perfilIcc({ tags: ["wtpt", tag] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain(`ICC:${tag}`);
  });

  it("perfil acima de 8 KB => metadado", () => {
    expect(webp(perfilIcc({ tamanhoFinal: 8193 }))).toMatchObject({ ok: false, motivo: "metadado" });
  });

  it("perfil com exatamente 8192 bytes => ok", () => {
    expect(webp(perfilIcc({ tamanhoFinal: 8192 }))).toMatchObject({ ok: true });
  });

  it.each([
    ["sem acsp", perfilIcc({ semAcsp: true })],
    ["tamanho declarado diferente do real", perfilIcc({ tamanhoDeclarado: 999 })],
    ["tabela estourando", perfilIcc({ contagemDeclarada: 1000 })],
    ["tag fora do perfil", perfilIcc({ primeiraEntrada: { offset: 100000 } })],
  ])("perfil corrompido (%s) => corrompida", (_n, perfil) => {
    expect(webp(perfil)).toMatchObject({ ok: false, motivo: "corrompida" });
  });

  it("perfil com tamanho ímpar (preenchimento do chunk) é lido sem o byte extra", () => {
    const perfil = perfilIcc({ tamanhoFinal: 501 });
    expect(perfil.length % 2).toBe(1);
    const arquivo = riff([vp8x(FLAG_ICC, 800, 800), iccp(perfil), vp8(800, 800)]);
    expect(verificarImagem(arquivo, { declarado: "webp", modo: "recusar" })).toMatchObject({
      ok: true,
    });
  });
});
