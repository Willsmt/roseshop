import { describe, expect, it } from "vitest";

import {
  FLAG_ANIMACAO,
  FLAG_EXIF,
  FLAG_ICC,
  FLAG_ALPHA,
  TEXTO_COM_FALSO,
  TEXTO_GPS_FALSO,
  TEXTO_IPTC_FALSO,
  TEXTO_XMP_FALSO,
  alph,
  anim,
  anmf,
  app,
  app1Exif,
  app1Xmp,
  app14Adobe,
  ascii,
  bytes,
  chunk,
  com,
  cortar,
  dadosEntropicos,
  dht,
  dnl,
  dqt,
  dri,
  eoi,
  exifChunk,
  gif,
  heic,
  iccEmPedacos,
  iccp,
  iptc,
  jfif,
  jpegValido,
  juntar,
  mpf,
  pdf,
  perfilIcc,
  png,
  riff,
  segmento,
  segmentoComprimento,
  sof,
  soi,
  sos,
  svg,
  svgXml,
  vp8,
  vp8x,
  webpValido,
} from "./fixtures";
import { verificarImagem, type FormatoImagem, type ModoVerificacao } from "./index";

// T025 (FR-004 a FR-007, SC-003): ordem dos motivos, assinatura, dimensões,
// truncamento, estrutura, modo registro e sanitização dos nomes em `blocos`.

const verificar = (
  b: Uint8Array,
  declarado: FormatoImagem = "jpeg",
  modo: ModoVerificacao = "recusar",
) => verificarImagem(b, { declarado, modo });
const jpeg = (b: Uint8Array, modo: ModoVerificacao = "recusar") => verificar(b, "jpeg", modo);
const webp = (b: Uint8Array, modo: ModoVerificacao = "recusar") => verificar(b, "webp", modo);

const NOME_BLOCO = /^[A-Za-z0-9 :?_]{1,32}$/;

describe("assinatura e formato declarado => formato", () => {
  const naoImagens: Array<[string, Uint8Array]> = [
    ["PNG", png()],
    ["GIF", gif()],
    ["SVG texto", svg()],
    ["SVG com <?xml", svgXml()],
    ["HEIC", heic()],
    ["PDF", pdf()],
    ["assinatura aleatória", bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)],
    ["arquivo vazio", new Uint8Array(0)],
    ["um único byte FF", bytes(0xff)],
    ["RIFF que não é WEBP", juntar(ascii("RIFF"), bytes(4, 0, 0, 0), ascii("WAVE"))],
  ];

  for (const declarado of ["jpeg", "webp"] as const) {
    it.each(naoImagens)(`${declarado} declarado, enviado %s`, (_nome, arquivo) => {
      const r = verificar(arquivo, declarado);
      expect(r).toMatchObject({ ok: false, motivo: "formato" });
      expect(Array.isArray(r.blocos)).toBe(true);
    });
  }

  it("JPEG enviado como se fosse webp => formato", () => {
    expect(webp(jpegValido())).toMatchObject({ ok: false, motivo: "formato" });
  });

  it("WebP enviado como se fosse jpeg => formato", () => {
    expect(jpeg(webpValido())).toMatchObject({ ok: false, motivo: "formato" });
  });

  it("modo registro não relaxa formato", () => {
    expect(jpeg(png(), "registro")).toMatchObject({ ok: false, motivo: "formato" });
    expect(webp(jpegValido(), "registro")).toMatchObject({ ok: false, motivo: "formato" });
  });
});

