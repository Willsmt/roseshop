import { describe, expect, it, vi } from "vitest";
import { TETO_BYTES } from "./codificar";
import {
  abrirImagem,
  prepararFoto,
  type AbrirImagem,
  type DependenciasAparelho,
  type ImagemAberta,
} from "./preparar-foto";
import type { CanvasDesenhavel, Pincel } from "./recortar";

// Feature 004, T080: abrirImagem e prepararFoto com dependências injetadas
// (US2-AC1/AC2, US2-AC3, US2-AC7, FR-013, FR-017, SC-005).

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const preencher = (inicio: number[], n = 200) => {
  const r = new Uint8Array(n);
  r.set(inicio);
  return r;
};

const ENTRADAS = {
  jpeg: preencher([0xff, 0xd8, 0xff, 0xe0]),
  png: preencher([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: preencher([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")]),
  heic: preencher([0, 0, 0, 24, ...ascii("ftyp"), ...ascii("heic"), 0, 0, 0, 0, ...ascii("mif1"), ...ascii("heic")]),
  gif: preencher(ascii("GIF89a")),
  svg: preencher(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>')),
  pdf: preencher(ascii("%PDF-1.7")),
} as const;

const arquivo = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes]);
const AREA = { x: 0, y: 0, lado: 800 };

type Comportamento = {
  imagem?: { width: number; height: number } | "falha";
  webp?: boolean;
  /** resposta do toBlob por tipo pedido e qualidade */
  contextoNulo?: boolean;
  webpRejeita?: boolean;
  codificador?: (tipo: string | undefined, q: number | undefined) => Blob | null;
};

const blob = (n: number, tipo: string) => new Blob([new Uint8Array(n)], { type: tipo });

function montar(c: Comportamento = {}) {
  const img = { width: 4000, height: 3000, close: vi.fn() };
  const abrir = vi.fn<AbrirImagem>(async () => {
    if (c.imagem === "falha") throw new Error("não abre");
    return Object.assign(img, c.imagem ?? {}) as ImagemAberta;
  });
  const canvases: CanvasDesenhavel[] = [];
  // dimensões do canvas no momento do toBlob (depois o prepararFoto zera o canvas) e blobs gerados
  const dimensoes: Array<{ width: number; height: number }> = [];
  const gerados: Blob[] = [];
  const pincel: Pincel = { imageSmoothingEnabled: false, imageSmoothingQuality: "low", drawImage: vi.fn() };
  const codificador = c.codificador ?? ((tipo) => blob(300_000, tipo ?? ""));
  const criarCanvas = vi.fn(() => {
    const canvas: CanvasDesenhavel = {
      width: 300,
      height: 150,
      getContext: () => (c.contextoNulo ? null : pincel),
      toBlob: (cb, tipo, q) => {
        dimensoes.push({ width: canvas.width, height: canvas.height });
        const b = codificador(tipo, q);
        if (b) gerados.push(b);
        cb(b);
      },
    };
    canvases.push(canvas);
    return canvas;
  });
  const suportaWebp = vi.fn(async () => {
    if (c.webpRejeita) throw new Error("suportaWebp falhou");
    return c.webp ?? true;
  });
  const deps: DependenciasAparelho = { abrir, criarCanvas, suportaWebp };
  return { deps, abrir, criarCanvas, suportaWebp, img, canvases, dimensoes, gerados };
}

describe("abrirImagem (T080, FR-017)", () => {
  it("chama o abridor com o arquivo e { imageOrientation: 'from-image' }", async () => {
    const img = { width: 10, height: 20 };
    const abrir = vi.fn<AbrirImagem>(async () => img);
    const a = arquivo(ENTRADAS.jpeg);
    const r = await abrirImagem(a, abrir);
    expect(r).toBe(img);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir.mock.calls[0]![0]).toBe(a);
    expect(abrir.mock.calls[0]![1]).toEqual({ imageOrientation: "from-image" });
  });

  it("rejeição do abridor ⇒ { motivo: 'nao_abre' }", async () => {
    const abrir = vi.fn<AbrirImagem>(async () => {
      throw new Error("InvalidStateError");
    });
    expect(await abrirImagem(arquivo(ENTRADAS.heic), abrir)).toEqual({ motivo: "nao_abre" });
  });

  it("abridor que lança de forma síncrona também vira nao_abre", async () => {
    const abrir: AbrirImagem = () => {
      throw new Error("sem suporte");
    };
    expect(await abrirImagem(arquivo(ENTRADAS.jpeg), abrir)).toEqual({ motivo: "nao_abre" });
  });
});

describe("prepararFoto: entradas que não são imagem suportada", () => {
  it.each([
    ["GIF", ENTRADAS.gif],
    ["SVG", ENTRADAS.svg],
    ["PDF", ENTRADAS.pdf],
    ["arquivo vazio", new Uint8Array(0)],
  ])("%s ⇒ formato, sem chamar abrir (US2-AC3)", async (_nome, bytes) => {
    const m = montar();
    expect(await prepararFoto(arquivo(bytes), AREA, m.deps)).toEqual({ motivo: "formato" });
    expect(m.abrir).not.toHaveBeenCalled();
    expect(m.criarCanvas).not.toHaveBeenCalled();
  });

  it("a decisão é pelos bytes: File com nome e MIME de JPEG mas bytes de PDF ⇒ formato", async () => {
    const m = montar();
    const f = new File([ENTRADAS.pdf], "foto.jpg", { type: "image/jpeg" });
    expect(await prepararFoto(f, AREA, m.deps)).toEqual({ motivo: "formato" });
    expect(m.abrir).not.toHaveBeenCalled();
  });

  it("lê só o início do arquivo para detectar (slice de até 64 bytes)", async () => {
    const m = montar();
    const a = arquivo(ENTRADAS.gif);
    const slice = vi.spyOn(a, "slice");
    await prepararFoto(a, AREA, m.deps);
    expect(slice).toHaveBeenCalledWith(0, 64);
  });
});

describe("prepararFoto: abertura", () => {
  it("heic que o navegador não abre ⇒ nao_abre (US2-AC7)", async () => {
    const m = montar({ imagem: "falha" });
    expect(await prepararFoto(arquivo(ENTRADAS.heic), AREA, m.deps)).toEqual({ motivo: "nao_abre" });
    expect(m.abrir).toHaveBeenCalledTimes(1);
  });

  it("jpeg corrompido que não abre ⇒ nao_abre", async () => {
    const m = montar({ imagem: "falha" });
    expect(await prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps)).toEqual({ motivo: "nao_abre" });
  });

  it("heic que abre ⇒ sucesso", async () => {
    const m = montar();
    const r = await prepararFoto(arquivo(ENTRADAS.heic), AREA, m.deps);
    expect(r).toMatchObject({ formato: "webp" });
    expect(m.abrir.mock.calls[0]![1]).toEqual({ imageOrientation: "from-image" });
  });
});

describe("prepararFoto: recorte e codificação", () => {
  it("png de entrada sai como webp quando há suporte", async () => {
    const m = montar({ webp: true });
    const r = await prepararFoto(arquivo(ENTRADAS.png), AREA, m.deps);
    expect(r).toMatchObject({ formato: "webp" });
    expect((r as { blob: Blob }).blob.type).toBe("image/webp");
  });

  it("png de entrada sai como jpeg quando não há suporte a webp", async () => {
    const m = montar({ webp: false });
    const r = await prepararFoto(arquivo(ENTRADAS.png), AREA, m.deps);
    expect(r).toMatchObject({ formato: "jpeg" });
    expect((r as { blob: Blob }).blob.type).toBe("image/jpeg");
  });

  it("sem webp ⇒ jpeg, e o canvas nunca é pedido em webp", async () => {
    const pedidos: Array<string | undefined> = [];
    const m = montar({
      webp: false,
      codificador: (tipo) => {
        pedidos.push(tipo);
        return blob(1000, tipo ?? "");
      },
    });
    await prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps);
    expect(pedidos).toEqual(["image/jpeg"]);
  });

  it("área pequena ⇒ pequena, sem criar canvas, e img.close é chamado", async () => {
    const m = montar();
    const r = await prepararFoto(arquivo(ENTRADAS.jpeg), { x: 0, y: 0, lado: 399 }, m.deps);
    expect(r).toEqual({ motivo: "pequena" });
    expect(m.criarCanvas).not.toHaveBeenCalled();
    expect(m.img.close).toHaveBeenCalledTimes(1);
  });

  it("imagem pequena (300×300) ⇒ pequena", async () => {
    const m = montar({ imagem: { width: 300, height: 300 } });
    expect(await prepararFoto(arquivo(ENTRADAS.jpeg), { x: 0, y: 0, lado: 300 }, m.deps)).toEqual({ motivo: "pequena" });
    expect(m.img.close).toHaveBeenCalled();
  });

  it("img.close é chamado também no sucesso", async () => {
    const m = montar();
    await prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps);
    expect(m.img.close).toHaveBeenCalled();
  });

  it("imagem sem close (ImagemAberta.close opcional) não quebra", async () => {
    const abrir = vi.fn<AbrirImagem>(async () => ({ width: 4000, height: 3000 }));
    const m = montar();
    const r = await prepararFoto(arquivo(ENTRADAS.jpeg), AREA, { ...m.deps, abrir });
    expect(r).toMatchObject({ formato: "webp" });
  });

  it("grande: estourou o teto na última qualidade ⇒ grande (repassado)", async () => {
    const m = montar({ codificador: (tipo) => blob(TETO_BYTES + 1, tipo ?? "") });
    expect(await prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps)).toEqual({ motivo: "grande" });
  });

  it("canvas do recorte: quadrado com o lado final (área 3000 ⇒ 1200)", async () => {
    const m = montar();
    await prepararFoto(arquivo(ENTRADAS.jpeg), { x: 500, y: 0, lado: 3000 }, m.deps);
    expect(m.canvases).toHaveLength(1);
    expect(m.dimensoes[0]).toEqual({ width: 1200, height: 1200 });
  });

  it("o blob devolvido nunca é o arquivo original (FR-013)", async () => {
    const m = montar();
    const a = arquivo(ENTRADAS.jpeg);
    const r = await prepararFoto(a, AREA, m.deps);
    expect("blob" in r && r.blob).not.toBe(a);
    expect((r as { blob: Blob }).blob).toBeInstanceOf(Blob);
  });

  it("webp que o navegador devolve como png ⇒ saída jpeg, nunca png", async () => {
    const m = montar({
      webp: true,
      codificador: (tipo) => (tipo === "image/webp" ? blob(100, "image/png") : blob(100, "image/jpeg")),
    });
    const r = await prepararFoto(arquivo(ENTRADAS.png), AREA, m.deps);
    expect(r).toMatchObject({ formato: "jpeg" });
    expect((r as { blob: Blob }).blob.type).toBe("image/jpeg");
  });

  it("jpeg com tipo errado (codificador quebrado) ⇒ nao_enviada, a promessa não rejeita", async () => {
    const m = montar({ webp: false, codificador: () => blob(100, "image/png") });
    await expect(prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps)).resolves.toEqual({ motivo: "nao_enviada" });
  });

  it("contexto 2d nulo ⇒ nao_enviada; img.close uma vez e toBlob nunca chamado", async () => {
    const toBlob = vi.fn();
    const m = montar({ contextoNulo: true });
    const criarCanvas = vi.fn(() => ({ ...m.criarCanvas(), toBlob }) as CanvasDesenhavel);
    const r = await prepararFoto(arquivo(ENTRADAS.jpeg), AREA, { ...m.deps, criarCanvas });
    expect(r).toEqual({ motivo: "nao_enviada" });
    expect(m.img.close).toHaveBeenCalledTimes(1);
    expect(toBlob).not.toHaveBeenCalled();
    expect(m.gerados).toHaveLength(0);
  });

  it("leitura do cabeçalho falhando (slice().arrayBuffer() rejeita) ⇒ nao_enviada; abrir nunca chamado", async () => {
    const m = montar();
    const a = arquivo(ENTRADAS.jpeg);
    vi.spyOn(a, "slice").mockReturnValue({ arrayBuffer: () => Promise.reject(new Error("leitura falhou")) } as unknown as Blob);
    await expect(prepararFoto(a, AREA, m.deps)).resolves.toEqual({ motivo: "nao_enviada" });
    expect(m.abrir).not.toHaveBeenCalled();
  });

  it("suportaWebp que rejeita ⇒ nao_enviada; img.close chamado", async () => {
    const m = montar({ webpRejeita: true });
    await expect(prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps)).resolves.toEqual({ motivo: "nao_enviada" });
    expect(m.img.close).toHaveBeenCalled();
  });

  it("abrir que falha continua dando nao_abre, não nao_enviada (regressão)", async () => {
    const m = montar({ imagem: "falha" });
    const r = await prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps);
    expect(r).toEqual({ motivo: "nao_abre" });
    expect(r).not.toEqual({ motivo: "nao_enviada" });
  });
});

