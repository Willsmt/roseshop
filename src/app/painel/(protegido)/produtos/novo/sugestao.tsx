"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { sugerirProduto } from "@/lib/produtos/sugestao";

import { ESPERANDO_SUGESTAO, type Sugestao } from "./textos-sugestao";

export type EstadoSugestao =
	| { tipo: "ocioso" }
	| { tipo: "esperando" }
	| { tipo: "pronta"; sugestao: Sugestao }
	| { tipo: "falhou"; motivo: "ia_indisponivel" | "ia_pausada"; mensagem: string };

export { ESPERANDO_SUGESTAO, MARCADOR_SUGESTAO, type Sugestao } from "./textos-sugestao";

const MENSAGEM_INDISPONIVEL = "Não deu para sugerir agora. Preencha você mesma.";

// Pede a sugestão da IA. A primeira vez é automática (uma por cadastro); depois só o botão
// "Tentar sugestão de novo", e só quando a IA falhou por indisponibilidade.
export function useSugestao() {
	const [estado, setEstadoTela] = useState<EstadoSugestao>({ tipo: "ocioso" });
	// Espelho síncrono do estado: dois toques no mesmo instante não disparam dois pedidos.
	const atual = useRef<EstadoSugestao>(estado);
	// Numera os pedidos: resposta de um pedido antigo é ignorada.
	const pedido = useRef(0);

	const mudar = useCallback((novo: EstadoSugestao) => {
		atual.current = novo;
		setEstadoTela(novo);
	}, []);

	const pedir = useCallback(
		(envioIds: readonly string[]) => {
			const meu = ++pedido.current;
			mudar({ tipo: "esperando" });
			const resposta = (async (): Promise<EstadoSugestao> => {
				try {
					const r = await sugerirProduto({ envioIds: [...envioIds] });
					if (r?.ok === true) return { tipo: "pronta", sugestao: { ...r.sugestao } };
					if (r?.ok === false) return { tipo: "falhou", motivo: r.motivo, mensagem: r.mensagem };
				} catch {
					// rede ou sessão caída: cai na mensagem padrão abaixo
				}
				return { tipo: "falhou", motivo: "ia_indisponivel", mensagem: MENSAGEM_INDISPONIVEL };
			})();
			void resposta.then((novo) => {
				if (meu === pedido.current) mudar(novo);
			});
		},
		[mudar],
	);

	const pedirPrimeira = useCallback(
		(envioIds: readonly string[]) => {
			if (atual.current.tipo === "ocioso") pedir(envioIds);
		},
		[pedir],
	);

	const tentarDeNovo = useCallback(
		(envioIds: readonly string[]) => {
			const e = atual.current;
			if (e.tipo === "falhou" && e.motivo === "ia_indisponivel") pedir(envioIds);
		},
		[pedir],
	);

	return { estado, pedirPrimeira, tentarDeNovo };
}

// Região viva sempre presente: o leitor de tela anuncia a troca de texto. Não é erro da pessoa,
// então não usa o Aviso de erro.
export function AvisoSugestao({ estado, onTentarDeNovo }: { estado: EstadoSugestao; onTentarDeNovo: () => void }) {
	return (
		<div role="status" className="flex flex-col gap-3 text-base">
			{estado.tipo === "esperando" ? <p>{ESPERANDO_SUGESTAO}</p> : null}
			{estado.tipo === "falhou" ? (
				<>
					<p>{estado.mensagem}</p>
					{estado.motivo === "ia_indisponivel" ? (
						<Button type="button" variant="secondary" onClick={onTentarDeNovo}>
							Tentar sugestão de novo
						</Button>
					) : null}
				</>
			) : null}
		</div>
	);
}
