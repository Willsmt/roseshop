// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Aviso } from "@/components/ui/aviso";

afterEach(cleanup);

describe("Aviso (contrato §5, constitution V)", () => {
	it("sucesso ⇒ role=status", () => {
		render(<Aviso tipo="sucesso">Produto removido.</Aviso>);
		expect(screen.getByRole("status")).toHaveTextContent("Produto removido.");
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("erro ⇒ role=alert", () => {
		render(<Aviso tipo="erro">Este produto não existe mais.</Aviso>);
		expect(screen.getByRole("alert")).toHaveTextContent("Este produto não existe mais.");
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("texto ≥ 16 px e tipos com classes visuais diferentes", () => {
		render(
			<>
				<Aviso tipo="sucesso">A</Aviso>
				<Aviso tipo="erro">B</Aviso>
			</>,
		);
		const a = screen.getByRole("status");
		const b = screen.getByRole("alert");
		expect(a).toHaveClass("text-base");
		expect(b).toHaveClass("text-base");
		expect(a.className).not.toBe(b.className);
	});
});
