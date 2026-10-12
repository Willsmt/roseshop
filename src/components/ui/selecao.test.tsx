// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Selecao } from "@/components/ui/selecao";

afterEach(cleanup);

const opcoes = [
	{ valor: "1", rotulo: "Bolsas" },
	{ valor: "2", rotulo: "Meias" },
];

describe("Selecao (contrato §5, constitution V)", () => {
	it("é um <select> nativo com rótulo ligado e as opções", () => {
		render(<Selecao name="categoriaId" rotulo="Categoria" opcoes={opcoes} defaultValue="" />);
		const sel = screen.getByLabelText("Categoria");
		expect(sel.tagName).toBe("SELECT");
		expect(sel).toHaveAttribute("name", "categoriaId");
		expect(screen.getByRole("option", { name: "Bolsas" })).toHaveValue("1");
		expect(screen.getByRole("option", { name: "Meias" })).toHaveValue("2");
	});

	it("vazio? vira a opção inicial, sem valor", () => {
		render(<Selecao name="c" rotulo="Categoria" opcoes={opcoes} defaultValue="" vazio="Escolha uma categoria" />);
		const opts = screen.getAllByRole("option");
		expect(opts[0]).toHaveTextContent("Escolha uma categoria");
		expect(opts[0]).toHaveValue("");
		expect(screen.getByLabelText("Categoria")).toHaveValue("");
	});

	it("sem vazio?, não cria opção extra", () => {
		render(<Selecao name="c" rotulo="Categoria" opcoes={opcoes} defaultValue="2" />);
		expect(screen.getAllByRole("option")).toHaveLength(2);
	});

	it("preserva defaultValue", () => {
		render(<Selecao name="c" rotulo="Categoria" opcoes={opcoes} defaultValue="2" />);
		expect(screen.getByLabelText("Categoria")).toHaveValue("2");
	});

	it("com erro: aria-invalid e aria-describedby apontam para a mensagem", () => {
		render(<Selecao name="c" rotulo="Categoria" opcoes={opcoes} defaultValue="" erro="Escolha uma categoria." />);
		const sel = screen.getByLabelText("Categoria");
		expect(sel).toHaveAttribute("aria-invalid", "true");
		expect(sel.getAttribute("aria-describedby")).toBe(screen.getByText("Escolha uma categoria.").id);
	});

	it("alvo ≥ 48 px e texto ≥ 16 px", () => {
		render(<Selecao name="c" rotulo="Categoria" opcoes={opcoes} defaultValue="" />);
		expect(screen.getByLabelText("Categoria")).toHaveClass("min-h-12", "text-base", "w-full");
	});

	it("dica: renderizada abaixo do controle e ligada por aria-describedby", () => {
		render(<Selecao name="c" rotulo="Categoria" opcoes={opcoes} defaultValue="" dica="Sugestão — confira" />);
		const dica = screen.getByText("Sugestão — confira");
		expect(dica.id).not.toBe("");
		expect(screen.getByLabelText("Categoria").getAttribute("aria-describedby")).toBe(dica.id);
		expect(dica).toHaveClass("text-base");
	});

	it("erro + dica: os dois ids no aria-describedby", () => {
		render(<Selecao name="c" rotulo="Categoria" opcoes={opcoes} defaultValue="" erro="Escolha." dica="Confira" />);
		const ids = (screen.getByLabelText("Categoria").getAttribute("aria-describedby") ?? "").split(/\s+/);
		expect(ids).toContain(screen.getByText("Escolha.").id);
		expect(ids).toContain(screen.getByText("Confira").id);
		expect(ids).toHaveLength(2);
	});
});