describe("Teste de invariante: toda saída de sucesso respeita o contrato (SC-005, FR-013)", () => {
  const entradas = ["jpeg", "png", "webp", "heic"] as const;
  const areas = [
    ...[399, 400, 800, 1200, 3000].map((lado) => ({ x: 0, y: 0, lado })),
    { x: 3400, y: 0, lado: 1000 }, // deslocada, cortada na borda (origem com lado 600)
    { x: 500, y: 300, lado: 1000 }, // deslocada, inteira dentro da imagem
    { x: 3700, y: 0, lado: 3000 }, // cortada para 300 ⇒ pequena
  ];
  const imagens = [
    { width: 4000, height: 3000 },
    { width: 3000, height: 4000 },
    { width: 800, height: 800 },
    { width: 350, height: 350 },
  ];
  const codificadores: Array<[string, NonNullable<Comportamento["codificador"]>]> = [
    ["webp ok pequeno", (t) => blob(50_000, t ?? "")],
    ["no teto", (t) => blob(TETO_BYTES, t ?? "")],
    ["acima do teto", (t) => blob(TETO_BYTES + 1, t ?? "")],
    ["acima só na 1ª qualidade", (t, q) => blob(q === 0.82 || q === 0.85 ? TETO_BYTES + 5 : 200_000, t ?? "")],
    ["png no lugar de webp", (t) => (t === "image/webp" ? blob(10, "image/png") : blob(10, "image/jpeg"))],
    ["null no lugar de webp", (t) => (t === "image/webp" ? null : blob(10, "image/jpeg"))],
    ["jpeg falha (null)", (t) => (t === "image/jpeg" ? null : blob(10, "image/webp"))],
    ["jpeg falha (png) e webp falha", (t) => (t === "image/webp" ? null : blob(10, "image/png"))],
  ];
  const MOTIVOS = ["formato", "nao_abre", "pequena", "grande", "nao_enviada"];

  it("grade completa de entradas, imagens, áreas, suporte a webp e codificadores", async () => {
    let sucessos = 0;
    let falhas = 0;
    let naoEnviadas = 0;
    for (const entrada of entradas) {
      for (const imagem of imagens) {
        for (const area of areas) {
          for (const webp of [true, false]) {
            for (const [nome, cod] of codificadores) {
              const m = montar({ imagem, webp, codificador: cod });
              const ctx = `${entrada} ${imagem.width}x${imagem.height} area=${JSON.stringify(area)} webp=${webp} ${nome}`;
              // nunca rejeita: falha inesperada vira { motivo: "nao_enviada" }
              const r = await prepararFoto(arquivo(ENTRADAS[entrada]), area, m.deps);
              if ("blob" in r) {
                sucessos++;
                expect(["webp", "jpeg"], ctx).toContain(r.formato);
                expect(r.blob.type, ctx).toBe(`image/${r.formato}`);
                expect(r.blob.type, ctx).not.toBe("image/png");
                expect(r.blob.size, ctx).toBeLessThanOrEqual(TETO_BYTES);
                // o blob é exatamente um dos gerados pelo canvas (redesenho descarta metadados), nunca o arquivo
                expect(m.gerados, ctx).toContain(r.blob);
                expect(m.dimensoes.length, ctx).toBeGreaterThan(0);
                for (const d of m.dimensoes) {
                  expect(d.width, ctx).toBe(d.height);
                  expect(d.width, ctx).toBeGreaterThanOrEqual(400);
                  expect(d.width, ctx).toBeLessThanOrEqual(1200);
                }
                if (!webp) expect(r.formato, ctx).toBe("jpeg");
              } else {
                falhas++;
                if (r.motivo === "nao_enviada") naoEnviadas++;
                expect(MOTIVOS, ctx).toContain(r.motivo);
              }
            }
          }
        }
      }
    }
    expect(sucessos).toBeGreaterThan(0);
    expect(falhas).toBeGreaterThan(0);
    expect(naoEnviadas).toBeGreaterThan(0);
  });

  it("área deslocada e cortada na borda: origem com lado 600 ⇒ canvas 600×600", async () => {
    const m = montar();
    const r = await prepararFoto(arquivo(ENTRADAS.jpeg), { x: 3400, y: 0, lado: 1000 }, m.deps);
    expect(r).toMatchObject({ formato: "webp" });
    expect(m.dimensoes[0]).toEqual({ width: 600, height: 600 });
  });

  it("área deslocada inteira dentro da imagem: canvas 1000×1000", async () => {
    const m = montar();
    await prepararFoto(arquivo(ENTRADAS.jpeg), { x: 500, y: 300, lado: 1000 }, m.deps);
    expect(m.dimensoes[0]).toEqual({ width: 1000, height: 1000 });
  });

  it("o blob devolvido é exatamente o gerado pelo toBlob do canvas, não o arquivo de entrada", async () => {
    const m = montar();
    const a = arquivo(ENTRADAS.jpeg);
    const r = await prepararFoto(a, AREA, m.deps);
    expect((r as { blob: Blob }).blob).toBe(m.gerados[m.gerados.length - 1]);
    expect((r as { blob: Blob }).blob).not.toBe(a);
  });

  it("entradas não suportadas (gif, svg, pdf) nunca produzem sucesso", async () => {
    for (const k of ["gif", "svg", "pdf"] as const) {
      for (const area of areas) {
        const m = montar();
        const r = await prepararFoto(arquivo(ENTRADAS[k]), area, m.deps);
        expect(r).toEqual({ motivo: "formato" });
      }
    }
  });
});

describe("prepararFoto: libera o canvas depois de codificar", () => {
  it("sucesso ⇒ canvas com width 0 e height 0", async () => {
    const m = montar();
    await prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps);
    expect(m.canvases).toHaveLength(1);
    expect(m.canvases[0]!.width).toBe(0);
    expect(m.canvases[0]!.height).toBe(0);
  });

  it("grande ⇒ canvas com width 0 e height 0", async () => {
    const m = montar({ codificador: (t) => blob(TETO_BYTES + 1, t ?? "") });
    expect(await prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps)).toEqual({ motivo: "grande" });
    expect(m.canvases[0]!.width).toBe(0);
    expect(m.canvases[0]!.height).toBe(0);
  });

  it("falha do codificador (nao_enviada) ⇒ canvas com width 0 e height 0", async () => {
    const m = montar({ webp: false, codificador: () => null });
    await expect(prepararFoto(arquivo(ENTRADAS.jpeg), AREA, m.deps)).resolves.toEqual({ motivo: "nao_enviada" });
    expect(m.canvases[0]!.width).toBe(0);
    expect(m.canvases[0]!.height).toBe(0);
  });
});
