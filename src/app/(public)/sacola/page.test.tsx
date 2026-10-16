// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Feature 006, SF6, T056 (D10, US4.6, FR-009, FR-017): a página /sacola só tem a casca no servidor;
// a sacola aparece depois de hidratar. Sem JavaScript, o aviso e o caminho de volta.

const configCatalogo = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalogo", () => ({ configCatalogo }));

const TelaSacola = vi.hoisted(() => vi.fn<(props: { whatsapp: string | null }) => null>(() => null));
vi.mock("../_sacola/tela-sacola", () => ({ TelaSacola }));

import Pagina, { dynamic } from "./page";

describe("/sacola", () => {
  it('exporta dynamic = "force-dynamic"', () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("<noscript> com 'Ative o JavaScript para usar a sacola.' e link ao catálogo (US4.6)", () => {
    configCatalogo.mockReturnValue({ whatsapp: "+5511999999999", siteUrl: null });
    const html = renderToStaticMarkup(<Pagina />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const noscript = doc.querySelector("main noscript");
    expect(noscript).not.toBeNull();
    // Fora do navegador com JS, o conteúdo do <noscript> é marcação.
    const dentro = new DOMParser().parseFromString(noscript!.innerHTML, "text/html");
    expect(dentro.querySelector("p")?.textContent).toBe("Ative o JavaScript para usar a sacola.");
    const link = dentro.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/");
    expect(link?.textContent).toBe("Ver o catálogo");
  });

  it.each([["+5511999999999"], [null]])("passa configCatalogo().whatsapp (%s) à TelaSacola", (whatsapp) => {
    configCatalogo.mockReturnValue({ whatsapp, siteUrl: null });
    TelaSacola.mockClear();
    renderToStaticMarkup(<Pagina />);
    expect(TelaSacola).toHaveBeenCalledTimes(1);
    expect(TelaSacola.mock.calls[0][0]).toEqual({ whatsapp });
  });
});
