import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { FLAG_ICC, iccp, webpValido } from "./fixtures";
import { analisarIcc } from "./icc";
import { verificarImagem } from "./index";

// T097 (SF10): dado real do Chrome Android (Xiaomi Poco X7 Pro, 2026-10-11). As fotos não
// entram no repositório; só o perfil ICC que o Chrome embute no WebP (456 bytes, "sRGB",
// "Google Inc. 2016"), dentro de um WebP montado aqui com os mesmos blocos do `tail`
// (VP8X com só a flag de ICC, ICCP, VP8) e o lado dos objetos baixados (1200).

const PERFIL = "src/test/fixtures/fotos/aparelho/chrome-android-srgb.icc";

function lerPerfil(): Uint8Array {
  return new Uint8Array(fs.readFileSync(PERFIL));
}

function tagsDoPerfil(perfil: Uint8Array): string[] {
  const dv = new DataView(perfil.buffer, perfil.byteOffset, perfil.length);
  const n = dv.getUint32(128);
  return Array.from({ length: n }, (_, i) =>
    String.fromCharCode(...perfil.subarray(132 + 12 * i, 136 + 12 * i)),
  );
}

function webpDoChrome(perfil: Uint8Array): Uint8Array {
  return webpValido({ lado: 1200, flags: FLAG_ICC, antes: [iccp(perfil)] });
}

describe("perfil ICC real do Chrome Android", () => {
  it("é o perfil inspecionado com exiftool: 456 bytes e as 9 tags", () => {
    const perfil = lerPerfil();
    expect(perfil.length).toBe(456);
    expect(tagsDoPerfil(perfil)).toEqual([
      "desc",
      "rXYZ",
      "gXYZ",
      "bXYZ",
      "wtpt",
      "rTRC",
      "gTRC",
      "bTRC",
      "cprt",
    ]);
  });

  it("passa na regra do ICC sem nenhuma tag proibida", () => {
    expect(analisarIcc(lerPerfil())).toEqual({ resultado: "ok", regra: null, proibidas: [] });
  });
});

describe("WebP com o perfil real do Chrome Android", () => {
  it("é aceito com a recusa ligada, com os blocos vistos no tail", () => {
    const r = verificarImagem(webpDoChrome(lerPerfil()), { declarado: "webp", modo: "recusar" });
    expect(r).toEqual({ ok: true, formato: "webp", lado: 1200, blocos: ["VP8X", "ICCP", "VP8"] });
  });

  it("controle: o mesmo WebP declarado como JPEG é recusado por formato", () => {
    const r = verificarImagem(webpDoChrome(lerPerfil()), { declarado: "jpeg", modo: "recusar" });
    expect(r).toMatchObject({ ok: false, motivo: "formato" });
  });

  it("controle: uma tag a mais no perfil real (meta) recusa como metadado", () => {
    const perfil = lerPerfil();
    perfil.set([0x6d, 0x65, 0x74, 0x61], 132 + 12 * 8); // cprt -> meta
    const r = verificarImagem(webpDoChrome(perfil), { declarado: "webp", modo: "recusar" });
    expect(r).toMatchObject({ ok: false, motivo: "metadado", regra: "icc_tag" });
  });
});
