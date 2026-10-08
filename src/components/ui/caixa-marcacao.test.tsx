// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CaixaMarcacao } from "@/components/ui/caixa-marcacao";

afterEach(cleanup);

describe("CaixaMarcacao (contrato §5, constitution V)", () => {
	it("checkbox com rótulo visível ligado e valor 'on'", () => {
		render(<CaixaMarcacao name="aPartirDe" rotulo="A partir de" defaultChecked={false} />);
		const cx = screen.getByLabelText("A partir de");
		expect(cx).toHaveAttribute("type", "checkbox");
		expect(cx).toHaveAttribute("name", "aPartirDe");
		expect(cx).not.toBeChecked();
	});

	it("preserva defaultChecked", () => {
		render(<CaixaMarcacao name="x" rotulo="X" defaultChecked />);
		expect(screen.getByLabelText("X")).toBeChecked();
	});

	it("a área de toque inclui o rótulo: o input fica dentro do <label> de 48 px", () => {
		render(<CaixaMarcacao name="x" rotulo="X" defaultChecked={false} />);
		const rotulo = screen.getByText("X").closest("label");
		expect(rotulo).not.toBeNull();
		expect(rotulo).toContainElement(screen.getByLabelText("X"));
		expect(rotulo).toHaveClass("min-h-12", "text-base");
	});

	it("com erro: aria-invalid e aria-describedby apontam para a mensagem", () => {
		render(<CaixaMarcacao name="x" rotulo="X" defaultChecked={false} erro="Escreva o preço." />);
		const cx = screen.getByLabelText("X");
		expect(cx).toHaveAttribute("aria-invalid", "true");
		expect(cx.getAttribute("aria-describedby")).toBe(screen.getByText("Escreva o preço.").id);
	});

	it("sem erro: sem atributos de erro", () => {
		render(<CaixaMarcacao name="x" rotulo="X" defaultChecked={false} />);
		expect(screen.getByLabelText("X")).not.toHaveAttribute("aria-invalid");
	});
});
