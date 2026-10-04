// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

afterEach(cleanup);

describe("Button (FR-012)", () => {
  it("renderiza um <button> com o conteúdo e repassa type", () => {
    render(
      <Button type="submit" variant="primary">
        Entrar com Google
      </Button>,
    );
    const el = screen.getByRole("button", { name: "Entrar com Google" });
    expect(el.tagName).toBe("BUTTON");
    expect(el).toHaveAttribute("type", "submit");
  });

  it.each(["primary", "secondary"] as const)(
    "variante %s tem 48px de altura mínima, fonte de 16px e largura total no celular",
    (variant) => {
      render(<Button variant={variant}>Ok</Button>);
      const el = screen.getByRole("button");
      expect(el).toHaveAttribute("data-variant", variant);
      expect(el).toHaveClass("min-h-12", "text-base", "w-full");
    },
  );

  it("as variantes têm classes visuais diferentes", () => {
    render(
      <>
        <Button variant="primary">A</Button>
        <Button variant="secondary">B</Button>
      </>,
    );
    const [a, b] = screen.getAllByRole("button");
    expect(a.className).not.toBe(b.className);
  });
});