describe("dimensões", () => {
  const casos: Array<[string, number, number, "ok" | "pequena" | "dimensao"]> = [
    ["400 (mínimo)", 400, 400, "ok"],
    ["800", 800, 800, "ok"],
    ["1200 (máximo)", 1200, 1200, "ok"],
    ["1201", 1201, 1201, "dimensao"],
    ["2000", 2000, 2000, "dimensao"],
    ["399", 399, 399, "pequena"],
    ["1", 1, 1, "pequena"],
    ["300x500 (não quadrado)", 300, 500, "dimensao"],
    ["500x300 (não quadrado)", 500, 300, "dimensao"],
    ["800x600 (não quadrado)", 800, 600, "dimensao"],
    ["600x800 (não quadrado)", 600, 800, "dimensao"],
    ["1201x400 (não quadrado)", 1201, 400, "dimensao"],
  ];

  function conferir(r: ReturnType<typeof verificar>, esperado: string, lado: number) {
    if (esperado === "ok") expect(r).toMatchObject({ ok: true, lado });
    else expect(r).toMatchObject({ ok: false, motivo: esperado });
  }

  it.each(casos)("JPEG %s", (_n, largura, altura, esperado) => {
    conferir(jpeg(jpegValido({ largura, altura })), esperado, largura);
  });

  it.each(casos)("WebP VP8 %s", (_n, largura, altura, esperado) => {
    conferir(webp(webpValido({ largura, altura })), esperado, largura);
  });

  it.each(casos)("WebP VP8L %s", (_n, largura, altura, esperado) => {
    conferir(webp(webpValido({ largura, altura, bitstream: "vp8l" })), esperado, largura);
  });

  it.each(casos)("WebP VP8X %s", (_n, largura, altura, esperado) => {
    conferir(webp(webpValido({ largura, altura, flags: 0 })), esperado, largura);
  });
});

describe("ordem dos motivos", () => {
  const naoQuadrado = { largura: 800, altura: 600 };

  it("Exif e não quadrado => metadado em recusar", () => {
    expect(jpeg(jpegValido({ ...naoQuadrado, antes: [app1Exif()] }))).toMatchObject({
      ok: false,
      motivo: "metadado",
    });
  });

  it("Exif e não quadrado => dimensao em registro", () => {
    expect(jpeg(jpegValido({ ...naoQuadrado, antes: [app1Exif()] }), "registro")).toMatchObject({
      ok: false,
      motivo: "dimensao",
    });
  });

  it("Exif e 399x399 => metadado em recusar, pequena em registro", () => {
    const arquivo = jpegValido({ lado: 399, antes: [app1Exif()] });
    expect(jpeg(arquivo)).toMatchObject({ ok: false, motivo: "metadado" });
    expect(jpeg(arquivo, "registro")).toMatchObject({ ok: false, motivo: "pequena" });
  });

  it("MPF e Exif => animada", () => {
    expect(jpeg(jpegValido({ antes: [app1Exif(), mpf()] }))).toMatchObject({
      ok: false,
      motivo: "animada",
    });
    expect(jpeg(jpegValido({ antes: [mpf(), app1Exif()] }), "registro")).toMatchObject({
      ok: false,
      motivo: "animada",
    });
  });

  it("Exif e arquivo truncado => corrompida", () => {
    const arquivo = jpegValido({ antes: [app1Exif()] });
    expect(jpeg(cortar(arquivo, arquivo.length - 5))).toMatchObject({
      ok: false,
      motivo: "corrompida",
    });
  });

  it("SOF3 íntegro => formato", () => {
    expect(jpeg(jpegValido({ sofTipo: 0xc3 }))).toMatchObject({ ok: false, motivo: "formato" });
  });

  it("SOF3 com Exif e MPF => formato (SOFn vem antes de animação e metadado)", () => {
    const arquivo = jpegValido({ sofTipo: 0xc3, antes: [app1Exif(), mpf()] });
    expect(jpeg(arquivo)).toMatchObject({ ok: false, motivo: "formato" });
  });

  it("SOF3 com estrutura quebrada => corrompida (estrutura vem antes de SOFn)", () => {
    const arquivo = jpegValido({ sofTipo: 0xc3 });
    expect(jpeg(cortar(arquivo, arquivo.length - 1))).toMatchObject({
      ok: false,
      motivo: "corrompida",
    });
  });

  it("WebP animado e com flag EXIF => animada", () => {
    const arquivo = riff([vp8x(FLAG_ANIMACAO | FLAG_EXIF, 800, 800), anim(), anmf()]);
    expect(webp(arquivo)).toMatchObject({ ok: false, motivo: "animada" });
  });

  it("WebP com EXIF e não quadrado => metadado em recusar, dimensao em registro", () => {
    const arquivo = webpValido({
      ...naoQuadrado,
      flags: FLAG_EXIF,
      depois: [exifChunk()],
    });
    expect(webp(arquivo)).toMatchObject({ ok: false, motivo: "metadado" });
    expect(webp(arquivo, "registro")).toMatchObject({ ok: false, motivo: "dimensao" });
  });
});

