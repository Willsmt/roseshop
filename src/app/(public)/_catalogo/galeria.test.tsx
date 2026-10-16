// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { violacoesGraves } from "@/test/axe";

import { Galeria } from "./galeria";

// Redesenho (Fase 5, ADR-005): fotos do detalhe em rolagem lateral, com pontos que mostram a foto
// visível e levam a cada uma. Os pontos só existem depois de hidratar.

afterEach(cleanup);

const fotos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    url: `/fotos/11111111-1111-4111-8111-11111111111${i}.webp`,
    alt: `Meia Rosa — foto ${i + 1} de ${n}`,
  }));

describe("Galeria", () => {
  it("lista 'Fotos' com as fotos em ordem; só a primeira carrega logo", () => {
    render(<Galeria fotos={fotos(3)} />);
    const lista = screen.getByRole("list", { name: "Fotos" });
    const imgs = within(lista).getAllByRole("img");
    expect(imgs.map((i) => i.getAttribute("alt"))).toEqual(fotos(3).map((f) => f.alt));
    expect(imgs.map((i) => i.getAttribute("loading"))).toEqual(["eager", "lazy", "lazy"]);
  });

  it("várias fotos: a lista é focável (rola pelo teclado) e há um botão por foto", () => {
    render(<Galeria fotos={fotos(3)} />);
    expect(screen.getByRole("list", { name: "Fotos" }).getAttribute("tabindex")).toBe("0");
    const botoes = screen.getAllByRole("button", { name: /^Ver foto \d de 3$/ });
    expect(botoes).toHaveLength(3);
    expect(botoes[0].getAttribute("aria-current")).toBe("true");
    expect(botoes.slice(1).map((b) => b.getAttribute("aria-current"))).toEqual([null, null]);
  });

  it("tocar num ponto rola até a foto dele", () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    render(<Galeria fotos={fotos(3)} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver foto 2 de 3" }));
    expect(rolar).toHaveBeenCalledTimes(1);
    expect(rolar.mock.contexts[0]).toBe(screen.getByRole("list", { name: "Fotos" }).children[1]);
  });

  it("uma foto só: sem pontos e sem foco extra", () => {
    render(<Galeria fotos={fotos(1)} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("list", { name: "Fotos" }).hasAttribute("tabindex")).toBe(false);
  });

  it("no HTML do servidor não há pontos (sem JavaScript, nada de botão morto)", () => {
    const html = renderToStaticMarkup(<Galeria fotos={fotos(3)} />);
    expect(html).not.toContain("<button");
    expect(html).toContain('aria-label="Fotos"');
  });

  it("axe: sem violações graves", async () => {
    const { container } = render(<Galeria fotos={fotos(3)} />);
    expect(await violacoesGraves(container)).toEqual([]);
  });
});
