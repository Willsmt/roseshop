// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MensagemCampo } from "@/components/ui/mensagem-campo";

afterEach(cleanup);

describe("MensagemCampo (contrato §5)", () => {
	it("renderiza o texto com o id recebido, em texto de 16 px", () => {
		render(<MensagemCampo id="nome-erro">Escreva o nome.</MensagemCampo>);
		const el = screen.getByText("Escreva o nome.");
		expect(el).toHaveAttribute("id", "nome-erro");
		expect(el).toHaveClass("text-base");
	});

	it("aceita conteúdo composto (ex.: link para o código existente)", () => {
		render(
			<MensagemCampo id="m">
				{/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a regra passou a disparar porque a rota /painel/produtos agora existe; aqui o <a> é só um filho composto de teste */}
				Já existe: <a href="/painel/produtos/42">#0042</a>.
			</MensagemCampo>,
		);
		expect(screen.getByRole("link", { name: "#0042" })).toHaveAttribute("href", "/painel/produtos/42");
	});
});
