import { describe, expect, it, vi } from "vitest";
import { criarSuportaWebp, type CanvasCodificavel } from "./suporta-webp";

// Feature 004, T080: detecção de WebP no aparelho com canvas 1×1, uma vez por sessão (D4, SC-005).

type Resposta = Blob | null | "lanca";

function canvasComResposta(resposta: Resposta) {
  const toBlob = vi.fn<CanvasCodificavel["toBlob"]>((cb) => {
    if (resposta === "lanca") throw new Error("toBlob indisponível");
    cb(resposta);
  });
  const canvas: CanvasCodificavel = { width: 300, height: 150, toBlob };
  return { canvas, toBlob };
}

const blob = (tipo: string) => new Blob([new Uint8Array(4)], { type: tipo });

describe("criarSuportaWebp (T080)", () => {
  it("true quando o blob volta como image/webp", async () => {
    const { canvas } = canvasComResposta(blob("image/webp"));
    expect(await criarSuportaWebp(() => canvas)()).toBe(true);
  });

  it("usa um canvas 1×1 e pede image/webp", async () => {
    const { canvas, toBlob } = canvasComResposta(blob("image/webp"));
    await criarSuportaWebp(() => canvas)();
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toBlob.mock.calls[0]![1]).toBe("image/webp");
  });

  it("false quando o navegador devolve PNG no lugar (fallback do Safari)", async () => {
    const { canvas } = canvasComResposta(blob("image/png"));
    expect(await criarSuportaWebp(() => canvas)()).toBe(false);
  });

  it("false quando o blob é null", async () => {
    const { canvas } = canvasComResposta(null);
    expect(await criarSuportaWebp(() => canvas)()).toBe(false);
  });

  it("false quando toBlob lança", async () => {
    const { canvas } = canvasComResposta("lanca");
    expect(await criarSuportaWebp(() => canvas)()).toBe(false);
  });

  it("memoiza: chamadas em sequência criam um canvas só", async () => {
    const { canvas, toBlob } = canvasComResposta(blob("image/webp"));
    const criar = vi.fn(() => canvas);
    const suporta = criarSuportaWebp(criar);
    expect(await suporta()).toBe(true);
    expect(await suporta()).toBe(true);
    expect(await suporta()).toBe(true);
    expect(criar).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledTimes(1);
  });

  it("memoiza também o resultado false", async () => {
    const { canvas } = canvasComResposta(blob("image/png"));
    const criar = vi.fn(() => canvas);
    const suporta = criarSuportaWebp(criar);
    expect(await suporta()).toBe(false);
    expect(await suporta()).toBe(false);
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it("memoiza em chamadas concorrentes: um canvas só e o mesmo resultado", async () => {
    const { canvas, toBlob } = canvasComResposta(blob("image/webp"));
    const criar = vi.fn(() => canvas);
    const suporta = criarSuportaWebp(criar);
    const resultados = await Promise.all([suporta(), suporta(), suporta(), suporta()]);
    expect(resultados).toEqual([true, true, true, true]);
    expect(criar).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledTimes(1);
  });

  it("cada função criada tem a própria memória", async () => {
    const a = canvasComResposta(blob("image/webp"));
    const b = canvasComResposta(blob("image/png"));
    expect(await criarSuportaWebp(() => a.canvas)()).toBe(true);
    expect(await criarSuportaWebp(() => b.canvas)()).toBe(false);
  });
});
