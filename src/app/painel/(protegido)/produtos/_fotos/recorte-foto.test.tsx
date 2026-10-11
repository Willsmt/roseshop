// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T086 — recorte 1:1 (US1-AC2, FR-007). react-easy-crop é trocado por um componente
// falso que registra as props e, se `chamarAoMontar`, chama onCropComplete ao montar.
// REVISÃO 2, correção 4: maxZoom = clamp(min(naturalWidth, naturalHeight) / 400, 1, 4),
// calculado no onMediaLoaded; antes de carregar, 1. O mesmo valor vale para o range.

type PropsCropper = {
  image?: string;
  crop: { x: number; y: number };
  zoom: number;
  aspect?: number;
  minZoom?: number;
  maxZoom?: number;
  restrictPosition?: boolean;
  objectFit?: string;
  onCropChange: (c: { x: number; y: number }) => void;
  onZoomChange?: (z: number) => void;
  onMediaLoaded?: (m: { naturalWidth: number; naturalHeight: number; width: number; height: number }) => void;
  onCropComplete?: (
    area: { x: number; y: number; width: number; height: number },
    pixels: { x: number; y: number; width: number; height: number },
  ) => void;
};

const falso = vi.hoisted(() => ({
  props: [] as unknown[],
  chamarAoMontar: true,
}));