describe("truncamento: nenhum prefixo próprio de um arquivo válido é aceito", () => {
  it("JPEG (progressivo, com ICC) cortado em cada posição de 1 a length-1", () => {
    const completo = jpegValido({
      sofTipo: 0xc2,
      varreduras: 3,
      antes: [...iccEmPedacos(perfilIcc(), 2), dri()],
    });
    expect(jpeg(completo)).toMatchObject({ ok: true });
    const falhas: string[] = [];
    for (let n = 1; n < completo.length; n += 1) {
      const r = jpeg(cortar(completo, n));
      const esperado = n < 2 ? "formato" : "corrompida";
      if (r.ok || r.motivo !== esperado) {
        falhas.push(`${n}: ${r.ok ? "ok" : r.motivo}`);
      }
    }
    expect(falhas).toEqual([]);
  });

  it("WebP (VP8X + ICCP + ALPH + VP8) cortado em cada posição de 1 a length-1", () => {
    const completo = webpValido({
      flags: FLAG_ICC | FLAG_ALPHA,
      antes: [iccp(perfilIcc()), alph()],
    });
    expect(webp(completo)).toMatchObject({ ok: true });
    const falhas: string[] = [];
    for (let n = 1; n < completo.length; n += 1) {
      const r = webp(cortar(completo, n));
      const esperado = n < 12 ? "formato" : "corrompida";
      if (r.ok || r.motivo !== esperado) {
        falhas.push(`${n}: ${r.ok ? "ok" : r.motivo}`);
      }
    }
    expect(falhas).toEqual([]);
  });

  it("WebP simples VP8L cortado em cada posição", () => {
    const completo = webpValido({ bitstream: "vp8l" });
    const falhas: string[] = [];
    for (let n = 1; n < completo.length; n += 1) {
      const r = webp(cortar(completo, n));
      if (r.ok) falhas.push(String(n));
    }
    expect(falhas).toEqual([]);
  });
});

