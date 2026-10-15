// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CategoriaFiltro } from "@/lib/catalogo";
import { violacoesGraves } from "@/test/axe";

import { Filtro } from "./filtro";

// Feature 005, T067 (US4.3, US4.4, FR-009, FR-023): filtro por categoria, apresentacional.

afterEach(cleanup);

const categorias: CategoriaFiltro[] = [
  { slug: "meias", nome: "Meias" },
  { slug: "luvas", nome: "Luvas" },
];

const atual = (c: HTMLElement) =>
  [...c.querySelectorAll("a[aria-current]")].map((a) => ({
    texto: a.textContent,
    valor: a.getAttribute("aria-current"),
  }));

describe("Filtro (T067)", () => {
  it("sem categorias: não renderiza nada", () => {
    const { container } = render(<Filtro categorias={[]} escolhida={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("nav com aria-label, 'Todas' em / e as categorias em /?categoria=<slug>", () => {
    const { container } = render(<Filtro categorias={categorias} escolhida={null} />);
    const nav = container.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Filtrar por categoria");
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Todas", "/"],
      ["Meias", "/?categoria=meias"],
      ["Luvas", "/?categoria=luvas"],
    ]);
    expect(container.querySelectorAll("ul > li")).toHaveLength(3);
  });

  it("escolhida null: só 'Todas' tem aria-current=page", () => {
    const { container } = render(<Filtro categorias={categorias} escolhida={null} />);
    expect(atual(container)).toEqual([{ texto: "Todas", valor: "page" }]);
  });

  it("escolhida = slug: só essa categoria tem aria-current=page", () => {
    const { container } = render(<Filtro categorias={categorias} escolhida="meias" />);
    expect(atual(container)).toEqual([{ texto: "Meias", valor: "page" }]);
  });

  it("axe: sem violações graves", async () => {
    const { container } = render(<Filtro categorias={categorias} escolhida="luvas" />);
    expect(await violacoesGraves(container)).toEqual([]);
  });
});
