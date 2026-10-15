// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { violacoesGraves } from "@/test/axe";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh }),
}));

import Erro from "./error";

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

// Feature 005, T060 (contracts/telas.md, erro 503).
describe("error.tsx público (T060)", () => {
  const desenhar = (reset = vi.fn()) =>
    render(<Erro error={new Error("segredo interno")} reset={reset} />);

  it("h1, texto e botão do contrato", () => {
    const { container } = desenhar();
    expect(container.querySelector("h1")?.textContent).toBe("Não foi possível carregar agora");
    expect(container.textContent).toContain("Tente de novo em instantes.");
    expect(container.querySelector("button")?.textContent).toBe("Tentar de novo");
  });

  it("não vaza a mensagem do erro", () => {
    const { container } = desenhar();
    expect(container.textContent).not.toContain("segredo interno");
  });

  it("o botão chama reset() e router.refresh()", () => {
    const reset = vi.fn();
    const { container } = desenhar(reset);
    fireEvent.click(container.querySelector("button")!);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("axe: sem violações graves", async () => {
    const { container } = desenhar();
    expect(await violacoesGraves(container)).toEqual([]);
  });
});