describe("JPEG: estrutura => corrompida", () => {
  const base = {
    jfif: jfif(),
    dqt: dqt(),
    sof: sof(0xc0, 800, 800),
    dht: dht(),
    sos: sos(),
    dados: dadosEntropicos(),
    eoi: eoi(),
  };
  const { jfif: j, dqt: q, sof: s, dht: h, sos: o, dados: d, eoi: e } = base;
  const montar = (...partes: Uint8Array[]) => juntar(soi(), ...partes);

  const casos: Array<[string, Uint8Array]> = [
    ["byte que não é FF onde se espera marcador", montar(j, bytes(0x12), q, s, h, o, d, e)],
    ["FF FF (preenchimento) entre segmentos", montar(j, bytes(0xff, 0xff), q, s, h, o, d, e)],
    ["marcador FF 01", montar(j, bytes(0xff, 0x01), q, s, h, o, d, e)],
    ["marcador FF 02", montar(j, segmento(0x02, bytes(0, 0)), q, s, h, o, d, e)],
    ["marcador FF 50", montar(j, segmento(0x50, bytes(0, 0)), q, s, h, o, d, e)],
    ["marcador FF BF", montar(j, segmento(0xbf, bytes(0, 0)), q, s, h, o, d, e)],
    ["RST0 fora dos dados entrópicos", montar(j, bytes(0xff, 0xd0), q, s, h, o, d, e)],
    ["RST7 fora dos dados entrópicos", montar(j, bytes(0xff, 0xd7), q, s, h, o, d, e)],
    ["segundo SOI", montar(j, soi(), q, s, h, o, d, e)],
    ["comprimento inflado além do fim", montar(j, segmentoComprimento(0xdb, 5000, bytes(0, 1, 2)), s, h, o, d, e)],
    ["comprimento 1", montar(j, segmentoComprimento(0xdb, 1, bytes(0, 1, 2)), q, s, h, o, d, e)],
    ["comprimento 0", montar(j, segmentoComprimento(0xdb, 0, bytes(0, 1, 2)), q, s, h, o, d, e)],
    ["comprimento truncado (1 byte de 2)", montar(j, bytes(0xff, 0xdb, 0x00))],
    ["segmento truncado no payload", montar(j, bytes(0xff, 0xdb, 0x00, 0x20, 1, 2, 3))],
    ["SOS sem SOF antes", montar(j, q, h, o, d, e)],
    ["sem SOF e sem SOS", montar(j, q, e)],
    ["sem SOS", montar(j, q, s, h, e)],
    ["sem EOI (termina nos dados)", montar(j, q, s, h, o, d)],
    ["sem EOI (termina após DHT depois do SOS)", montar(j, q, s, h, o, d, h)],
    ["só SOI", montar()],
    ["SOI e EOI apenas", montar(e)],
    ["byte 00 depois do EOI", montar(j, q, s, h, o, d, e, bytes(0))],
    ["outro EOI depois do EOI", montar(j, q, s, h, o, d, e, e)],
    ["texto depois do EOI", montar(j, q, s, h, o, d, e, ascii("lixo"))],
    ["dois SOF", montar(j, q, s, sof(0xc2, 800, 800), h, o, d, e)],
    ["SOF com menos componentes que Nc", montar(j, q, segmento(0xc0, juntar(bytes(8), bytes(0x03, 0x20, 0x03, 0x20, 3), bytes(1, 0x11, 0))), h, o, d, e)],
    ["SOF com Nc = 0", montar(j, q, segmento(0xc0, juntar(bytes(8), bytes(0x03, 0x20, 0x03, 0x20, 0))), h, o, d, e)],
    ["SOF com largura 0", montar(j, q, sof(0xc0, 0, 800), h, o, d, e)],
    ["SOF com altura 0", montar(j, q, sof(0xc0, 800, 0), h, o, d, e)],
    ["SOS com Ns = 0", montar(j, q, s, h, segmento(0xda, bytes(0, 0, 63, 0)), d, e)],
    ["SOS com Ns = 5", montar(j, q, s, h, sos(5), d, e)],
    ["SOS com comprimento incompatível com Ns", montar(j, q, s, h, segmento(0xda, juntar(bytes(3), bytes(1, 0, 2, 0), bytes(0, 63, 0))), d, e)],
    ["DRI com comprimento 5", montar(j, segmento(0xdd, bytes(0, 0, 0)), q, s, h, o, d, e)],
    ["FF FF dentro dos dados entrópicos", montar(j, q, s, h, o, bytes(0x12, 0xff, 0xff, 0x34), e)],
    ["Exif depois do SOS (corrompida, não metadado)", montar(j, q, s, h, o, d, app1Exif(), e)],
    ["COM depois do SOS", montar(j, q, s, h, o, d, com(), e)],
    ["APP0 depois do SOS", montar(j, q, s, h, o, d, j, e)],
    ["MPF depois do SOS (corrompida, não animada)", montar(j, q, s, h, o, d, mpf(), e)],
    ["SOF depois do SOS", montar(j, q, s, h, o, d, s, e)],
    ["segundo SOI depois do SOS", montar(j, q, s, h, o, d, soi(), e)],
    ["marcador desconhecido FF C8 depois do SOS", montar(j, q, s, h, o, d, segmento(0xc8, bytes(0, 0)), e)],
    ["largura/altura 0 em SOF1", montar(j, q, sof(0xc1, 0, 0), h, o, d, e)],
  ];

  it.each(casos)("%s", (_nome, arquivo) => {
    const r = jpeg(arquivo);
    expect(r).toMatchObject({ ok: false, motivo: "corrompida" });
    expect(Array.isArray(r.blocos)).toBe(true);
  });

  it("registro não relaxa corrompida", () => {
    expect(jpeg(montar(j, app1Exif(), q, s, h, o, d, e, bytes(0)), "registro")).toMatchObject({
      ok: false,
      motivo: "corrompida",
    });
  });

  it("DNL depois do SOS é metadado (permitido nessa posição), não corrompida", () => {
    expect(jpeg(montar(j, q, s, h, o, d, dnl(), e))).toMatchObject({
      ok: false,
      motivo: "metadado",
    });
  });

  it("DHT, DQT, DRI e novo SOS depois do SOS são permitidos", () => {
    expect(jpeg(montar(j, q, s, h, o, d, h, q, dri(), o, d, e))).toMatchObject({ ok: true });
  });
});

