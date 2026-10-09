import { describe, expect, it } from "vitest";

import {
  FLAG_ALPHA,
  FLAG_ANIMACAO,
  FLAG_EXIF,
  FLAG_ICC,
  FLAG_XMP,
  alph,
  anim,
  anmf,
  ascii,
  bytes,
  chunk,
  chunkBruto,
  cortar,
  exifChunk,
  iccp,
  perfilIcc,
  riff,
  vp8,
  vp8l,
  vp8x,
  webpValido,
  xmpChunk,
} from "./fixtures";
import { verificarImagem } from "./index";

// T024 (FR-004 a FR-007): verificação de WebP por lista de permitidos.

const webp = (b: Uint8Array) => verificarImagem(b, { declarado: "webp", modo: "recusar" });

describe("WebP aceito", () => {
  it("VP8 simples", () => {
    const r = webp(webpValido({ lado: 800 }));
    expect(r).toMatchObject({ ok: true, formato: "webp", lado: 800 });
    expect(r.blocos).toEqual(["VP8"]);
  });

  it("VP8L simples", () => {
    const r = webp(webpValido({ lado: 800, bitstream: "vp8l" }));
    expect(r).toMatchObject({ ok: true, formato: "webp", lado: 800 });
    expect(r.blocos).toEqual(["VP8L"]);
  });

  it("VP8 com payload ímpar (byte de preenchimento) é aceito", () => {
    const arquivo = riff([vp8(800, 800, { extra: 1 })]);
    expect(webp(arquivo)).toMatchObject({ ok: true, lado: 800 });
  });

  it("VP8X só com ICC + ICCP", () => {
    const r = webp(webpValido({ flags: FLAG_ICC, antes: [iccp(perfilIcc())] }));
    expect(r).toMatchObject({ ok: true, lado: 800 });
    expect(r.blocos).toEqual(["VP8X", "ICCP", "VP8"]);
  });

  it("VP8X só com alpha + ALPH", () => {
    const r = webp(webpValido({ flags: FLAG_ALPHA, antes: [alph()] }));
    expect(r).toMatchObject({ ok: true, lado: 800 });
    expect(r.blocos).toEqual(["VP8X", "ALPH", "VP8"]);
  });

  it("VP8X com ICC e alpha + ICCP + ALPH", () => {
    const r = webp(
      webpValido({ flags: FLAG_ICC | FLAG_ALPHA, antes: [iccp(perfilIcc()), alph()] }),
    );
    expect(r).toMatchObject({ ok: true, lado: 800 });
    expect(r.blocos).toEqual(["VP8X", "ICCP", "ALPH", "VP8"]);
  });

  it("VP8X sem flags e com VP8L", () => {
    expect(webp(webpValido({ flags: 0, bitstream: "vp8l" }))).toMatchObject({ ok: true });
  });

  it("VP8X com flag de alpha e VP8L (alpha embutido, sem ALPH)", () => {
    expect(webp(webpValido({ flags: FLAG_ALPHA, bitstream: "vp8l" }))).toMatchObject({
      ok: true,
    });
  });

  it("blocos sem espaços finais: 'VP8 ' vira VP8", () => {
    const r = webp(webpValido());
    expect(r.blocos).toContain("VP8");
    expect(r.blocos).not.toContain("VP8 ");
  });
});

describe("WebP: dimensões lidas corretamente", () => {
  it.each([400, 800, 1200, 1201, 399])("VP8 quadrado com lado %i", (lado) => {
    const r = webp(webpValido({ lado }));
    if (lado === 1201) expect(r).toMatchObject({ ok: false, motivo: "dimensao" });
    else if (lado === 399) expect(r).toMatchObject({ ok: false, motivo: "pequena" });
    else expect(r).toMatchObject({ ok: true, lado });
  });

  it("VP8L com lado 1200 (14 bits + 1)", () => {
    expect(webp(webpValido({ lado: 1200, bitstream: "vp8l" }))).toMatchObject({
      ok: true,
      lado: 1200,
    });
  });

  it("VP8L com lado 1201 => dimensao", () => {
    expect(webp(webpValido({ lado: 1201, bitstream: "vp8l" }))).toMatchObject({
      ok: false,
      motivo: "dimensao",
    });
  });

  it("VP8X com lado 1200 (24 bits LE, menos 1) e VP8L", () => {
    expect(
      webp(webpValido({ lado: 1200, flags: 0, bitstream: "vp8l" })),
    ).toMatchObject({ ok: true, lado: 1200 });
  });

  it("VP8X com lado 1200 e VP8", () => {
    expect(webp(webpValido({ lado: 1200, flags: 0 }))).toMatchObject({ ok: true, lado: 1200 });
  });

  it("VP8 ignora os 2 bits de escala (máscara 0x3FFF)", () => {
    const arquivo = riff([vp8(800, 800, { escala: 2 })]);
    expect(webp(arquivo)).toMatchObject({ ok: true, lado: 800 });
  });

  it("largura e altura distintas no bitstream => dimensao (largura vem antes da altura)", () => {
    expect(webp(webpValido({ largura: 800, altura: 600 }))).toMatchObject({
      ok: false,
      motivo: "dimensao",
    });
    expect(webp(webpValido({ largura: 600, altura: 800, bitstream: "vp8l" }))).toMatchObject({
      ok: false,
      motivo: "dimensao",
    });
  });
});

