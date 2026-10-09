import { describe, expect, it, vi } from "vitest";
import { codificar, FalhaCodificacao, QUALIDADES, TETO_BYTES, type FormatoSaida } from "./codificar";
import type { CanvasCodificavel } from "./suporta-webp";

// Feature 004, T080: laço de qualidade até caber em 1 MB, sem PNG na saída (SC-005, FR-013, D4).

const blob = (n: number, tipo: string) => new Blob([new Uint8Array(n)], { type: tipo });

type Resposta = Blob | null | "lanca";

/** Canvas cujo toBlob responde segundo (tipo, qualidade); registra as chamadas. */
function canvasFalso(responder: (tipo: string | undefined, q: number | undefined) => Resposta) {
  const chamadas: Array<{ tipo: string | undefined; q: number | undefined }> = [];
  const canvas: CanvasCodificavel = {
    width: 800,
    height: 800,
    toBlob(cb, tipo, q) {
      chamadas.push({ tipo, q });
      const r = responder(tipo, q);
      if (r === "lanca") throw new Error("falha no toBlob");
      cb(r);
    },
  };
  return { canvas, chamadas };
}

/** Tamanhos por qualidade, no tipo pedido. */
function porQualidade(tamanhos: Record<string, number>) {
  return (tipo: string | undefined, q: number | undefined) => blob(tamanhos[String(q)] ?? TETO_BYTES + 1, tipo ?? "");
}

describe("constantes de codificar", () => {
  it("teto de 1.048.576 bytes", () => {
    expect(TETO_BYTES).toBe(1_048_576);
  });

  it("qualidades: webp [0.82, 0.72, 0.62], jpeg [0.85, 0.72, 0.62]", () => {
    expect(QUALIDADES.webp).toEqual([0.82, 0.72, 0.62]);
    expect(QUALIDADES.jpeg).toEqual([0.85, 0.72, 0.62]);
  });
});

describe("codificar: laço de qualidade (T080, SC-005)", () => {
  it("webp que cabe de primeira: uma chamada, image/webp, qualidade 0.82", async () => {
    const { canvas, chamadas } = canvasFalso(porQualidade({ "0.82": 500_000 }));
    const r = await codificar(canvas, "webp");
    expect(r).toMatchObject({ formato: "webp" });
    expect((r as { blob: Blob }).blob.type).toBe("image/webp");
    expect(chamadas).toEqual([{ tipo: "image/webp", q: 0.82 }]);
  });

  it("jpeg que cabe de primeira: image/jpeg, qualidade 0.85", async () => {
    const { canvas, chamadas } = canvasFalso(porQualidade({ "0.85": 500_000 }));
    const r = await codificar(canvas, "jpeg");
    expect(r).toMatchObject({ formato: "jpeg" });
    expect(chamadas).toEqual([{ tipo: "image/jpeg", q: 0.85 }]);
  });

  it("webp: tenta 0.82, 0.72 e 0.62 em ordem e para na primeira que cabe", async () => {
    const { canvas, chamadas } = canvasFalso(porQualidade({ "0.82": 2_000_000, "0.72": 1_500_000, "0.62": 900_000 }));
    const r = await codificar(canvas, "webp");
    expect(chamadas.map((c) => c.q)).toEqual([0.82, 0.72, 0.62]);
    expect(r).toMatchObject({ formato: "webp" });
    expect((r as { blob: Blob }).blob.size).toBe(900_000);
  });

  it("jpeg: tenta 0.85, 0.72 e 0.62 em ordem", async () => {
    const { canvas, chamadas } = canvasFalso(porQualidade({}));
    await codificar(canvas, "jpeg");
    expect(chamadas.map((c) => c.q)).toEqual([0.85, 0.72, 0.62]);
  });

  it("para na segunda qualidade se ela couber (não tenta a terceira)", async () => {
    const { canvas, chamadas } = canvasFalso(porQualidade({ "0.82": 1_100_000, "0.72": 1_000_000, "0.62": 100 }));
    const r = await codificar(canvas, "webp");
    expect(chamadas.map((c) => c.q)).toEqual([0.82, 0.72]);
    expect((r as { blob: Blob }).blob.size).toBe(1_000_000);
  });

  it("exatamente o teto (1.048.576) cabe", async () => {
    const { canvas } = canvasFalso(porQualidade({ "0.82": TETO_BYTES }));
    const r = await codificar(canvas, "webp");
    expect(r).toMatchObject({ formato: "webp" });
    expect((r as { blob: Blob }).blob.size).toBe(1_048_576);
  });

  it("1.048.577 não cabe: passa para a próxima qualidade", async () => {
    const { canvas, chamadas } = canvasFalso(porQualidade({ "0.82": TETO_BYTES + 1, "0.72": 10 }));
    const r = await codificar(canvas, "webp");
    expect(chamadas.map((c) => c.q)).toEqual([0.82, 0.72]);
    expect((r as { blob: Blob }).blob.size).toBe(10);
  });

  it("estourou na última qualidade ⇒ { motivo: 'grande' } (sem trocar de formato)", async () => {
    const { canvas, chamadas } = canvasFalso(porQualidade({}));
    expect(await codificar(canvas, "webp")).toEqual({ motivo: "grande" });
    expect(chamadas.map((c) => c.tipo)).toEqual(["image/webp", "image/webp", "image/webp"]);
    expect(await codificar(canvas, "jpeg")).toEqual({ motivo: "grande" });
  });

  it("usa a lista de qualidades passada pelo chamador", async () => {
    const { canvas, chamadas } = canvasFalso(porQualidade({}));
    expect(await codificar(canvas, "jpeg", [0.9, 0.5])).toEqual({ motivo: "grande" });
    expect(chamadas.map((c) => c.q)).toEqual([0.9, 0.5]);
  });
});

