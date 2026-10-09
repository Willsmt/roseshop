import { describe, expect, it, vi } from "vitest";
import {
  desenharRecorte,
  LADO_MAXIMO,
  LADO_MINIMO,
  recortar,
  type CanvasDesenhavel,
  type Pincel,
  type Recorte,
} from "./recortar";

// Feature 004, T079: recorte quadrado de 400 a 1200 px (FR-016, FR-018, US2-AC1/AC2).

const IMG = { width: 4000, height: 3000 };

describe("recortar (T079)", () => {
  it("constantes: 400 e 1200", () => {
    expect(LADO_MINIMO).toBe(400);
    expect(LADO_MAXIMO).toBe(1200);
  });

  it("4000×3000, área {500,0,3000} ⇒ origem {500,0,3000}, lado 1200 (reduz)", () => {
    expect(recortar(IMG, { x: 500, y: 0, lado: 3000 })).toEqual({
      origem: { x: 500, y: 0, lado: 3000 },
      lado: 1200,
    });
  });

  it("área {0,0,800} ⇒ lado 800 (não amplia nem reduz)", () => {
    expect(recortar(IMG, { x: 0, y: 0, lado: 800 })).toEqual({ origem: { x: 0, y: 0, lado: 800 }, lado: 800 });
  });

  it("limite inferior: 400 passa; 399.9 é pequena", () => {
    expect(recortar(IMG, { x: 0, y: 0, lado: 400 })).toEqual({ origem: { x: 0, y: 0, lado: 400 }, lado: 400 });
    expect(recortar(IMG, { x: 0, y: 0, lado: 399.9 })).toEqual({ motivo: "pequena" });
    expect(recortar(IMG, { x: 0, y: 0, lado: 399 })).toEqual({ motivo: "pequena" });
  });

  it("limite superior: 1200 fica 1200; 1201 é reduzido a 1200", () => {
    expect(recortar(IMG, { x: 0, y: 0, lado: 1200 })).toMatchObject({ lado: 1200 });
    expect(recortar(IMG, { x: 0, y: 0, lado: 1201 })).toMatchObject({ origem: { lado: 1201 }, lado: 1200 });
  });

  it("área saindo da imagem é limitada: {3700,0,3000} em 4000×3000 ⇒ origem 300 ⇒ pequena", () => {
    expect(recortar(IMG, { x: 3700, y: 0, lado: 3000 })).toEqual({ motivo: "pequena" });
  });

  it("área saindo da imagem mas ainda ≥ 400 é cortada na borda", () => {
    expect(recortar(IMG, { x: 3400, y: 0, lado: 3000 })).toEqual({
      origem: { x: 3400, y: 0, lado: 600 },
      lado: 600,
    });
    expect(recortar(IMG, { x: 0, y: 2500, lado: 800 })).toEqual({
      origem: { x: 0, y: 2500, lado: 500 },
      lado: 500,
    });
  });

  it("x e y negativos viram 0", () => {
    expect(recortar(IMG, { x: -50, y: -10, lado: 800 })).toEqual({ origem: { x: 0, y: 0, lado: 800 }, lado: 800 });
  });

  it("x e y fracionários são arredondados para baixo; lado da origem também", () => {
    expect(recortar(IMG, { x: 10.9, y: 20.5, lado: 800.7 })).toEqual({
      origem: { x: 10, y: 20, lado: 800 },
      lado: 800,
    });
  });

  it("nunca amplia: imagem 500×500 inteira ⇒ lado 500", () => {
    expect(recortar({ width: 500, height: 500 }, { x: 0, y: 0, lado: 500 })).toEqual({
      origem: { x: 0, y: 0, lado: 500 },
      lado: 500,
    });
  });

  it("imagem menor que 400 ⇒ pequena, mesmo com área cobrindo tudo", () => {
    expect(recortar({ width: 399, height: 399 }, { x: 0, y: 0, lado: 399 })).toEqual({ motivo: "pequena" });
    expect(recortar({ width: 3000, height: 300 }, { x: 0, y: 0, lado: 3000 })).toEqual({ motivo: "pequena" });
  });

  it.each([
    ["lado 0", { x: 0, y: 0, lado: 0 }],
    ["lado negativo", { x: 0, y: 0, lado: -800 }],
    ["lado NaN", { x: 0, y: 0, lado: Number.NaN }],
    ["lado Infinity", { x: 0, y: 0, lado: Number.POSITIVE_INFINITY }],
    ["x NaN", { x: Number.NaN, y: 0, lado: 800 }],
    ["y Infinity", { x: 0, y: Number.POSITIVE_INFINITY, lado: 800 }],
  ])("valor inválido (%s) ⇒ pequena", (_nome, area) => {
    expect(recortar(IMG, area)).toEqual({ motivo: "pequena" });
  });

  it("sempre quadrado e dentro de 400–1200, em retratos e paisagens", () => {
    const imagens = [
      { width: 4000, height: 3000 },
      { width: 3000, height: 4000 },
      { width: 1500, height: 1500 },
      { width: 800, height: 5000 },
    ];
    const areas = [
      { x: 0, y: 0, lado: 400 },
      { x: 100, y: 200, lado: 900 },
      { x: 700, y: 900, lado: 2500 },
      { x: 5000, y: 5000, lado: 2500 },
      { x: 0, y: 0, lado: 399.9 },
    ];
    for (const img of imagens) {
      for (const a of areas) {
        const r = recortar(img, a);
        if ("motivo" in r) {
          expect(r.motivo).toBe("pequena");
          continue;
        }
        expect(r.lado).toBeGreaterThanOrEqual(400);
        expect(r.lado).toBeLessThanOrEqual(1200);
        expect(r.lado).toBeLessThanOrEqual(r.origem.lado);
        expect(r.origem.x + r.origem.lado).toBeLessThanOrEqual(img.width);
        expect(r.origem.y + r.origem.lado).toBeLessThanOrEqual(img.height);
        expect(Number.isInteger(r.lado)).toBe(true);
      }
    }
  });
});

