import { describe, expect, it } from "vitest";

import {
  app,
  app0Outro,
  app1Exif,
  app1Outro,
  app1Xmp,
  app2Outro,
  app14Adobe,
  bytes,
  com,
  dac,
  dadosComTodosRst,
  dht,
  dnl,
  dqt,
  dri,
  eoi,
  iccEmPedacos,
  iccPedaco,
  iptc,
  jfifComMiniatura,
  jfifComprimento17,
  jfxx,
  jpegValido,
  juntar,
  mpf,
  perfilIcc,
  segmento,
  sof,
  sos,
  soi,
  jfif,
} from "./fixtures";
import { verificarImagem } from "./index";

// T022 (FR-004 a FR-007): verificação de JPEG por lista de permitidos.
// Cada bloco permitido é aceito e cada bloco proibido recusa com o motivo certo.

const jpeg = (b: Uint8Array) => verificarImagem(b, { declarado: "jpeg", modo: "recusar" });

describe("JPEG aceito", () => {
  it("JFIF mínimo (miniatura 0x0, comprimento 16) é aceito, com blocos exatos", () => {
    const r = jpeg(jpegValido({ lado: 800 }));
    expect(r).toMatchObject({ ok: true, formato: "jpeg", lado: 800 });
    expect(r.blocos).toEqual(["SOI", "APP0:JFIF", "DQT", "SOF0", "DHT", "SOS", "EOI"]);
  });

  it("arquivo sem JFIF (SOI direto no DQT) é aceito", () => {
    expect(jpeg(jpegValido({ semJfif: true }))).toMatchObject({ ok: true, lado: 800 });
  });

  it.each([1, 3])("SOF com %i componente(s) é aceito", (nc) => {
    expect(jpeg(jpegValido({ nc }))).toMatchObject({ ok: true });
  });

  it("DRI com comprimento 4 é aceito", () => {
    const r = jpeg(jpegValido({ antes: [dri()] }));
    expect(r).toMatchObject({ ok: true });
    expect(r.blocos).toContain("DRI");
  });

  it("RST0 a RST7 e FF 00 dentro dos dados entrópicos são dados, não marcadores", () => {
    const arquivo = juntar(soi(), jfif(), dqt(), sof(0xc0, 800, 800), dht(), sos(), dadosComTodosRst(), eoi());
    expect(jpeg(arquivo)).toMatchObject({ ok: true, lado: 800 });
  });

  it.each([
    [0xc1, "SOF1"],
    [0xc2, "SOF2"],
  ])("marcador %i (%s) é aceito", (tipo, nome) => {
    const r = jpeg(jpegValido({ sofTipo: tipo }));
    expect(r).toMatchObject({ ok: true, lado: 800 });
    expect(r.blocos).toContain(nome);
  });

  it("progressivo com vários SOS e DHT/DQT entre eles é aceito, SOS aparece uma vez", () => {
    const r = jpeg(jpegValido({ sofTipo: 0xc2, varreduras: 4 }));
    expect(r).toMatchObject({ ok: true, lado: 800 });
    expect(r.blocos.filter((b) => b === "SOS")).toHaveLength(1);
    expect(new Set(r.blocos).size).toBe(r.blocos.length);
  });

  it("perfil ICC válido em 1 pedaço é aceito", () => {
    const r = jpeg(jpegValido({ antes: iccEmPedacos(perfilIcc(), 1) }));
    expect(r).toMatchObject({ ok: true });
    expect(r.blocos).toContain("APP2:ICC");
  });

  it("perfil ICC válido em 3 pedaços é aceito, APP2:ICC aparece uma vez", () => {
    const r = jpeg(jpegValido({ antes: iccEmPedacos(perfilIcc(), 3) }));
    expect(r).toMatchObject({ ok: true });
    expect(r.blocos.filter((b) => b === "APP2:ICC")).toHaveLength(1);
  });
});

