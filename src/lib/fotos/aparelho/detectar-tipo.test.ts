import { describe, expect, it } from "vitest";
import { BYTES_CABECALHO, detectarTipo } from "./detectar-tipo";

// Feature 004, T078: o tipo de entrada vem dos bytes, nunca do nome nem do MIME (US2-AC3, US2-AC7).

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** Cabeçalho com preenchimento de zeros até `tamanho` bytes. */
function bytes(inicio: number[], tamanho = BYTES_CABECALHO): Uint8Array {
  const r = new Uint8Array(Math.max(tamanho, inicio.length));
  r.set(inicio);
  return r;
}

/** Caixa ftyp: tamanho BE, "ftyp", marca principal, versão, marcas compatíveis. */
function ftyp(principal: string, compativeis: string[] = [], tamanhoDeclarado?: number): Uint8Array {
  const corpo = [...ascii("ftyp"), ...ascii(principal), 0, 0, 0, 0, ...compativeis.flatMap(ascii)];
  const total = tamanhoDeclarado ?? corpo.length + 4;
  return bytes([(total >>> 24) & 255, (total >>> 16) & 255, (total >>> 8) & 255, total & 255, ...corpo]);
}

describe("detectarTipo (T078)", () => {
  it("expõe BYTES_CABECALHO = 64", () => {
    expect(BYTES_CABECALHO).toBe(64);
  });

  describe("formatos aceitos como entrada", () => {
    it("jpeg: FF D8 FF", () => {
      expect(detectarTipo(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
      expect(detectarTipo(bytes([0xff, 0xd8, 0xff, 0xe1]))).toBe("jpeg");
    });

    it("png: assinatura de 8 bytes (PNG é aceito como entrada)", () => {
      expect(detectarTipo(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    });

    it("png: assinatura incompleta ou errada não é png", () => {
      expect(detectarTipo(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]))).toBe("outro");
      expect(detectarTipo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("outro");
    });

    it("webp: RIFF + 4 bytes quaisquer + WEBP", () => {
      expect(detectarTipo(bytes([...ascii("RIFF"), 0x10, 0x20, 0x30, 0x40, ...ascii("WEBP")]))).toBe("webp");
      expect(detectarTipo(bytes([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]))).toBe("webp");
    });

    it.each(["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs"])(
      "heic: marca principal %s",
      (marca) => {
        expect(detectarTipo(ftyp(marca))).toBe("heic");
      },
    );

    it.each(["mif1", "msf1"])("heic: marca principal %s com heic entre as compatíveis", (marca) => {
      expect(detectarTipo(ftyp(marca, ["mif1", "heic"]))).toBe("heic");
    });

    it("heic: compatível heic em qualquer posição a partir do byte 16", () => {
      expect(detectarTipo(ftyp("mif1", ["miaf", "MiHB", "hevc"]))).toBe("heic");
    });
  });

  describe("tudo o mais é outro", () => {
    it.each([
      ["GIF87a", ascii("GIF87a")],
      ["GIF89a", ascii("GIF89a")],
      ["SVG (<svg)", ascii("<svg xmlns=\"http://www.w3.org/2000/svg\">")],
      ["SVG (<?xml)", ascii("<?xml version=\"1.0\"?><svg>")],
      ["PDF", ascii("%PDF-1.7")],
      ["RIFF WAVE", [...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")]],
    ])("%s ⇒ outro", (_nome, inicio) => {
      expect(detectarTipo(bytes(inicio))).toBe("outro");
    });

    it("AVIF (marca principal avif) ⇒ outro", () => {
      expect(detectarTipo(ftyp("avif", ["mif1", "miaf"]))).toBe("outro");
    });

    it("AVIF (mif1 só com avif compatível) ⇒ outro", () => {
      expect(detectarTipo(ftyp("mif1", ["avif", "miaf"]))).toBe("outro");
    });

    it("mif1 sem nenhuma marca heic compatível ⇒ outro", () => {
      expect(detectarTipo(ftyp("mif1", ["miaf", "MiHB"]))).toBe("outro");
    });

    it("ftyp com marca principal desconhecida (mp4) ⇒ outro", () => {
      expect(detectarTipo(ftyp("isom", ["mp41"]))).toBe("outro");
    });

    it("marca heic depois do fim da caixa ftyp não conta", () => {
      // caixa declara 20 bytes (uma marca compatível); heic aparece além disso
      expect(detectarTipo(ftyp("mif1", ["miaf", "heic"], 20))).toBe("outro");
    });

    it("ftyp com tamanho 0: percorre as marcas até o fim do cabeçalho (mif1 + heic ⇒ heic)", () => {
      expect(detectarTipo(ftyp("mif1", ["miaf", "heic"], 0))).toBe("heic");
    });

    it("ftyp com tamanho 0 e compatível só avif ⇒ outro", () => {
      expect(detectarTipo(ftyp("mif1", ["miaf", "avif"], 0))).toBe("outro");
    });

    // tamanho estendido (ISO BMFF): 00 00 00 01, "ftyp", tamanho de 64 bits (8..15),
    // marca principal em 16..19, versão em 20..23, compatíveis a partir do byte 24
    function ftypEstendido(principal: string, compativeis: string[] = []): Uint8Array {
      return bytes([
        0, 0, 0, 1,
        ...ascii("ftyp"),
        0, 0, 0, 0, 0, 0, 0, 32,
        ...ascii(principal),
        0, 0, 0, 0,
        ...compativeis.flatMap(ascii),
      ]);
    }

    it("ftyp com tamanho estendido (1) e marca principal heic ⇒ heic", () => {
      expect(detectarTipo(ftypEstendido("heic"))).toBe("heic");
    });

    it("ftyp com tamanho estendido (1), mif1 com compatíveis miaf e heic ⇒ heic", () => {
      expect(detectarTipo(ftypEstendido("mif1", ["miaf", "heic"]))).toBe("heic");
    });

    it("ftyp com tamanho estendido (1), mif1 com compatíveis miaf e avif ⇒ outro", () => {
      expect(detectarTipo(ftypEstendido("mif1", ["miaf", "avif"]))).toBe("outro");
    });

    it("cabeçalho vazio ⇒ outro", () => {
      expect(detectarTipo(new Uint8Array(0))).toBe("outro");
    });

    it("cabeçalho curto demais ⇒ outro", () => {
      expect(detectarTipo(new Uint8Array([0xff, 0xd8]))).toBe("outro");
      expect(detectarTipo(new Uint8Array(ascii("RIFF")))).toBe("outro");
      expect(detectarTipo(new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0]))).toBe("outro");
      expect(detectarTipo(new Uint8Array([0, 0, 0, 24, ...ascii("ftyp")]))).toBe("outro");
    });

    it("zeros ⇒ outro", () => {
      expect(detectarTipo(new Uint8Array(64))).toBe("outro");
    });
  });

  describe("decide só pelos bytes", () => {
    it("a função só recebe bytes: bytes de PDF ⇒ outro, qualquer que seja o nome do arquivo", () => {
      expect(detectarTipo.length).toBe(1);
      const pdf = bytes(ascii("%PDF-1.4"));
      // "foto.jpg", "foto.png" ou "foto.heic" não mudam nada: o nome nem chega à função
      expect(detectarTipo(pdf)).toBe("outro");
    });

    it("bytes de JPEG ⇒ jpeg mesmo que o arquivo se chame .pdf", () => {
      expect(detectarTipo(bytes([0xff, 0xd8, 0xff, 0xdb]))).toBe("jpeg");
    });

    it("não altera o cabeçalho recebido", () => {
      const c = bytes([0xff, 0xd8, 0xff, 0xe0]);
      const copia = Uint8Array.from(c);
      detectarTipo(c);
      expect(c).toEqual(copia);
    });
  });
});
