// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { violacoesGraves } from "@/test/axe";

import NotFound from "./not-found";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

// Feature 005, T060 (contracts/telas.md, não encontrado).
describe("not-found do detalhe (T060)", () => {
  it("h1 Produto não encontrado e link Ver o catálogo para /", () => {
    const { container } = render(<NotFound />);
    expect(container.querySelector("h1")?.textContent).toBe("Produto não encontrado");
    const a = [...container.querySelectorAll("a")].find((x) => x.textContent === "Ver o catálogo");
    expect(a?.getAttribute("href")).toBe("/");
  });

  it("sem imagens", () => {
    const { container } = render(<NotFound />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("axe: sem violações graves", async () => {
    const { container } = render(<NotFound />);
    expect(await violacoesGraves(container)).toEqual([]);
  });
});
