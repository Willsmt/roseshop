// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { salvarRestauracao } from "@/lib/catalogo/restauracao";

// Feature 005, T076 (F3, US1.9): "Voltar ao catálogo" e "Ver o catálogo".

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { LinkCatalogo } from "./link-catalogo";

const estado = { itens: [], cursor: null, scrollY: 0 };

beforeEach(() => {
  sessionStorage.clear();
  router.back.mockClear();
});
afterEach(cleanup);

// jsdom não navega: o clique devolve se o padrão do link foi cancelado.
function clicar() {
  return !fireEvent.click(screen.getByRole("link"));
}

describe("LinkCatalogo (T076)", () => {
  it("voltar, aberto pela lista nesta aba: router.back() e mantém a restauração", () => {
    window.history.replaceState(null, "", "/p/0007");
    salvarRestauracao("meias", { ...estado, aberto: "/p/0007" });
    render(<LinkCatalogo voltar>Voltar ao catálogo</LinkCatalogo>);
    expect(clicar()).toBe(true); // padrão cancelado: quem navega é o router.back()
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("catalogo:meias")).not.toBeNull();
  });

  it("voltar, com restauração de outro item (aberto direto depois): link para / que limpa", () => {
    window.history.replaceState(null, "", "/p/0009");
    salvarRestauracao("meias", { ...estado, aberto: "/p/0007" });
    render(<LinkCatalogo voltar>Voltar ao catálogo</LinkCatalogo>);
    clicar();
    expect(router.back).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("catalogo:meias")).toBeNull();
  });

  it("voltar, aberto direto (sem restauração): link para / que limpa antes de navegar", () => {
    sessionStorage.setItem("catalogo:vencida", "{}");
    render(<LinkCatalogo voltar>Voltar ao catálogo</LinkCatalogo>);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/");
    clicar();
    expect(router.back).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("catalogo:vencida")).toBeNull();
  });

  it("'Ver o catálogo' (sem voltar) sempre limpa, mesmo com restauração válida (F3)", () => {
    salvarRestauracao(null, estado);
    salvarRestauracao("meias", estado);
    render(<LinkCatalogo>Ver o catálogo</LinkCatalogo>);
    clicar();
    expect(router.back).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("catalogo:todas")).toBeNull();
    expect(sessionStorage.getItem("catalogo:meias")).toBeNull();
  });
});