describe("codificar: PNG nunca sai (T080, D4)", () => {
  it("webp que volta image/png ⇒ recodifica tudo em jpeg com as qualidades do jpeg", async () => {
    const { canvas, chamadas } = canvasFalso((tipo, q) =>
      tipo === "image/webp" ? blob(100, "image/png") : blob(q === 0.85 ? TETO_BYTES + 1 : 200_000, "image/jpeg"),
    );
    const r = await codificar(canvas, "webp");
    expect(r).toMatchObject({ formato: "jpeg" });
    expect((r as { blob: Blob }).blob.type).toBe("image/jpeg");
    expect(chamadas).toEqual([
      { tipo: "image/webp", q: 0.82 },
      { tipo: "image/jpeg", q: 0.85 },
      { tipo: "image/jpeg", q: 0.72 },
    ]);
  });

  it("webp devolvendo PNG pequeno não é aceito, mesmo cabendo no teto", async () => {
    const { canvas } = canvasFalso((tipo) => blob(10, tipo === "image/webp" ? "image/png" : "image/jpeg"));
    const r = await codificar(canvas, "webp");
    expect((r as { blob: Blob }).blob.type).not.toBe("image/png");
    expect(r).toMatchObject({ formato: "jpeg" });
  });

  it("webp com tipo estranho (image/gif) também recodifica em jpeg", async () => {
    const { canvas } = canvasFalso((tipo) => blob(10, tipo === "image/webp" ? "image/gif" : "image/jpeg"));
    expect(await codificar(canvas, "webp")).toMatchObject({ formato: "jpeg" });
  });

  it("webp que volta null ⇒ jpeg", async () => {
    const { canvas } = canvasFalso((tipo) => (tipo === "image/webp" ? null : blob(10, "image/jpeg")));
    expect(await codificar(canvas, "webp")).toMatchObject({ formato: "jpeg" });
  });

  it("webp cujo toBlob lança ⇒ jpeg", async () => {
    const { canvas } = canvasFalso((tipo) => (tipo === "image/webp" ? "lanca" : blob(10, "image/jpeg")));
    expect(await codificar(canvas, "webp")).toMatchObject({ formato: "jpeg" });
  });

  it("falha do webp na 2ª qualidade também recomeça em jpeg a partir de 0.85", async () => {
    const { canvas, chamadas } = canvasFalso((tipo, q) => {
      if (tipo === "image/webp") return q === 0.82 ? blob(TETO_BYTES + 1, "image/webp") : blob(10, "image/png");
      return blob(10, "image/jpeg");
    });
    const r = await codificar(canvas, "webp");
    expect(r).toMatchObject({ formato: "jpeg" });
    expect(chamadas[chamadas.length - 1]).toEqual({ tipo: "image/jpeg", q: 0.85 });
  });

  it("webp cai em jpeg e jpeg estoura o teto ⇒ grande", async () => {
    const { canvas } = canvasFalso((tipo) => (tipo === "image/webp" ? null : blob(TETO_BYTES + 1, "image/jpeg")));
    expect(await codificar(canvas, "webp")).toEqual({ motivo: "grande" });
  });

  it.each([
    ["tipo errado (image/png)", () => blob(10, "image/png")],
    ["tipo errado (image/webp)", () => blob(10, "image/webp")],
    ["null", () => null],
    ["toBlob que lança", () => "lanca" as const],
  ])("jpeg com %s ⇒ rejeita FalhaCodificacao", async (_nome, resposta) => {
    const { canvas } = canvasFalso(resposta);
    await expect(codificar(canvas, "jpeg")).rejects.toBeInstanceOf(FalhaCodificacao);
  });

  it("FalhaCodificacao é um Error", () => {
    expect(new FalhaCodificacao("x")).toBeInstanceOf(Error);
  });

  it("nenhum cenário devolve image/png", async () => {
    const formatos: FormatoSaida[] = ["webp", "jpeg"];
    const respostas: Array<(t: string | undefined) => Resposta> = [
      () => blob(10, "image/png"),
      (t) => blob(10, t ?? ""),
      (t) => (t === "image/webp" ? blob(10, "image/png") : blob(10, "image/jpeg")),
      () => null,
    ];
    for (const f of formatos) {
      for (const resp of respostas) {
        const { canvas } = canvasFalso((t) => resp(t));
        const r = await codificar(canvas, f).catch((e: unknown) => e);
        if (r && typeof r === "object" && "blob" in r) {
          expect((r as { blob: Blob }).blob.type).not.toBe("image/png");
        }
      }
    }
  });

  it("não usa vi.fn para nada fora do toBlob (sanidade do espião)", async () => {
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(blob(10, "image/webp")));
    const canvas: CanvasCodificavel = { width: 1, height: 1, toBlob };
    await codificar(canvas, "webp");
    expect(toBlob).toHaveBeenCalledTimes(1);
  });
});