describe("WebP: estrutura => corrompida (registro não relaxa)", () => {
  it("byte extra no fim", () => {
    expect(webp(webpValido({ extraFim: bytes(0) }), "registro")).toMatchObject({
      ok: false,
      motivo: "corrompida",
    });
  });

  it("VP8X diferente do bitstream", () => {
    expect(
      webp(webpValido({ flags: 0, dimensoesVp8x: [801, 801] }), "registro"),
    ).toMatchObject({ ok: false, motivo: "corrompida" });
  });

  it("VP8 sem animação nem imagem não é aceito", () => {
    expect(webp(riff([vp8x(0, 800, 800)]), "registro")).toMatchObject({
      ok: false,
      motivo: "corrompida",
    });
  });
});

describe("modo registro", () => {
  const registro = (b: Uint8Array) => jpeg(b, "registro");

  it("Exif não recusa e aparece em blocos", () => {
    const r = registro(jpegValido({ antes: [app1Exif()] }));
    expect(r).toMatchObject({ ok: true, formato: "jpeg", lado: 800 });
    expect(r.blocos).toContain("APP1:Exif");
  });

  it("XMP não recusa e aparece em blocos", () => {
    const r = registro(jpegValido({ antes: [app1Xmp()] }));
    expect(r).toMatchObject({ ok: true });
    expect(r.blocos).toContain("APP1:XMP");
  });

  it("COM não recusa e aparece em blocos", () => {
    const r = registro(jpegValido({ antes: [com()] }));
    expect(r).toMatchObject({ ok: true });
    expect(r.blocos).toContain("COM");
  });

  it("ICC com dmnd não recusa e lista APP2:ICC e ICC:dmnd", () => {
    const r = registro(
      jpegValido({ antes: iccEmPedacos(perfilIcc({ tags: ["wtpt", "dmnd"] }), 1) }),
    );
    expect(r).toMatchObject({ ok: true });
    expect(r.blocos).toEqual(expect.arrayContaining(["APP2:ICC", "ICC:dmnd"]));
  });

  it("vários blocos de metadado juntos, na ordem da primeira aparição", () => {
    const r = registro(
      jpegValido({ antes: [app1Exif(), app1Xmp(), com()] }),
    );
    expect(r).toMatchObject({ ok: true });
    expect(r.blocos).toEqual([
      "SOI", "APP0:JFIF", "APP1:Exif", "APP1:XMP", "COM", "DQT", "SOF0", "DHT", "SOS", "EOI",
    ]);
  });

  it("WebP com EXIF não recusa e lista EXIF", () => {
    const r = webp(
      webpValido({ flags: FLAG_EXIF, depois: [exifChunk()] }),
      "registro",
    );
    expect(r).toMatchObject({ ok: true, formato: "webp", lado: 800 });
    expect(r.blocos).toEqual(expect.arrayContaining(["VP8X", "VP8", "EXIF"]));
  });

  it("não relaxa animada", () => {
    expect(registro(jpegValido({ antes: [mpf()] }))).toMatchObject({ ok: false, motivo: "animada" });
    expect(
      webp(webpValido({ flags: FLAG_ANIMACAO }), "registro"),
    ).toMatchObject({ ok: false, motivo: "animada" });
  });

  it("não relaxa pequena nem dimensao", () => {
    expect(registro(jpegValido({ lado: 399, antes: [com()] }))).toMatchObject({
      ok: false,
      motivo: "pequena",
    });
    expect(registro(jpegValido({ largura: 800, altura: 600, antes: [com()] }))).toMatchObject({
      ok: false,
      motivo: "dimensao",
    });
    expect(registro(jpegValido({ lado: 1201, antes: [com()] }))).toMatchObject({
      ok: false,
      motivo: "dimensao",
    });
  });

  it("não relaxa SOFn proibido", () => {
    expect(registro(jpegValido({ sofTipo: 0xc3, antes: [com()] }))).toMatchObject({
      ok: false,
      motivo: "formato",
    });
  });

  it("o mesmo arquivo com metadado é recusado em recusar", () => {
    expect(jpeg(jpegValido({ antes: [app1Exif()] }))).toMatchObject({
      ok: false,
      motivo: "metadado",
    });
  });
});

