// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHAVE } from "@/lib/sacola/armazenamento";
import { violacoesGraves } from "@/test/axe";
import { desmontarTudo, hidratar, outraAbaGravou } from "@/test/hidratar";

import { BotaoSacola } from "./botao-sacola";

// Feature 006, SF5, T046 (CT§2, US1.2, US1.3, US1.5, US1.6, FR-002, FR-002a, FR-003): botão do
// detalhe, só depois de hidratar.

const SACOLA = { codigo: "0042", precoCentavos: 600, aPartirDe: false };
const LIMITE = "A sacola chegou ao limite de 15 produtos. Remova algum para adicionar outro.";

const gravada = (itens: { c: string; q?: number }[]) =>
  JSON.stringify({ v: 1, t: Date.now(), i: itens.map(({ c, q = 1 }) => ({ c, q, p: 600, a: false })) });

const quinze = () => Array.from({ length: 15 }, (_, k) => ({ c: String(1000 + k) }));

function lida() {
  const bruto = window.localStorage.getItem(CHAVE);
  return bruto === null ? null : (JSON.parse(bruto) as { i: { c: string; q: number; p: number | null; a: boolean }[] });
}

const botao = (c: HTMLElement) => c.querySelector("button");
const naSacola = (c: HTMLElement) => c.querySelector<HTMLAnchorElement>('a[href="/sacola"]');

async function tocar(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

// O jsdom não navega: o clique num link só é observado, sem sair da página.
const semNavegar = (e: Event) => e.preventDefault();

beforeEach(() => {
  window.localStorage.clear();
  document.addEventListener("click", semNavegar);
});

afterEach(async () => {
  await desmontarTudo();
  document.removeEventListener("click", semNavegar);
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("BotaoSacola", () => {
  it("antes de hidratar ⇒ nada no HTML do servidor (FR-002a)", () => {
    expect(renderToString(<BotaoSacola sacola={SACOLA} />)).toBe("");
  });

  it("fora da sacola ⇒ <button>Adicionar à sacola</button>", async () => {
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    expect(botao(container)?.textContent).toBe("Adicionar à sacola");
    expect(botao(container)?.getAttribute("type")).toBe("button");
    expect(botao(container)?.hasAttribute("aria-disabled")).toBe(false);
  });

  it("tocar grava o item com o preço visto e vira o link Na sacola, sem recarregar (US1.2)", async () => {
    const { container } = await hidratar(<BotaoSacola sacola={{ ...SACOLA, aPartirDe: true }} />);
    const endereco = window.location.href;
    await tocar(botao(container)!);
    expect(lida()?.i).toEqual([{ c: "0042", q: 1, p: 600, a: true }]);
    expect(botao(container)).toBeNull();
    expect(naSacola(container)?.textContent).toBe("Na sacola");
    expect(window.location.href).toBe(endereco);
  });

  it("depois de adicionar, o foco vai para o link Na sacola", async () => {
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    botao(container)!.focus();
    await tocar(botao(container)!);
    expect(document.activeElement).toBe(naSacola(container));
  });

  it("produto sem preço entra com p null", async () => {
    const { container } = await hidratar(<BotaoSacola sacola={{ ...SACOLA, precoCentavos: null }} />);
    await tocar(botao(container)!);
    expect(lida()?.i).toEqual([{ c: "0042", q: 1, p: null, a: false }]);
  });

  it("já na sacola ao abrir ⇒ Na sacola, e tocar não muda a quantidade (US1.3)", async () => {
    window.localStorage.setItem(CHAVE, gravada([{ c: "0042", q: 3 }]));
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    expect(botao(container)).toBeNull();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await tocar(naSacola(container)!);
    expect(setItem).not.toHaveBeenCalled();
    expect(lida()?.i).toEqual([{ c: "0042", q: 3, p: 600, a: false }]);
  });

  it("15 na sacola ⇒ aria-disabled e aria-describedby para o limite; o clique não grava (US1.5)", async () => {
    window.localStorage.setItem(CHAVE, gravada(quinze()));
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    const b = botao(container)!;
    expect(b.textContent).toBe("Adicionar à sacola");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    const descrito = document.getElementById(b.getAttribute("aria-describedby") ?? "");
    expect(descrito?.textContent).toBe(LIMITE);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await tocar(b);
    expect(setItem).not.toHaveBeenCalled();
    expect(lida()?.i).toHaveLength(15);
  });

  it("15 na sacola com este produto ⇒ Na sacola, sem o aviso do limite", async () => {
    window.localStorage.setItem(CHAVE, gravada([...quinze().slice(1), { c: "0042" }]));
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    expect(naSacola(container)?.textContent).toBe("Na sacola");
    expect(container.textContent).not.toContain(LIMITE);
  });

  it("outra aba adiciona este produto ⇒ vira Na sacola (US1.6)", async () => {
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    await outraAbaGravou(CHAVE, gravada([{ c: "0042" }]));
    expect(naSacola(container)?.textContent).toBe("Na sacola");
  });

  it("outra aba enche a sacola ⇒ o botão passa a mostrar o limite", async () => {
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    await outraAbaGravou(CHAVE, gravada(quinze()));
    expect(botao(container)?.getAttribute("aria-disabled")).toBe("true");
  });

  it("setItem que lança ⇒ Não foi possível adicionar agora., e o botão continua", async () => {
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    await tocar(botao(container)!);
    expect(container.textContent).toContain("Não foi possível adicionar agora.");
    expect(botao(container)?.textContent).toBe("Adicionar à sacola");
    expect(window.localStorage.getItem(CHAVE)).toBeNull();
  });

  it("armazenamento indisponível ⇒ nada", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    expect(container.innerHTML).toBe("");
  });

  it.each([
    ["fora da sacola", null],
    ["na sacola", gravada([{ c: "0042" }])],
    ["no limite", gravada(quinze())],
  ])("axe: %s, sem violações graves", async (_nome, bruto) => {
    if (bruto !== null) window.localStorage.setItem(CHAVE, bruto);
    const { container } = await hidratar(<BotaoSacola sacola={SACOLA} />);
    expect(await violacoesGraves(container)).toEqual([]);
  });
});
