// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHAVE } from "@/lib/sacola/armazenamento";
import { violacoesGraves } from "@/test/axe";
import { desmontarTudo, hidratar, outraAbaGravou } from "@/test/hidratar";

import { AcessoSacola } from "./acesso-sacola";

// Feature 006, SF5, T045 (CT§1, US1.6, US1.7, FR-002a, FR-004): acesso à sacola no cabeçalho, só
// depois de hidratar.

const gravada = (n: number) =>
  JSON.stringify({
    v: 1,
    t: Date.now(),
    i: Array.from({ length: n }, (_, k) => ({ c: String(1000 + k), q: 2, p: 600, a: false })),
  });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  await desmontarTudo();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function link(container: HTMLElement) {
  return container.querySelector<HTMLAnchorElement>('a[href="/sacola"]');
}

describe("AcessoSacola", () => {
  it("HTML do servidor vazio (FR-002a)", () => {
    window.localStorage.setItem(CHAVE, gravada(2));
    expect(renderToString(<AcessoSacola />)).toBe("");
  });

  it.each([
    [2, "Sacola, 2 produtos", "2 produtos"],
    [1, "Sacola, 1 produto", "1 produto"],
    [15, "Sacola, 15 produtos", "15 produtos"],
  ])("hidratado com %i: link para /sacola com o nome %j", async (n, nome, numero) => {
    window.localStorage.setItem(CHAVE, gravada(n));
    const { container } = await hidratar(<AcessoSacola />);
    const a = link(container);
    expect(a?.textContent).toBe(nome);
    expect(a?.querySelector('[aria-live="polite"]')?.textContent).toBe(numero);
  });

  it("conta produtos diferentes, não unidades (US1.7)", async () => {
    window.localStorage.setItem(CHAVE, gravada(2));
    const { container } = await hidratar(<AcessoSacola />);
    expect(link(container)?.textContent).toBe("Sacola, 2 produtos");
  });

  it("sacola vazia ⇒ Sacola, 0 produtos", async () => {
    const { container } = await hidratar(<AcessoSacola />);
    expect(link(container)?.textContent).toBe("Sacola, 0 produtos");
  });

  it("armazenamento que lança ⇒ nada", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    const { container } = await hidratar(<AcessoSacola />);
    expect(container.innerHTML).toBe("");
  });

  it("muda quando outra aba adiciona (US1.6)", async () => {
    window.localStorage.setItem(CHAVE, gravada(1));
    const { container } = await hidratar(<AcessoSacola />);
    await outraAbaGravou(CHAVE, gravada(3));
    expect(link(container)?.textContent).toBe("Sacola, 3 produtos");
  });

  it("axe: sem violações graves", async () => {
    window.localStorage.setItem(CHAVE, gravada(2));
    const { container } = await hidratar(<AcessoSacola />);
    expect(await violacoesGraves(container)).toEqual([]);
  });
});
