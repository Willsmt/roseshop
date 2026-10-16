// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { salvarRestauracao } from "@/lib/catalogo/restauracao";
import { violacoesGraves } from "@/test/axe";

import { Topo } from "./topo";

// Redesenho (Fase 5, direção Janela): topo das páginas internas com o símbolo da marca.

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("Topo", () => {
  it("o símbolo é um link para a loja com nome acessível", () => {
    render(<Topo />);
    const link = screen.getByRole("link", { name: "Roseshop, página inicial" });
    expect(link.getAttribute("href")).toBe("/");
  });

  it("não tem texto no HTML do servidor (a /sacola sem JavaScript fica sem texto)", () => {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(<Topo />), "text/html");
    expect(doc.body.textContent).toBe("");
    expect(doc.querySelector("title, text")).toBeNull();
  });

  it("ir à loja pelo símbolo começa a lista do 1º bloco (limpa a restauração, F3)", () => {
    salvarRestauracao(null, { itens: [], cursor: null, scrollY: 0 });
    render(<Topo />);
    fireEvent.click(screen.getByRole("link", { name: "Roseshop, página inicial" }));
    expect(sessionStorage.getItem("catalogo:todas")).toBeNull();
  });

  it("axe: sem violações graves", async () => {
    const { container } = render(<Topo />);
    expect(await violacoesGraves(container)).toEqual([]);
  });
});
