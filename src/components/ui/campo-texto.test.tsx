// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CampoTexto } from "@/components/ui/campo-texto";

afterEach(cleanup);

describe("CampoTexto (contrato §5, constitution V)", () => {
	it("rótulo visível ligado ao input", () => {
		render(<CampoTexto name="nome" rotulo="Nome do produto" defaultValue="" />);
		const input = screen.getByLabelText("Nome do produto");
		expect(input.tagName).toBe("INPUT");
		expect(input).toHaveAttribute("name", "nome");
		expect(screen.getByText("Nome do produto")).toBeVisible();
	});

	it("preserva defaultValue, inputMode e maxLength", () => {
		render(
			<CampoTexto name="preco" rotulo="Preço" defaultValue="12,90" inputMode="numeric" maxLength={10} />,
		);
		const input = screen.getByLabelText("Preço");
		expect(input).toHaveValue("12,90");
		expect(input).toHaveAttribute("inputmode", "numeric");
		expect(input).toHaveAttribute("maxlength", "10");
	});

	it("sem erro: sem aria-invalid nem aria-describedby", () => {
		render(<CampoTexto name="nome" rotulo="Nome" defaultValue="" />);
		const input = screen.getByLabelText("Nome");
		expect(input).not.toHaveAttribute("aria-invalid");
		expect(input).not.toHaveAttribute("aria-describedby");
	});

	it("com erro: aria-invalid e aria-describedby apontam para a mensagem", () => {
		render(<CampoTexto name="nome" rotulo="Nome" defaultValue="" erro="Escreva o nome do produto." />);
		const input = screen.getByLabelText("Nome");
		expect(input).toHaveAttribute("aria-invalid", "true");
		const msg = screen.getByText("Escreva o nome do produto.");
		expect(input.getAttribute("aria-describedby")).toBe(msg.id);
		expect(msg.id).not.toBe("");
	});

	it("alvo ≥ 48 px e texto ≥ 16 px", () => {
		render(<CampoTexto name="nome" rotulo="Nome" defaultValue="" />);
		expect(screen.getByLabelText("Nome")).toHaveClass("min-h-12", "text-base", "w-full");
	});

	it("dois campos na mesma tela não repetem ids", () => {
		render(
			<>
				<CampoTexto name="a" rotulo="A" defaultValue="" erro="x" />
				<CampoTexto name="b" rotulo="B" defaultValue="" erro="y" />
			</>,
		);
		expect(screen.getByLabelText("A").id).not.toBe(screen.getByLabelText("B").id);
	});
});
