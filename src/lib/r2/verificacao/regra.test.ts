import { describe, expect, it } from "vitest";

import {
  FLAG_ALPHA,
  FLAG_ANIMACAO,
  FLAG_EXIF,
  FLAG_ICC,
  TEXTO_COM_FALSO,
  TEXTO_GPS_FALSO,
  TEXTO_IPTC_FALSO,
  TEXTO_XMP_FALSO,
  alph,
  anim,
  anmf,
  app,
  app0Outro,
  app1Exif,
  app2Outro,
  ascii,
  bytes,
  chunk,
  chunkBruto,
  com,
  cortar,
  dac,
  dnl,
  dqt,
  exifChunk,
  gif,
  iccEmPedacos,
  iccp,
  jfif,
  jfifComMiniatura,
  jfifComprimento17,
  jfxx,
  jpegValido,
  juntar,
  mpf,
  perfilIcc,
  png,
  riff,
  segmento,
  segmentoComprimento,
  sof,
  vp8,
  vp8l,
  vp8x,
  webpValido,
} from "./fixtures";
import {
  verificarImagem,
  type FormatoImagem,
  type ModoVerificacao,
  type RegraVerificacao,
} from "./index";

// Contrato §4 de fotos.md: toda recusa traz `regra`, o subcódigo da primeira
// regra que decidiu. Um caso por código da tabela "Motivo | regra".

type Motivo = "formato" | "corrompida" | "metadado" | "animada" | "pequena" | "dimensao";
type Caso = [regra: string, motivo: Motivo, arquivo: () => Uint8Array, declarado?: FormatoImagem];

const verificar = (b: Uint8Array, declarado: FormatoImagem, modo: ModoVerificacao = "recusar") =>
  verificarImagem(b, { declarado, modo });

const perfilDmnd = () => perfilIcc({ tags: ["wtpt", "dmnd"] });

