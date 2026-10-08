// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AreaTexto } from "@/components/ui/area-texto";

afterEach(cleanup);

describe("AreaTexto (contrato §5, constitution V)", () => {
	it("rótulo visível ligado ao textarea, com defaultValue, linhas e maxLength", () => {
		render(<AreaTexto name="descricao" rotulo="Descrição" defaultValue="Linda" linhas={6} maxLength={1000} />);
		const area = screen.getByLabelText("Descrição");
		expect(area.tagName).toBe("TEXTAREA");
		expect(area).toHaveValue("Linda");
		expect(area).toHaveAttribute("rows", "6");
		expect(area).toHaveAttribute("maxlength", "1000");
		expect(area).toHaveAttribute("name", "descricao");
	});

	it("com erro: aria-invalid e aria-describedby apontam para a mensagem", () => {
		render(<AreaTexto name="descricao" rotulo="Descrição" defaultValue="" erro="Muito longa." />);
		const area = screen.getByLabelText("Descrição");
		expect(area).toHaveAttribute("aria-invalid", "true");
		expect(area.getAttribute("aria-describedby")).toBe(screen.getByText("Muito longa.").id);
	});

	it("sem erro: sem atributos de erro", () => {
		render(<AreaTexto name="descricao" rotulo="Descrição" defaultValue="" />);
		const area = screen.getByLabelText("Descrição");
		expect(area).not.toHaveAttribute("aria-invalid");
		expect(area).not.toHaveAttribute("aria-describedby");
	});

	it("texto ≥ 16 px e altura mínima de 48 px", () => {
		render(<AreaTexto name="d" rotulo="D" defaultValue="" />);
		expect(screen.getByLabelText("D")).toHaveClass("min-h-12", "text-base", "w-full");
	});
});