describe("blocos: nomes sanitizados, únicos e sem conteúdo do arquivo", () => {
  const cheio = jpegValido({
    antes: [
      app1Exif(),
      app1Exif(),
      app1Xmp(),
      iptc(),
      com(),
      com(),
      app14Adobe(),
      app(5, ascii("conteudo SEGREDO-APP5")),
      segmento(0xc8, bytes(0, 0)),
      iccEmPedacos(perfilIcc({ tags: ["wtpt", "a/b!", "dmnd", "dmnd"] }), 1)[0]!,
    ],
    varreduras: 2,
  });

  it("todo nome casa com /^[A-Za-z0-9 :?_]{1,32}$/", () => {
    const r = jpeg(cheio, "registro");
    expect(r.blocos.length).toBeGreaterThan(5);
    for (const nome of r.blocos) expect(nome).toMatch(NOME_BLOCO);
  });

  it("nenhum nome contém texto do arquivo (GPS, XMP, IPTC, comentário)", () => {
    const todos = jpeg(cheio, "registro").blocos.join("|");
    for (const segredo of [
      TEXTO_GPS_FALSO,
      "GPSLatitude",
      "FALSO",
      TEXTO_XMP_FALSO,
      TEXTO_IPTC_FALSO,
      TEXTO_COM_FALSO,
      "SEGREDO",
      "http",
      "Photoshop",
    ]) {
      expect(todos).not.toContain(segredo);
    }
  });

  it("sem repetidos mesmo com blocos repetidos no arquivo", () => {
    const r = jpeg(cheio, "registro");
    expect(new Set(r.blocos).size).toBe(r.blocos.length);
    expect(r.blocos).toContain("ICC:a?b?");
    expect(r.blocos).toContain("FFC8");
  });

  it("JPEG progressivo com vários SOS lista SOS uma vez", () => {
    const r = jpeg(jpegValido({ sofTipo: 0xc2, varreduras: 5 }));
    expect(r.blocos.filter((b) => b === "SOS")).toHaveLength(1);
  });

  it("WebP: nomes sanitizados, sem repetidos e sem conteúdo", () => {
    const arquivo = webpValido({
      flags: FLAG_EXIF,
      depois: [exifChunk(), exifChunk()],
    });
    const r = webp(arquivo, "registro");
    for (const nome of r.blocos) expect(nome).toMatch(NOME_BLOCO);
    expect(new Set(r.blocos).size).toBe(r.blocos.length);
    expect(r.blocos.join("|")).not.toContain("GPS");
    expect(r.blocos.join("|")).not.toContain("FALSO");
  });

  it("resultado de formato e corrompida também traz blocos como array de nomes válidos", () => {
    for (const r of [jpeg(png()), jpeg(cortar(cheio, 40))]) {
      expect(Array.isArray(r.blocos)).toBe(true);
      for (const nome of r.blocos) expect(nome).toMatch(NOME_BLOCO);
    }
  });
});

