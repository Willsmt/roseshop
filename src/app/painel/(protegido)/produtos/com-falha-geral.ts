import type { ValoresFormulario } from "@/lib/produtos/erros";
import { mensagemDoMotivo } from "@/lib/produtos/mensagens";

// Mesmo padrão das telas de categorias: se a action rejeitar (sessão expirada ou erro
// inesperado), a tela fica onde está com a mensagem geral e nada é salvo. Nos formulários,
// `valores` devolve o digitado para reidratar os campos.

type Falha = { ok: false; motivo: "falha_geral"; mensagem: string; valores?: ValoresFormulario };

const texto = (fd: FormData, nome: string) => {
	const v = fd.get(nome);
	return typeof v === "string" ? v : "";
};

export function valoresDoFormData(fd: FormData): ValoresFormulario {
	return {
		nome: texto(fd, "nome"),
		categoriaId: texto(fd, "categoriaId"),
		descricao: texto(fd, "descricao"),
		preco: texto(fd, "preco"),
		aPartirDe: fd.get("aPartirDe") === "on",
	};
}

export function comFalhaGeral<R>(
	action: (anterior: R | null, formData: FormData) => Promise<R>,
	comValores = false,
): (anterior: R | Falha | null, formData: FormData) => Promise<R | Falha> {
	return async (anterior, formData) => {
		try {
			return await action(anterior as R | null, formData);
		} catch {
			return {
				ok: false,
				motivo: "falha_geral",
				mensagem: mensagemDoMotivo("falha_geral"),
				...(comValores ? { valores: valoresDoFormData(formData) } : {}),
			};
		}
	};
}