function pincelFalso(): Pincel & { drawImage: ReturnType<typeof vi.fn> } {
  return { imageSmoothingEnabled: false, imageSmoothingQuality: "low", drawImage: vi.fn<Pincel["drawImage"]>() };
}

function canvasFalso(pincel: Pincel | null): CanvasDesenhavel {
  return { width: 300, height: 150, getContext: vi.fn(() => pincel), toBlob: vi.fn() } as unknown as CanvasDesenhavel;
}

describe("desenharRecorte (T079)", () => {
  const recorte: Recorte = { origem: { x: 500, y: 20, lado: 3000 }, lado: 1200 };

  it("cria um canvas quadrado do lado final", () => {
    const canvas = canvasFalso(pincelFalso());
    const criar = vi.fn(() => canvas);
    const r = desenharRecorte({ id: "img" }, recorte, criar);
    expect(criar).toHaveBeenCalledTimes(1);
    expect(r).toBe(canvas);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(1200);
  });

  it("pede o contexto 2d", () => {
    const canvas = canvasFalso(pincelFalso());
    desenharRecorte({}, recorte, () => canvas);
    expect(canvas.getContext).toHaveBeenCalledWith("2d");
  });

  it("liga o smoothing em qualidade alta", () => {
    const pincel = pincelFalso();
    desenharRecorte({}, recorte, () => canvasFalso(pincel));
    expect(pincel.imageSmoothingEnabled).toBe(true);
    expect(pincel.imageSmoothingQuality).toBe("high");
  });

  it("chama drawImage uma vez com origem quadrada e destino 0,0,lado,lado", () => {
    const pincel = pincelFalso();
    const img = { id: "img" };
    desenharRecorte(img, recorte, () => canvasFalso(pincel));
    expect(pincel.drawImage).toHaveBeenCalledTimes(1);
    expect(pincel.drawImage).toHaveBeenCalledWith(img, 500, 20, 3000, 3000, 0, 0, 1200, 1200);
  });

  it("recorte sem redução: origem e destino com o mesmo lado", () => {
    const pincel = pincelFalso();
    const canvas = canvasFalso(pincel);
    desenharRecorte("img", { origem: { x: 0, y: 0, lado: 800 }, lado: 800 }, () => canvas);
    expect(pincel.drawImage).toHaveBeenCalledWith("img", 0, 0, 800, 800, 0, 0, 800, 800);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(800);
  });

  it("contexto null ⇒ lança Error", () => {
    expect(() => desenharRecorte({}, recorte, () => canvasFalso(null))).toThrow(Error);
  });
});