describe("WebP animado => animada", () => {
  it("flag de animação no VP8X, com VP8", () => {
    const r = webp(webpValido({ flags: FLAG_ANIMACAO }));
    expect(r).toMatchObject({ ok: false, motivo: "animada" });
  });

  it("VP8X com flag, ANIM e ANMF, sem chunk VP8 (animado de verdade)", () => {
    const arquivo = riff([vp8x(FLAG_ANIMACAO, 800, 800), anim(), anmf()]);
    const r = webp(arquivo);
    expect(r).toMatchObject({ ok: false, motivo: "animada" });
    expect(r.blocos).toEqual(expect.arrayContaining(["VP8X", "ANIM", "ANMF"]));
  });

  it("chunk ANIM sem a flag => animada", () => {
    const arquivo = riff([vp8x(0, 800, 800), anim(), anmf()]);
    expect(webp(arquivo)).toMatchObject({ ok: false, motivo: "animada" });
  });

  it("só chunk ANMF (sem flag e sem ANIM) => animada", () => {
    const arquivo = riff([vp8x(0, 800, 800), anmf()]);
    expect(webp(arquivo)).toMatchObject({ ok: false, motivo: "animada" });
  });

  it("animada vence metadado (flags EXIF e animação)", () => {
    const arquivo = riff([vp8x(FLAG_ANIMACAO | FLAG_EXIF, 800, 800), anim(), anmf(), exifChunk()]);
    expect(webp(arquivo)).toMatchObject({ ok: false, motivo: "animada" });
  });
});