describe("modo registro: regras de formato e estrutura novas", () => {
  it("não relaxa SOF com precisão 12 (formato)", () => {
    expect(jpeg(jpegValido({ precisao: 12, antes: [com()] }), "registro")).toMatchObject({
      ok: false,
      motivo: "formato",
    });
  });

  it("não relaxa VP8X com bit reservado (corrompida)", () => {
    expect(webp(webpValido({ flags: 0x40 }), "registro")).toMatchObject({
      ok: false,
      motivo: "corrompida",
    });
  });

  it("JFIF depois de outro segmento (SOI, DQT, JFIF) vira ok:true em registro", () => {
    const r = jpeg(jpegValido({ semJfif: true, antes: [dqt(), jfif()] }), "registro");
    expect(r).toMatchObject({ ok: true });
    expect(r.blocos).toContain("APP0:JFIF");
  });

  it("ALPH sem a flag de alpha => corrompida/alph_sem_flag em registro", () => {
    expect(webp(webpValido({ flags: 0, antes: [alph()] }), "registro")).toMatchObject({
      ok: false,
      motivo: "corrompida",
      regra: "alph_sem_flag",
    });
  });

  it.each([
    [[1, 0, 0]],
    [[0, 1, 0]],
    [[0, 0, 1]],
  ] as Array<[[number, number, number]]>)(
    "byte reservado %j do VP8X => corrompida/vp8x_reservado em registro",
    (reservados) => {
      const arquivo = riff([vp8x(0, 800, 800, reservados), vp8(800, 800)]);
      expect(webp(arquivo, "registro")).toMatchObject({
        ok: false,
        motivo: "corrompida",
        regra: "vp8x_reservado",
      });
    },
  );

  it("JFIF duplicado vira ok:true em registro", () => {
    const r = jpeg(jpegValido({ antes: [jfif()] }), "registro");
    expect(r).toMatchObject({ ok: true });
    expect(r.blocos).toContain("APP0:JFIF");
  });
});

describe("blocos: teto de 64 nomes distintos", () => {
  const tagsDistintas = (n: number) =>
    Array.from({ length: n }, (_, i) => `Z${String(i).padStart(3, "0")}`);

  it("WebP com 200 FourCC distintos em registro => 65 nomes, último _mais", () => {
    const chunks = tagsDistintas(200).map((f) => chunk(f, bytes(1, 2)));
    const r = webp(webpValido({ flags: 0, depois: chunks }), "registro");
    expect(r.ok).toBe(true);
    expect(r.blocos).toHaveLength(65);
    expect(r.blocos[64]).toBe("_mais");
    expect(new Set(r.blocos).size).toBe(r.blocos.length);
  });

  it("JPEG com ICC de 200 tags proibidas distintas em registro => 65 nomes, último _mais", () => {
    const perfil = perfilIcc({ tags: tagsDistintas(200) });
    const r = jpeg(jpegValido({ antes: iccEmPedacos(perfil, 1) }), "registro");
    expect(r.blocos).toHaveLength(65);
    expect(r.blocos[64]).toBe("_mais");
    expect(new Set(r.blocos).size).toBe(r.blocos.length);
  });

  it("exatamente 64 nomes não ganha _mais", () => {
    // 8 nomes fixos (SOI, APP0:JFIF, APP2:ICC, DQT, SOF0, DHT, SOS, EOI) + 56 tags
    const perfil = perfilIcc({ tags: tagsDistintas(56) });
    const r = jpeg(jpegValido({ antes: iccEmPedacos(perfil, 1) }), "registro");
    expect(r.blocos).toHaveLength(64);
    expect(r.blocos).not.toContain("_mais");
  });

  it("poucos nomes não ganham _mais", () => {
    const r = jpeg(jpegValido(), "registro");
    expect(r.blocos).not.toContain("_mais");
  });
});