// JPEG sem alterar: soi, jfif, dqt, sof, dht, sos, dados, eoi vêm de jpegValido.
const casos: Caso[] = [
  // formato
  ["assinatura", "formato", () => png()],
  ["assinatura", "formato", () => gif(), "webp"],
  ["declarado", "formato", () => jpegValido(), "webp"],
  ["declarado", "formato", () => webpValido(), "jpeg"],
  ["sof_tipo", "formato", () => jpegValido({ sofTipo: 0xc3 })],
  ["sof_precisao", "formato", () => jpegValido({ precisao: 12 })],
  ["sof_componentes", "formato", () => jpegValido({ nc: 2 })],
  ["sof_componentes", "formato", () => jpegValido({ nc: 4 })],

  // corrompida (JPEG)
  ["jpeg_marcador", "corrompida", () => jpegValido({ antes: [bytes(0x12)] })],
  ["jpeg_marcador", "corrompida", () => jpegValido({ antes: [bytes(0xff, 0xff)] })],
  ["jpeg_marcador", "corrompida", () => jpegValido({ antes: [bytes(0xff, 0x01)] })],
  ["jpeg_marcador", "corrompida", () => jpegValido({ antes: [bytes(0xff, 0xd0)] })],
  ["jpeg_marcador", "corrompida", () => jpegValido({ antes: [bytes(0xff, 0xd8)] })],
  ["jpeg_comprimento", "corrompida", () => jpegValido({ antes: [segmentoComprimento(0xdb, 1, bytes(0, 1))] })],
  ["jpeg_comprimento", "corrompida", () => jpegValido({ antes: [segmentoComprimento(0xdb, 5000, bytes(0, 1))] })],
  ["jpeg_truncado", "corrompida", () => jpegValido({ semEoi: true })],
  ["jpeg_truncado", "corrompida", () => juntar(bytes(0xff, 0xd8), jfif())],
  ["jpeg_sem_sof_sos", "corrompida", () => jpegValido({ semSof: true })],
  ["jpeg_sem_sof_sos", "corrompida", () => jpegValido({ semSos: true })],
  ["jpeg_apos_eoi", "corrompida", () => jpegValido({ depoisDoEoi: [bytes(0)] })],
  ["jpeg_bloco_apos_sos", "corrompida", () => jpegValido({ depoisDoSos: [app1Exif()] })],
  ["jpeg_dri", "corrompida", () => jpegValido({ antes: [segmento(0xdd, bytes(0, 0, 0))] })],
  ["sof_duplicado", "corrompida", () => jpegValido({ antes: [sof(0xc0, 800, 800)] })],
  [
    "sof_estrutura",
    "corrompida",
    () =>
      jpegValido({
        semSof: true,
        antes: [segmento(0xc0, juntar(bytes(8, 0x03, 0x20, 0x03, 0x20, 3), bytes(1, 0x11, 0)))],
      }),
  ],
  ["sof_estrutura", "corrompida", () =>
    jpegValido({ semSof: true, antes: [segmento(0xc0, bytes(8, 0x03, 0x20, 0x03, 0x20, 0))] })],
  ["sof_precisao", "corrompida", () => jpegValido({ precisao: 0 })],
  ["sof_dimensao_zero", "corrompida", () => jpegValido({ largura: 0, altura: 800 })],
  ["sof_dimensao_zero", "corrompida", () => jpegValido({ largura: 800, altura: 0 })],
  [
    "sos_estrutura",
    "corrompida",
    () => juntar(jpegValido({ semSos: true, semEoi: true }), segmento(0xda, bytes(0, 0, 63, 0)), bytes(0x12), bytes(0xff, 0xd9)),
  ],
  [
    "icc_sequencia",
    "corrompida",
    () => jpegValido({ antes: iccEmPedacos(perfilIcc(), 3, { seqs: [1, 3, 2] }) }),
  ],
  ["icc_sequencia", "corrompida", () => jpegValido({ antes: iccEmPedacos(perfilIcc(), 3).slice(0, 2) })],
  ["icc_sequencia", "corrompida", () => jpegValido({ antes: iccEmPedacos(perfilIcc(), 3, { totais: [3, 3, 2] }) })],

  // corrompida (WebP)
  ["riff_tamanho", "corrompida", () => webpValido({ extraFim: bytes(0) }), "webp"],
  ["riff_tamanho", "corrompida", () => cortar(webpValido(), 20), "webp"],
  ["webp_chunk_truncado", "corrompida", () => riff([chunkBruto("VP8 ", 1000, new Uint8Array(12))]), "webp"],
  ["vp8x_estrutura", "corrompida", () => riff([vp8(800, 800), vp8x(0, 800, 800)]), "webp"],
  ["vp8x_estrutura", "corrompida", () => riff([chunk("VP8X", new Uint8Array(11)), vp8(800, 800)]), "webp"],
  ["vp8x_reservado", "corrompida", () => webpValido({ flags: 0x40 }), "webp"],
  ["vp8x_reservado", "corrompida", () => riff([vp8x(0, 800, 800, [0, 1, 0]), vp8(800, 800)]), "webp"],
  ["vp8x_dimensao", "corrompida", () => webpValido({ flags: 0, dimensoesVp8x: [900, 900] }), "webp"],
  ["iccp_posicao", "corrompida", () => riff([iccp(perfilIcc()), vp8(800, 800)]), "webp"],
  ["iccp_posicao", "corrompida", () => webpValido({ flags: FLAG_ICC, depois: [iccp(perfilIcc())] }), "webp"],
  ["iccp_sem_chunk", "corrompida", () => webpValido({ flags: FLAG_ICC }), "webp"],
  ["iccp_sem_flag", "corrompida", () => webpValido({ flags: 0, antes: [iccp(perfilIcc())] }), "webp"],
  ["alph_posicao", "corrompida", () => riff([alph(), vp8(800, 800)]), "webp"],
  ["alph_posicao", "corrompida", () => webpValido({ flags: FLAG_ALPHA, depois: [alph()] }), "webp"],
  ["alph_sem_flag", "corrompida", () => webpValido({ flags: 0, antes: [alph()] }), "webp"],
  ["alph_com_vp8l", "corrompida", () => webpValido({ flags: FLAG_ALPHA, bitstream: "vp8l", antes: [alph()] }), "webp"],
  ["imagem_duplicada", "corrompida", () => riff([vp8x(0, 800, 800), vp8(800, 800), vp8(800, 800)]), "webp"],
  ["imagem_ausente", "corrompida", () => riff([vp8x(0, 800, 800)]), "webp"],
  ["vp8_cabecalho", "corrompida", () => riff([vp8(800, 800, { keyframe: false })]), "webp"],
  ["vp8_cabecalho", "corrompida", () => riff([vp8(0, 800)]), "webp"],
  ["vp8l_cabecalho", "corrompida", () => riff([vp8l(800, 800, { marcador: 0x2e })]), "webp"],
  ["vp8l_cabecalho", "corrompida", () => riff([vp8l(800, 800, { versao: 1 })]), "webp"],

  // corrompida (ICC)
  ["icc_estrutura", "corrompida", () => jpegValido({ antes: iccEmPedacos(perfilIcc({ semAcsp: true }), 1) })],
  [
    "icc_estrutura",
    "corrompida",
    () => webpValido({ flags: FLAG_ICC, antes: [iccp(perfilIcc({ contagemDeclarada: 1000 }))] }),
    "webp",
  ],

  // animada
  ["mpf", "animada", () => jpegValido({ antes: [mpf()] })],
  ["vp8x_animacao", "animada", () => webpValido({ flags: FLAG_ANIMACAO }), "webp"],
  ["anim", "animada", () => riff([vp8x(0, 800, 800), anim()]), "webp"],
  ["anim", "animada", () => riff([vp8x(0, 800, 800), anmf()]), "webp"],

  // metadado
  ["jfif_miniatura", "metadado", () => jpegValido({ semJfif: true, antes: [jfifComMiniatura()] })],
  ["jfif_posicao", "metadado", () => jpegValido({ antes: [jfif()] })],
  ["jfif_posicao", "metadado", () => jpegValido({ semJfif: true, antes: [dqt(), jfif()] })],
  ["app0_outro", "metadado", () => jpegValido({ antes: [app0Outro()] })],
  ["app0_outro", "metadado", () => jpegValido({ semJfif: true, antes: [jfxx()] })],
  ["jfif_miniatura", "metadado", () => jpegValido({ semJfif: true, antes: [jfifComprimento17()] })],
  ["app1", "metadado", () => jpegValido({ antes: [app1Exif()] })],
  ["app2_outro", "metadado", () => jpegValido({ antes: [app2Outro()] })],
  ["appn", "metadado", () => jpegValido({ antes: [app(3, bytes(1, 2))] })],
  ["appn", "metadado", () => jpegValido({ antes: [app(14, ascii("Adobe"))] })],
  ["appn", "metadado", () => jpegValido({ antes: [app(15, bytes(1, 2))] })],
  ["com", "metadado", () => jpegValido({ antes: [com()] })],
  ["marcador_fora_da_lista", "metadado", () => jpegValido({ antes: [dnl()] })],
  ["marcador_fora_da_lista", "metadado", () => jpegValido({ antes: [dac()] })],
  ["marcador_fora_da_lista", "metadado", () => jpegValido({ antes: [segmento(0xc8, bytes(0, 0))] })],
  ["marcador_fora_da_lista", "metadado", () => jpegValido({ antes: [segmento(0xf0, bytes(0, 0))] })],
  ["vp8x_flag_metadado", "metadado", () => webpValido({ flags: FLAG_EXIF }), "webp"],
  ["chunk_fora_da_lista", "metadado", () => webpValido({ flags: 0, depois: [exifChunk()] }), "webp"],
  ["chunk_fora_da_lista", "metadado", () => webpValido({ flags: 0, depois: [chunk("ABCD", bytes(1, 2))] }), "webp"],
  ["icc_tag", "metadado", () => jpegValido({ antes: iccEmPedacos(perfilDmnd(), 1) })],
  [
    "icc_tag",
    "metadado",
    () => webpValido({ flags: FLAG_ICC, antes: [iccp(perfilDmnd())] }),
    "webp",
  ],
  ["icc_tamanho", "metadado", () => jpegValido({ antes: iccEmPedacos(perfilIcc({ tamanhoFinal: 8193 }), 1) })],
  [
    "icc_tamanho",
    "metadado",
    () => webpValido({ flags: FLAG_ICC, antes: [iccp(perfilIcc({ tamanhoFinal: 8193 }))] }),
    "webp",
  ],

  // dimensao e pequena
  ["nao_quadrada", "dimensao", () => jpegValido({ largura: 800, altura: 600 })],
  ["nao_quadrada", "dimensao", () => jpegValido({ largura: 1500, altura: 1300 })],
  ["nao_quadrada", "dimensao", () => webpValido({ largura: 1500, altura: 1300 }), "webp"],
  ["lado_maior", "dimensao", () => jpegValido({ lado: 1201 })],
  ["lado_maior", "dimensao", () => webpValido({ lado: 1201, bitstream: "vp8l" }), "webp"],
  ["lado_menor", "pequena", () => jpegValido({ lado: 399 })],
  ["lado_menor", "pequena", () => webpValido({ lado: 399 }), "webp"],
];