describe("JPEG com bloco proibido => metadado", () => {
  const casos: Array<[string, Uint8Array, string]> = [
    ["JFIF com miniatura 2x2 (comprimento 28)", jfifComMiniatura(), "APP0:JFIF"],
    ["JFIF com comprimento diferente de 16", jfifComprimento17(), "APP0:JFIF"],
    ["JFXX", jfxx(), "APP0:JFXX"],
    ["APP0 com outro identificador", app0Outro(), "APP0"],
    ["APP1 Exif (com GPS falso)", app1Exif(), "APP1:Exif"],
    ["APP1 XMP", app1Xmp(), "APP1:XMP"],
    ["APP1 outro", app1Outro(), "APP1"],
    ["APP2 com outro identificador", app2Outro(), "APP2"],
    ["APP13 IPTC", iptc(), "APP13"],
    ["APP14 Adobe", app14Adobe(), "APP14"],
    ["COM", com(), "COM"],
    ["DNL antes do SOF", dnl(), "DNL"],
    ["DAC", dac(), "DAC"],
    ["marcador FF C8", segmento(0xc8, bytes(0, 0)), "FFC8"],
    ["marcador FF F0", segmento(0xf0, bytes(0, 0)), "FFF0"],
    ["marcador FF FD", segmento(0xfd, bytes(0, 0)), "FFFD"],
  ];

  it.each(casos)("%s", (_nome, seg, bloco) => {
    const r = jpeg(jpegValido({ antes: [seg] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain(bloco);
  });

  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15])("APP%i", (n) => {
    const r = jpeg(jpegValido({ antes: [app(n, bytes(1, 2, 3, 4))] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain(`APP${n}`);
  });

  it("DNL depois de um SOS também é metadado", () => {
    const r = jpeg(jpegValido({ depoisDoSos: [dnl()] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain("DNL");
  });
});

describe("JPEG: precisão e componentes do SOF", () => {
  it("controle: precisão 8 é aceita", () => {
    expect(jpeg(jpegValido({ precisao: 8 }))).toMatchObject({ ok: true });
  });

  it.each([
    [0xc0, 12],
    [0xc1, 12],
    [0xc2, 12],
  ])("SOF marcador %i com precisão %i => formato (regra sof_precisao)", (sofTipo, precisao) => {
    expect(jpeg(jpegValido({ sofTipo, precisao }))).toMatchObject({
      ok: false,
      motivo: "formato",
      regra: "sof_precisao",
    });
  });

  it("SOF0 com precisão 0 => corrompida (regra sof_precisao)", () => {
    expect(jpeg(jpegValido({ sofTipo: 0xc0, precisao: 0 }))).toMatchObject({
      ok: false,
      motivo: "corrompida",
      regra: "sof_precisao",
    });
  });

  it.each([1, 3])("Nc = %i aceito", (nc) => {
    expect(jpeg(jpegValido({ nc }))).toMatchObject({ ok: true });
  });

  it.each([2, 4])("Nc = %i (comprimento coerente) => formato", (nc) => {
    expect(jpeg(jpegValido({ nc }))).toMatchObject({ ok: false, motivo: "formato" });
  });
});

describe("JPEG: JFIF só uma vez e logo depois do SOI", () => {
  it("controle: JFIF logo depois do SOI é aceito", () => {
    expect(jpeg(jpegValido())).toMatchObject({ ok: true });
  });

  it("controle: sem JFIF é aceito", () => {
    expect(jpeg(jpegValido({ semJfif: true }))).toMatchObject({ ok: true });
  });

  it("JFIF duplicado => metadado", () => {
    const r = jpeg(jpegValido({ antes: [jfif()] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
    expect(r.blocos).toContain("APP0:JFIF");
  });

  it("JFIF válido que não está logo depois do SOI => metadado", () => {
    const r = jpeg(jpegValido({ semJfif: true, antes: [dqt(), jfif()] }));
    expect(r).toMatchObject({ ok: false, motivo: "metadado" });
  });

  it("JFIF depois de outro segmento permitido (DRI) => metadado", () => {
    expect(jpeg(jpegValido({ antesDoJfif: [dri()] }))).toMatchObject({
      ok: false,
      motivo: "metadado",
    });
  });
});

describe("JPEG animado (MPF)", () => {
  it("APP2 MPF => animada", () => {
    const r = jpeg(jpegValido({ antes: [mpf()] }));
    expect(r).toMatchObject({ ok: false, motivo: "animada" });
    expect(r.blocos).toContain("APP2:MPF");
  });

  it("MPF e Exif juntos => animada vence metadado", () => {
    expect(jpeg(jpegValido({ antes: [app1Exif(), mpf()] }))).toMatchObject({
      ok: false,
      motivo: "animada",
    });
  });
});

describe("JPEG com SOFn não permitido => formato", () => {
  it.each([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])(
    "SOF com marcador %i, íntegro",
    (tipo) => {
      const r = jpeg(jpegValido({ sofTipo: tipo }));
      expect(r).toMatchObject({ ok: false, motivo: "formato" });
      expect(r.blocos).toContain(`SOF${tipo - 0xc0}`);
    },
  );
});

describe("JPEG com número de SOF errado => corrompida", () => {
  it("dois SOF", () => {
    const arquivo = juntar(
      soi(), jfif(), dqt(), sof(0xc0, 800, 800), sof(0xc2, 800, 800), dht(), sos(),
      bytes(0x12, 0x34), eoi(),
    );
    expect(jpeg(arquivo)).toMatchObject({ ok: false, motivo: "corrompida" });
  });

  it("nenhum SOF", () => {
    expect(jpeg(jpegValido({ semSof: true }))).toMatchObject({ ok: false, motivo: "corrompida" });
  });
});

describe("JPEG: perfil ICC em pedaços (APP2)", () => {
  const perfil = perfilIcc();

  it("pedaços fora de sequência => corrompida", () => {
    const pedacos = iccEmPedacos(perfil, 3, { seqs: [1, 3, 2] });
    expect(jpeg(jpegValido({ antes: pedacos }))).toMatchObject({ ok: false, motivo: "corrompida" });
  });

  it("total (N) inconsistente entre pedaços => corrompida", () => {
    const pedacos = iccEmPedacos(perfil, 3, { totais: [3, 3, 2] });
    expect(jpeg(jpegValido({ antes: pedacos }))).toMatchObject({ ok: false, motivo: "corrompida" });
  });

  it("perfil incompleto (faltou o último pedaço) => corrompida", () => {
    const pedacos = iccEmPedacos(perfil, 3).slice(0, 2);
    expect(jpeg(jpegValido({ antes: pedacos }))).toMatchObject({ ok: false, motivo: "corrompida" });
  });

  it("sequência começando em 0 => corrompida", () => {
    const pedacos = iccEmPedacos(perfil, 3, { seqs: [0, 1, 2] });
    expect(jpeg(jpegValido({ antes: pedacos }))).toMatchObject({ ok: false, motivo: "corrompida" });
  });

  it("repetição depois de completo => corrompida", () => {
    const pedacos = [...iccEmPedacos(perfil, 3), iccPedaco(1, 3, bytes(1, 2, 3))];
    expect(jpeg(jpegValido({ antes: pedacos }))).toMatchObject({ ok: false, motivo: "corrompida" });
  });

  it("pedaço repetido no meio da sequência => corrompida", () => {
    const pedacos = iccEmPedacos(perfil, 3, { seqs: [1, 1, 2] });
    expect(jpeg(jpegValido({ antes: pedacos }))).toMatchObject({ ok: false, motivo: "corrompida" });
  });

  it("depois do ICC completo, outro APP2 ICC de 1 pedaço => corrompida", () => {
    const pedacos = [...iccEmPedacos(perfil, 1), ...iccEmPedacos(perfil, 1)];
    expect(jpeg(jpegValido({ antes: pedacos }))).toMatchObject({ ok: false, motivo: "corrompida" });
  });
});
