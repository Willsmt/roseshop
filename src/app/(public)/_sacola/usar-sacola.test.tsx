// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHAVE } from "@/lib/sacola/armazenamento";
import { desmontarTudo, hidratar, outraAbaGravou } from "@/test/hidratar";

import { useSacola } from "./usar-sacola";

// Feature 006, SF5, T044 (research D9/D13, FR-002a, FR-008, US4.4): o estado do servidor é `null`;
// depois de hidratar, a sacola é lida do aparelho; outra aba só faz reler, nunca gravar.

function Sonda() {
  const s = useSacola();
  if (s === null) return <p>nulo</p>;
  return <p>{s.itens.map((i) => `${i.codigo}x${i.quantidade}`).join(",") || "vazia"}</p>;
}

const gravada = (...codigos: string[]) =>
  JSON.stringify({ v: 1, t: Date.now(), i: codigos.map((c) => ({ c, q: 1, p: 600, a: false })) });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  await desmontarTudo();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useSacola", () => {
  it("renderToString devolve o estado do servidor (null), mesmo com sacola gravada", () => {
    window.localStorage.setItem(CHAVE, gravada("0042"));
    expect(renderToString(<Sonda />)).toBe("<p>nulo</p>");
  });

  it("depois de hidratar, lê a sacola do aparelho", async () => {
    window.localStorage.setItem(CHAVE, gravada("0042", "0007"));
    const { html, container } = await hidratar(<Sonda />);
    expect(html).toBe("<p>nulo</p>");
    expect(container.textContent).toBe("0042x1,0007x1");
  });

  it("sem sacola gravada, hidratado vira sacola vazia (não null)", async () => {
    const { container } = await hidratar(<Sonda />);
    expect(container.textContent).toBe("vazia");
  });

  it("localStorage que lança ⇒ continua null, sem erro nem console.error (US4.4)", async () => {
    const erro = vi.spyOn(console, "error");
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    const { container } = await hidratar(<Sonda />);
    expect(container.textContent).toBe("nulo");
    expect(erro).not.toHaveBeenCalled();
  });

  it("getItem que lança ⇒ continua null", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("x");
    });
    const { container } = await hidratar(<Sonda />);
    expect(container.textContent).toBe("nulo");
  });

  it("evento storage de outra aba re-renderiza sem chamar setItem (FR-008a)", async () => {
    window.localStorage.setItem(CHAVE, gravada("0042"));
    const { container } = await hidratar(<Sonda />);
    expect(container.textContent).toBe("0042x1");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    await outraAbaGravou(CHAVE, gravada("0042", "0007"));
    expect(container.textContent).toBe("0042x1,0007x1");
    // A única gravação foi a da "outra aba", feita pelo próprio teste.
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("outra aba esvazia a sacola ⇒ vazia", async () => {
    window.localStorage.setItem(CHAVE, gravada("0042"));
    const { container } = await hidratar(<Sonda />);
    await outraAbaGravou(CHAVE, null);
    expect(container.textContent).toBe("vazia");
  });

  it("evento storage de outra chave não muda nada", async () => {
    window.localStorage.setItem(CHAVE, gravada("0042"));
    const { container } = await hidratar(<Sonda />);
    await outraAbaGravou("outra.coisa", "1");
    expect(container.textContent).toBe("0042x1");
  });
});
