// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EscolherFoto } from "./escolher-foto";

// T085 — escolha da foto (US1-AC1, US1-AC4, contracts/telas.md, contrato interno SF9).

function simularPonteiro(grosso: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    matches: grosso && query === "(pointer: coarse)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });
  return matchMedia;
}

const entrada = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const arquivo = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" });

let clique: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clique = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("EscolherFoto — celular (pointer: coarse)", () => {
  beforeEach(() => {
    simularPonteiro(true);
  });

  it('US1-AC1: mostra "Tirar foto" e "Escolher da galeria", ambos ≥ 48 px (min-h-12)', async () => {
    render(<EscolherFoto quantidade={0} onEscolher={vi.fn()} />);
    const tirar = await screen.findByRole("button", { name: "Tirar foto" });
    const galeria = screen.getByRole("button", { name: "Escolher da galeria" });
    expect(tirar).toHaveClass("min-h-12");
    expect(galeria).toHaveClass("min-h-12");
    expect(tirar).toBeEnabled();
    expect(galeria).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Escolher arquivo" })).toBeNull();
  });

  it('"Tirar foto" usa input com capture="environment"; a galeria, input sem capture; ambos accept="image/*"', async () => {
    render(<EscolherFoto quantidade={0} onEscolher={vi.fn()} />);
    await screen.findByRole("button", { name: "Tirar foto" });
    const camera = entrada("entrada-camera");
    const galeria = entrada("entrada-galeria");
    expect(camera).toHaveAttribute("type", "file");
    expect(galeria).toHaveAttribute("type", "file");
    expect(camera).toHaveAttribute("accept", "image/*");
    expect(galeria).toHaveAttribute("accept", "image/*");
    expect(camera).toHaveAttribute("capture", "environment");
    expect(galeria).not.toHaveAttribute("capture");
  });

  it("clicar em cada botão aciona o click do input correspondente", async () => {
    render(<EscolherFoto quantidade={0} onEscolher={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tirar foto" }));
    expect(clique).toHaveBeenCalledTimes(1);
    expect(clique.mock.contexts[0]).toBe(entrada("entrada-camera"));

    fireEvent.click(screen.getByRole("button", { name: "Escolher da galeria" }));
    expect(clique).toHaveBeenCalledTimes(2);
    expect(clique.mock.contexts[1]).toBe(entrada("entrada-galeria"));
  });

  it('US1-AC4: com 3 fotos os botões ficam indisponíveis e aparece "Máximo de 3 fotos"', async () => {
    render(<EscolherFoto quantidade={3} onEscolher={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Tirar foto" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Escolher da galeria" })).toBeDisabled();
    expect(screen.getByText("Máximo de 3 fotos")).toBeInTheDocument();
  });

  it('a palavra "Tirar" só aparece em "Tirar foto"', async () => {
    const { container } = render(<EscolherFoto quantidade={0} onEscolher={vi.fn()} />);
    await screen.findByRole("button", { name: "Tirar foto" });
    const ocorrencias = (container.textContent ?? "").match(/Tirar/g) ?? [];
    expect(ocorrencias).toHaveLength(1);
    const atributos = Array.from(container.querySelectorAll("*")).flatMap((el) =>
      ["aria-label", "title", "placeholder"].map((a) => el.getAttribute(a) ?? ""),
    );
    expect(atributos.filter((v) => /Tirar/.test(v))).toEqual([]);
  });
});

describe("EscolherFoto — desktop", () => {
  beforeEach(() => {
    simularPonteiro(false);
  });

  it('mostra só "Escolher arquivo" (input accept="image/*" sem capture), ≥ 48 px', () => {
    render(<EscolherFoto quantidade={0} onEscolher={vi.fn()} />);
    const botao = screen.getByRole("button", { name: "Escolher arquivo" });
    expect(botao).toHaveClass("min-h-12");
    expect(screen.queryByRole("button", { name: "Tirar foto" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Escolher da galeria" })).toBeNull();
    const input = entrada("entrada-arquivo");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).not.toHaveAttribute("capture");
    expect(screen.queryByTestId("entrada-camera")).toBeNull();
  });

  it('clicar em "Escolher arquivo" aciona o click do input', () => {
    render(<EscolherFoto quantidade={1} onEscolher={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Escolher arquivo" }));
    expect(clique).toHaveBeenCalledTimes(1);
    expect(clique.mock.contexts[0]).toBe(entrada("entrada-arquivo"));
  });

  it("change com arquivo ⇒ onEscolher(arquivo) e o value do input volta a \"\"", () => {
    const onEscolher = vi.fn();
    render(<EscolherFoto quantidade={0} onEscolher={onEscolher} />);
    const input = entrada("entrada-arquivo");
    // jsdom não deixa atribuir value não vazio a input file: valor próprio para observar o reset.
    Object.defineProperty(input, "value", { configurable: true, writable: true, value: "C:\\fakepath\\foto.jpg" });
    const f = arquivo();
    fireEvent.change(input, { target: { files: [f] } });
    expect(onEscolher).toHaveBeenCalledTimes(1);
    expect(onEscolher).toHaveBeenCalledWith(f);
    expect(input.value).toBe("");
  });

  it("change sem arquivo não chama onEscolher", () => {
    const onEscolher = vi.fn();
    render(<EscolherFoto quantidade={0} onEscolher={onEscolher} />);
    fireEvent.change(entrada("entrada-arquivo"), { target: { files: [] } });
    expect(onEscolher).not.toHaveBeenCalled();
  });

  it('US1-AC4: quantidade 3 ⇒ "Escolher arquivo" disabled e "Máximo de 3 fotos"', () => {
    render(<EscolherFoto quantidade={3} onEscolher={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Escolher arquivo" })).toBeDisabled();
    expect(screen.getByText("Máximo de 3 fotos")).toBeInTheDocument();
  });

  it('com menos de 3 fotos não mostra "Máximo de 3 fotos"', () => {
    render(<EscolherFoto quantidade={2} onEscolher={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Escolher arquivo" })).toBeEnabled();
    expect(screen.queryByText("Máximo de 3 fotos")).toBeNull();
  });

  it('desabilitado ⇒ botão disabled, sem o texto "Máximo de 3 fotos"', () => {
    render(<EscolherFoto quantidade={1} onEscolher={vi.fn()} desabilitado />);
    expect(screen.getByRole("button", { name: "Escolher arquivo" })).toBeDisabled();
    expect(screen.queryByText("Máximo de 3 fotos")).toBeNull();
  });
});

describe("EscolherFoto — celular desabilitado", () => {
  it("desabilitado ⇒ os dois botões disabled, sem o texto do máximo", async () => {
    simularPonteiro(true);
    render(<EscolherFoto quantidade={0} onEscolher={vi.fn()} desabilitado />);
    expect(await screen.findByRole("button", { name: "Tirar foto" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Escolher da galeria" })).toBeDisabled();
    expect(screen.queryByText("Máximo de 3 fotos")).toBeNull();
  });

  it("change no input da câmera ⇒ onEscolher(arquivo)", async () => {
    simularPonteiro(true);
    const onEscolher = vi.fn();
    render(<EscolherFoto quantidade={0} onEscolher={onEscolher} />);
    await screen.findByRole("button", { name: "Tirar foto" });
    const f = arquivo();
    fireEvent.change(entrada("entrada-camera"), { target: { files: [f] } });
    expect(onEscolher).toHaveBeenCalledWith(f);
  });
});
