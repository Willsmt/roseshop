// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fase 7 (ADR-005): o logo da janela. O three nunca roda aqui: a cena é substituída por um dublê
// que registra o que a ilha pede (montar, iniciar, parar, destruir).

const controle = vi.hoisted(() => ({ iniciar: vi.fn(), parar: vi.fn(), destruir: vi.fn() }));
const cena = vi.hoisted(() => ({
  primeiroQuadro: null as null | (() => void),
  montarCena: vi.fn(),
}));
vi.mock("./logo-3d/cena", () => ({ montarCena: cena.montarCena }));

import { LogoJanela } from "./logo-janela";

// IntersectionObserver controlável: o teste decide se o logo está na tela.
let aoCruzar: ((e: { isIntersecting: boolean }[]) => void) | null = null;
class ObservadorFalso {
  constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
    aoCruzar = cb;
  }
  observe() {}
  disconnect() {}
}

const reduzido = { matches: false, listeners: new Set<() => void>() };

function ambiente({
  movimentoReduzido = false,
  saveData = false,
  nucleos = 8 as number | undefined,
  webgl = true,
} = {}) {
  reduzido.matches = movimentoReduzido;
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return reduzido.matches;
    },
    addEventListener: (_: string, f: () => void) => reduzido.listeners.add(f),
    removeEventListener: (_: string, f: () => void) => reduzido.listeners.delete(f),
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(navigator, "connection", { value: { saveData }, configurable: true });
  Object.defineProperty(navigator, "hardwareConcurrency", { value: nucleos, configurable: true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => (webgl ? { getExtension: () => null } : null) as unknown as RenderingContext,
  );
}

beforeEach(() => {
  cena.montarCena.mockReset().mockImplementation((_c: HTMLCanvasElement, _t: number, primeiro: () => void) => {
    cena.primeiroQuadro = primeiro;
    return controle;
  });
  controle.iniciar.mockClear();
  controle.parar.mockClear();
  controle.destruir.mockClear();
  reduzido.listeners.clear();
  aoCruzar = null;
  window.IntersectionObserver = ObservadorFalso as unknown as typeof IntersectionObserver;
  // Ocioso na hora: o teste não espera o navegador.
  window.requestIdleCallback = ((f: IdleRequestCallback) => {
    f({ didTimeout: false, timeRemaining: () => 50 });
    return 1;
  }) as typeof window.requestIdleCallback;
  window.cancelIdleCallback = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const svg = (c: HTMLElement) => c.querySelector('[data-logo="janela"] svg');
const canvas = (c: HTMLElement) => c.querySelector('[data-logo="janela"] canvas');

describe("LogoJanela: o que o servidor entrega", () => {
  it("só o SVG, sem canvas, sem texto e sem estilo (o HTML da 005 não muda)", () => {
    const html = renderToStaticMarkup(<LogoJanela />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("svg")).not.toBeNull();
    expect(doc.querySelector("canvas")).toBeNull();
    expect(doc.body.textContent).toBe("");
    expect(html).not.toContain("style=");
  });
});

describe("LogoJanela: quando fica o SVG", () => {
  it.each([
    ["movimento reduzido", { movimentoReduzido: true }],
    ["economia de dados ligada", { saveData: true }],
    ["processador com 4 núcleos", { nucleos: 4 }],
    ["WebGL indisponível", { webgl: false }],
  ])("%s: o 3D nem é baixado", async (_nome, cond) => {
    ambiente(cond);
    const { container } = render(<LogoJanela />);
    await act(async () => {});
    expect(cena.montarCena).not.toHaveBeenCalled();
    expect(canvas(container)).toBeNull();
    expect(svg(container)).not.toBeNull();
  });

  it("se a cena falhar ao montar, volta ao SVG", async () => {
    ambiente();
    cena.montarCena.mockImplementation(() => {
      throw new Error("sem contexto");
    });
    const { container } = render(<LogoJanela />);
    await waitFor(() => expect(cena.montarCena).toHaveBeenCalled());
    await waitFor(() => expect(canvas(container)).toBeNull());
    expect(svg(container)?.getAttribute("style")).toBeNull();
  });
});

describe("LogoJanela: com o 3D", () => {
  async function comTresD() {
    ambiente();
    const r = render(<LogoJanela />);
    await waitFor(() => expect(cena.montarCena).toHaveBeenCalledTimes(1));
    return r;
  }

  it("o canvas entra invisível por cima e só aparece no primeiro quadro; o SVG segura o espaço", async () => {
    const { container } = await comTresD();
    const c = canvas(container) as HTMLCanvasElement;
    expect(c.getAttribute("aria-hidden")).toBe("true");
    expect(c.style.opacity).toBe("0");
    expect(svg(container)).not.toBeNull();
    act(() => cena.primeiroQuadro?.());
    expect(c.style.opacity).toBe("1");
    expect((svg(container) as SVGElement).style.opacity).toBe("0");
  });

  it("pausa fora da tela e volta ao reaparecer", async () => {
    await comTresD();
    controle.parar.mockClear();
    act(() => aoCruzar?.([{ isIntersecting: false }]));
    expect(controle.parar).toHaveBeenCalledTimes(1);
    controle.iniciar.mockClear();
    act(() => aoCruzar?.([{ isIntersecting: true }]));
    expect(controle.iniciar).toHaveBeenCalledTimes(1);
  });

  it("pausa com a aba em segundo plano", async () => {
    await comTresD();
    controle.parar.mockClear();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(controle.parar).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("pedir menos movimento no meio do caminho desliga o 3D e libera tudo", async () => {
    const { container } = await comTresD();
    reduzido.matches = true;
    act(() => {
      for (const f of reduzido.listeners) f();
    });
    expect(controle.destruir).toHaveBeenCalledTimes(1);
    expect(canvas(container)).toBeNull();
  });

  it("ao sair da página, libera renderer, geometrias e materiais", async () => {
    const { unmount } = await comTresD();
    unmount();
    expect(controle.destruir).toHaveBeenCalledTimes(1);
  });
});