describe("WebP com metadado => metadado", () => {
  it("flag EXIF no VP8X (sem chunk)", () => {
    expect(webp(webpValido({ flags: FLAG_EXIF }))).toMatchObject({ ok: false, motivo: "metadado" });
  });

  it("flag XMP no VP8X (sem chunk)", () => {
    expect(webp(webpValido({ flags: FLAG_XMP }))).toMatchObject({ ok: false, motivo: "metadado" });
  });

  it("chunk EXIF", () => {
    const r = webp(webpValido({ flags: FLAG_EXIF, depois: [exifChunk()] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain("EXIF");
  });

  it("chunk XMP", () => {
    const r = webp(webpValido({ flags: FLAG_XMP, depois: [xmpChunk()] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain("XMP");
  });

  it("chunk desconhecido depois da imagem", () => {
    const r = webp(webpValido({ flags: 0, depois: [chunk("ABCD", bytes(1, 2, 3, 4))] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain("ABCD");
  });

  it("FourCC desconhecido com caracteres fora de [A-Za-z0-9 ] vira ?", () => {
    const r = webp(webpValido({ flags: 0, depois: [chunk("a/b!", bytes(1, 2))] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain("a?b?");
  });
});

describe("WebP corrompido => corrompida", () => {
  const corrompida = { ok: false, motivo: "corrompida" } as const;

  it("byte além do tamanho do RIFF", () => {
    expect(webp(webpValido({ extraFim: bytes(0) }))).toMatchObject(corrompida);
  });

  it("tamanho do RIFF maior que o arquivo (truncado)", () => {
    expect(webp(cortar(webpValido(), webpValido().length - 4))).toMatchObject(corrompida);
  });

  it("tamanho do RIFF declarado errado", () => {
    expect(webp(webpValido({ tamanhoRiff: 10 }))).toMatchObject(corrompida);
  });

  it("chunk com tamanho além do fim do arquivo", () => {
    const arquivo = riff([chunkBruto("VP8 ", 1000, new Uint8Array(12))]);
    expect(webp(arquivo)).toMatchObject(corrompida);
  });

  it("cabeçalho de chunk incompleto no fim", () => {
    const arquivo = riff([vp8(800, 800), ascii("ABC")]);
    expect(webp(arquivo)).toMatchObject(corrompida);
  });

  it("chunk de tamanho ímpar sem o byte de preenchimento", () => {
    const arquivo = riff([chunkBruto("VP8 ", 11, new Uint8Array(11))]);
    expect(webp(arquivo)).toMatchObject(corrompida);
  });

  it("dimensões do VP8X diferentes do bitstream VP8", () => {
    expect(webp(webpValido({ lado: 800, flags: 0, dimensoesVp8x: [900, 900] }))).toMatchObject(
      corrompida,
    );
  });

  it("dimensões do VP8X diferentes do bitstream VP8L", () => {
    expect(
      webp(webpValido({ lado: 800, flags: 0, bitstream: "vp8l", dimensoesVp8x: [800, 799] })),
    ).toMatchObject(corrompida);
  });

  it("VP8 sem keyframe (bit 0 do frame tag = 1)", () => {
    expect(webp(riff([vp8(800, 800, { keyframe: false })]))).toMatchObject(corrompida);
  });

  it("VP8 sem a assinatura 9D 01 2A", () => {
    expect(webp(riff([vp8(800, 800, { assinatura: false })]))).toMatchObject(corrompida);
  });

  it("VP8 com payload menor que 10 bytes", () => {
    expect(webp(riff([chunk("VP8 ", new Uint8Array(5))]))).toMatchObject(corrompida);
  });

  it.each([
    ["largura 0", 0, 800],
    ["altura 0", 800, 0],
  ])("VP8 com %s", (_n, l, a) => {
    expect(webp(riff([vp8(l, a)]))).toMatchObject(corrompida);
  });

  it("VP8L sem o byte 0x2F", () => {
    expect(webp(riff([vp8l(800, 800, { marcador: 0x2e })]))).toMatchObject(corrompida);
  });

  it("VP8L com versão diferente de 0", () => {
    expect(webp(riff([vp8l(800, 800, { versao: 1 })]))).toMatchObject(corrompida);
  });

  it("VP8L com payload menor que 5 bytes", () => {
    expect(webp(riff([chunk("VP8L", bytes(0x2f, 0, 0, 0))]))).toMatchObject(corrompida);
  });

  it.each([0x01, 0x40, 0x80])("VP8X com bit reservado %i ligado", (mascara) => {
    expect(webp(webpValido({ flags: mascara }))).toMatchObject(corrompida);
  });

  it.each([
    [[1, 0, 0]],
    [[0, 1, 0]],
    [[0, 0, 0x80]],
  ] as Array<[[number, number, number]]>)("VP8X com byte reservado não zero %j", (reservados) => {
    const arquivo = riff([vp8x(0, 800, 800, reservados), vp8(800, 800)]);
    expect(webp(arquivo)).toMatchObject(corrompida);
  });

  it("ALPH com VP8X sem a flag de alpha", () => {
    expect(webp(webpValido({ flags: 0, antes: [alph()] }))).toMatchObject(corrompida);
  });

  it("ALPH seguido de VP8L (flag de alpha) => corrompida, regra alph_com_vp8l", () => {
    expect(
      webp(webpValido({ flags: FLAG_ALPHA, bitstream: "vp8l", antes: [alph()] })),
    ).toMatchObject({ ok: false, motivo: "corrompida", regra: "alph_com_vp8l" });
  });

  it("controle: ALPH com a flag de alpha é aceito", () => {
    expect(webp(webpValido({ flags: FLAG_ALPHA, antes: [alph()] }))).toMatchObject({ ok: true });
  });

  it("VP8X fora da primeira posição", () => {
    expect(webp(riff([vp8(800, 800), vp8x(0, 800, 800)]))).toMatchObject(corrompida);
  });

  it("VP8X com payload diferente de 10 bytes", () => {
    const arquivo = riff([chunk("VP8X", new Uint8Array(11)), vp8(800, 800)]);
    expect(webp(arquivo)).toMatchObject(corrompida);
  });

  it("ICCP sem VP8X", () => {
    expect(webp(riff([iccp(perfilIcc()), vp8(800, 800)]))).toMatchObject(corrompida);
  });

  it("ALPH sem VP8X", () => {
    expect(webp(riff([alph(), vp8(800, 800)]))).toMatchObject(corrompida);
  });

  it("flag ICC sem chunk ICCP", () => {
    expect(webp(webpValido({ flags: FLAG_ICC }))).toMatchObject(corrompida);
  });

  it("chunk ICCP sem a flag ICC", () => {
    expect(webp(webpValido({ flags: 0, antes: [iccp(perfilIcc())] }))).toMatchObject(corrompida);
  });

  it("ICCP depois do chunk de imagem", () => {
    expect(
      webp(webpValido({ flags: FLAG_ICC, depois: [iccp(perfilIcc())] })),
    ).toMatchObject(corrompida);
  });

  it("ALPH depois do chunk de imagem", () => {
    expect(webp(webpValido({ flags: FLAG_ALPHA, depois: [alph()] }))).toMatchObject(corrompida);
  });

  it("chunk de imagem repetido", () => {
    expect(webp(riff([vp8x(0, 800, 800), vp8(800, 800), vp8(800, 800)]))).toMatchObject(
      corrompida,
    );
  });

  it("VP8 e VP8L juntos", () => {
    expect(webp(riff([vp8x(0, 800, 800), vp8(800, 800), vp8l(800, 800)]))).toMatchObject(
      corrompida,
    );
  });

  it("VP8X sem chunk de imagem e sem animação", () => {
    expect(webp(riff([vp8x(0, 800, 800)]))).toMatchObject(corrompida);
  });

  it("RIFF sem nenhum chunk", () => {
    expect(webp(riff([]))).toMatchObject(corrompida);
  });

  it("arquivo cortado em 14 bytes (cabeçalho RIFF + 2 bytes)", () => {
    expect(webp(cortar(riff([vp8(800, 800)]), 14))).toMatchObject(corrompida);
  });
});