vi.mock("react-easy-crop", () => ({
  default: function CropperFalso(props: PropsCropper) {
    falso.props.push(props);
    useEffect(() => {
      if (falso.chamarAoMontar) {
        props.onCropComplete?.(
          { x: 1, y: 2, width: 80, height: 80 },
          { x: 10.4, y: 20.6, width: 800.2, height: 799.8 },
        );
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="cropper-falso" />;
  },
}));

vi.mock("@/lib/fotos/actions", () => ({
  pedirEnvio: vi.fn(),
  confirmarEnvio: vi.fn(),
  adicionarFoto: vi.fn(),
  trocarFoto: vi.fn(),
  removerFoto: vi.fn(),
  moverFoto: vi.fn(),
}));

import * as acoes from "@/lib/fotos/actions";

import { RecorteFoto } from "./recorte-foto";

const ultimas = () => falso.props[falso.props.length - 1] as PropsCropper;
const arquivo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" });

let criar: ReturnType<typeof vi.fn>;
let revogar: ReturnType<typeof vi.fn>;
let fetchEspiao: ReturnType<typeof vi.fn>;

beforeEach(() => {
  falso.props = [];
  falso.chamarAoMontar = true;
  criar = vi.fn(() => "blob:recorte-1");
  revogar = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: criar });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: revogar });
  fetchEspiao = vi.fn();
  vi.stubGlobal("fetch", fetchEspiao);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// Simula o Cropper avisando que a imagem carregou (dimensões reais em naturalWidth/Height).
function carregar(naturalWidth: number, naturalHeight: number) {
  act(() => ultimas().onMediaLoaded?.({ naturalWidth, naturalHeight, width: 300, height: 300 }));
}

function montar() {
  const onUsar = vi.fn();
  const onCancelar = vi.fn();
  const r = render(<RecorteFoto arquivo={arquivo} onUsar={onUsar} onCancelar={onCancelar} />);
  return { ...r, onUsar, onCancelar };
}

describe("RecorteFoto — moldura (US1-AC2, FR-007)", () => {
  it("moldura 1:1: aspect=1, minZoom=1, restrictPosition=true (nunca sai da imagem), objectFit contain", () => {
    montar();
    const p = ultimas();
    expect(p.aspect).toBe(1);
    expect(p.minZoom).toBe(1);
    expect(p.restrictPosition).toBe(true);
    expect(p.objectFit).toBe("contain");
    expect(typeof p.onMediaLoaded).toBe("function");
  });

  it("correção 4: antes de a imagem carregar, maxZoom = 1 no Cropper e max = 1 no range", () => {
    montar();
    expect(ultimas().maxZoom).toBe(1);
    expect(screen.getByLabelText("Aproximar")).toHaveAttribute("max", "1");
  });

  it.each([
    [1600, 1200, 3],
    [1200, 1600, 3],
    [4000, 3000, 4],
    [500, 450, 1.125],
    [400, 400, 1],
  ])("correção 4: imagem %ix%i ⇒ maxZoom %s no Cropper e no max do range", (w, hgt, esperado) => {
    montar();
    carregar(w, hgt);
    expect(ultimas().maxZoom).toBe(esperado);
    expect(screen.getByLabelText("Aproximar")).toHaveAttribute("max", String(esperado));
  });

  it("correção 4: o zoom atual é limitado ao novo máximo", () => {
    montar();
    carregar(4000, 3000);
    act(() => ultimas().onZoomChange?.(3.5));
    expect(ultimas().zoom).toBe(3.5);
    carregar(500, 450);
    expect(ultimas().maxZoom).toBe(1.125);
    expect(ultimas().zoom).toBeLessThanOrEqual(1.125);
  });

  it("image = blob URL do arquivo, revogada ao desmontar", () => {
    const { unmount } = montar();
    expect(criar).toHaveBeenCalledWith(arquivo);
    expect(ultimas().image).toBe("blob:recorte-1");
    expect(revogar).not.toHaveBeenCalled();
    unmount();
    expect(revogar).toHaveBeenCalledWith("blob:recorte-1");
  });

  it('controle "Aproximar" (range 1 ao máximo calculado) muda o zoom passado ao Cropper', () => {
    montar();
    carregar(1600, 1200);
    const aproximar = screen.getByLabelText("Aproximar") as HTMLInputElement;
    expect(aproximar).toHaveAttribute("type", "range");
    expect(aproximar).toHaveAttribute("min", "1");
    expect(aproximar).toHaveAttribute("max", "3");
    expect(ultimas().zoom).toBe(1);
    fireEvent.change(aproximar, { target: { value: "2.5" } });
    expect(ultimas().zoom).toBe(2.5);
  });

  it("pinça (onZoomChange do Cropper) atualiza o zoom e o controle deslizante", () => {
    montar();
    carregar(4000, 3000);
    act(() => ultimas().onZoomChange?.(3));
    expect(ultimas().zoom).toBe(3);
    expect((screen.getByLabelText("Aproximar") as HTMLInputElement).value).toBe("3");
  });

  it("mover (onCropChange do Cropper) atualiza a posição passada ao Cropper", () => {
    montar();
    act(() => ultimas().onCropChange({ x: 5, y: -3 }));
    expect(ultimas().crop).toEqual({ x: 5, y: -3 });
  });
});

describe("RecorteFoto — confirmar ou cancelar", () => {
  it('"Usar esta foto" ⇒ onUsar({ x: 10, y: 21, lado: 800 }) (pixels arredondados, lado = menor dimensão)', () => {
    const { onUsar, onCancelar } = montar();
    const usar = screen.getByRole("button", { name: "Usar esta foto" });
    expect(usar).toBeEnabled();
    fireEvent.click(usar);
    expect(onUsar).toHaveBeenCalledTimes(1);
    expect(onUsar).toHaveBeenCalledWith({ x: 10, y: 21, lado: 800 });
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('"Usar esta foto" fica disabled enquanto não há área de recorte', () => {
    falso.chamarAoMontar = false;
    const { onUsar } = montar();
    const usar = screen.getByRole("button", { name: "Usar esta foto" });
    expect(usar).toBeDisabled();
    fireEvent.click(usar);
    expect(onUsar).not.toHaveBeenCalled();
  });

  it('"Cancelar" ⇒ onCancelar e onUsar não é chamado', () => {
    const { onUsar, onCancelar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onUsar).not.toHaveBeenCalled();
  });

  it("ambos os botões têm ≥ 48 px (min-h-12)", () => {
    montar();
    expect(screen.getByRole("button", { name: "Usar esta foto" })).toHaveClass("min-h-12");
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveClass("min-h-12");
  });

  it("US1-AC2 / FR-007: nada é enviado antes de \"Usar esta foto\" (nem action nem fetch), nem depois dentro do recorte", () => {
    montar();
    carregar(1600, 1200);
    const aproximar = screen.getByLabelText("Aproximar");
    fireEvent.change(aproximar, { target: { value: "2" } });
    act(() => ultimas().onCropChange({ x: 1, y: 1 }));
    act(() => ultimas().onZoomChange?.(1.5));
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(vi.mocked(acoes.pedirEnvio)).not.toHaveBeenCalled();
    expect(vi.mocked(acoes.confirmarEnvio)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usar esta foto" }));
    // O envio é responsabilidade de quem recebe onUsar: o recorte em si não envia nada.
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(vi.mocked(acoes.pedirEnvio)).not.toHaveBeenCalled();
    expect(vi.mocked(acoes.confirmarEnvio)).not.toHaveBeenCalled();
  });
});