// Exaustivo por tipo: código novo na união RegraVerificacao sem entrada aqui
// quebra o tsc.
const CODIGOS_DO_CONTRATO: Record<RegraVerificacao, true> = {
  assinatura: true,
  declarado: true,
  sof_tipo: true,
  sof_precisao: true,
  sof_componentes: true,
  jpeg_marcador: true,
  jpeg_comprimento: true,
  jpeg_truncado: true,
  jpeg_sem_sof_sos: true,
  jpeg_apos_eoi: true,
  jpeg_bloco_apos_sos: true,
  jpeg_dri: true,
  sof_duplicado: true,
  sof_estrutura: true,
  sof_dimensao_zero: true,
  sos_estrutura: true,
  icc_sequencia: true,
  riff_tamanho: true,
  webp_chunk_truncado: true,
  vp8x_estrutura: true,
  vp8x_reservado: true,
  vp8x_dimensao: true,
  iccp_posicao: true,
  iccp_sem_chunk: true,
  iccp_sem_flag: true,
  alph_posicao: true,
  alph_sem_flag: true,
  alph_com_vp8l: true,
  imagem_duplicada: true,
  imagem_ausente: true,
  vp8_cabecalho: true,
  vp8l_cabecalho: true,
  icc_estrutura: true,
  mpf: true,
  vp8x_animacao: true,
  anim: true,
  jfif_miniatura: true,
  jfif_posicao: true,
  app0_outro: true,
  app1: true,
  app2_outro: true,
  appn: true,
  com: true,
  marcador_fora_da_lista: true,
  vp8x_flag_metadado: true,
  chunk_fora_da_lista: true,
  icc_tag: true,
  icc_tamanho: true,
  nao_quadrada: true,
  lado_maior: true,
  lado_menor: true,
};
const CODIGOS = Object.keys(CODIGOS_DO_CONTRATO);

describe("regra: um caso por código da tabela do contrato", () => {
  it.each(casos)("%s (%s)", (regra, motivo, arquivo, declarado = "jpeg") => {
    expect(verificar(arquivo(), declarado)).toMatchObject({ ok: false, motivo, regra });
  });

  it("os casos cobrem todos os códigos do contrato (guarda contra passar no vazio)", () => {
    const cobertos = new Set(casos.map(([regra]) => regra));
    expect([...cobertos].sort()).toEqual([...CODIGOS].sort());
  });

  it("o arquivo vazio dá assinatura", () => {
    expect(verificar(new Uint8Array(0), "jpeg")).toMatchObject({ ok: false, regra: "assinatura" });
  });
});

describe("regra: desempate", () => {
  it("não quadrada vence lado_maior (mesmo acima de 1200)", () => {
    expect(verificar(jpegValido({ largura: 2000, altura: 1000 }), "jpeg")).toMatchObject({
      motivo: "dimensao",
      regra: "nao_quadrada",
    });
  });

  it("metadado: vale a primeira regra na ordem do arquivo (COM antes do Exif)", () => {
    expect(verificar(jpegValido({ antes: [com(), app1Exif()] }), "jpeg")).toMatchObject({
      motivo: "metadado",
      regra: "com",
    });
  });

  it("metadado: vale a primeira regra na ordem do arquivo (Exif antes do COM)", () => {
    expect(verificar(jpegValido({ antes: [app1Exif(), com()] }), "jpeg")).toMatchObject({
      motivo: "metadado",
      regra: "app1",
    });
  });

  it("metadado WebP: flag no VP8X vem antes do chunk EXIF", () => {
    expect(
      verificar(webpValido({ flags: FLAG_EXIF, depois: [exifChunk()] }), "webp"),
    ).toMatchObject({ motivo: "metadado", regra: "vp8x_flag_metadado" });
  });

  it("animada: MPF vale mesmo com Exif antes", () => {
    expect(verificar(jpegValido({ antes: [app1Exif(), mpf()] }), "jpeg")).toMatchObject({
      motivo: "animada",
      regra: "mpf",
    });
  });

  it("SOFn não permitido: vale o primeiro motivo de formato (sof_tipo)", () => {
    expect(verificar(jpegValido({ sofTipo: 0xc3, antes: [app1Exif()] }), "jpeg")).toMatchObject({
      motivo: "formato",
      regra: "sof_tipo",
    });
  });
});

describe("regra: forma e ausência de conteúdo do arquivo", () => {
  const segredos = [
    TEXTO_GPS_FALSO, "GPSLatitude", "FALSO", TEXTO_XMP_FALSO, TEXTO_IPTC_FALSO, TEXTO_COM_FALSO,
    "SEGREDO", "http", "Photoshop",
  ];

  it("toda recusa tem regra /^[a-z0-9_]+$/ com até 32 caracteres, sem conteúdo do arquivo", () => {
    expect(casos.length).toBeGreaterThan(50);
    for (const [, , arquivo, declarado = "jpeg"] of casos) {
      const r = verificar(arquivo(), declarado);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      const regra = (r as { regra?: unknown }).regra;
      expect(typeof regra).toBe("string");
      expect(regra as string).toMatch(/^[a-z0-9_]+$/);
      expect((regra as string).length).toBeLessThanOrEqual(32);
      for (const s of segredos) expect(regra as string).not.toContain(s);
    }
  });

  it("ok:true não tem regra", () => {
    const r = verificar(jpegValido(), "jpeg");
    expect(r.ok).toBe(true);
    expect(r).not.toHaveProperty("regra");
  });

  it("FourCC e marcadores com conteúdo do arquivo não vazam para a regra", () => {
    const r = verificar(webpValido({ flags: 0, depois: [chunk("a/b!", bytes(1, 2))] }), "webp");
    expect(r).toMatchObject({ motivo: "metadado", regra: "chunk_fora_da_lista" });
  });
});
