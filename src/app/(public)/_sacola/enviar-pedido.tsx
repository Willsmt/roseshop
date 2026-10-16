"use client";

import { useRef, useState } from "react";

import { conferir, houveMudanca, juntar, linhasDoPedido, type ItemConferencia } from "@/lib/sacola/conferencia";
import { montarPedido } from "@/lib/sacola/mensagem";
import type { Sacola } from "@/lib/sacola/sacola";
import { textos } from "@/lib/sacola/textos";
import { Button } from "@/components/ui/button";

import { abrirWhatsapp } from "./navegar";

const classes = "aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

// "Enviar pedido pelo WhatsApp" (research D11, ajuste A1, CT§3). Botão, nunca link: o wa.me só é
// montado depois de uma reconferência válida e sem mudança. Sem resposta válida, o envio é barrado
// com alerta, nada é gravado e o próprio botão é a nova tentativa (SC-003).
export function EnviarPedido({
	whatsapp,
	sacola,
	anteriores,
	observacao,
	bloqueadoPor,
	aoConferir,
}: {
	whatsapp: string | null;
	sacola: Sacola;
	/** A conferência que a tela mostra: sem ela, todo esgotado contaria como mudança. */
	anteriores: ItemConferencia[];
	observacao: string;
	/** Id do texto que explica por que o envio está desabilitado. */
	bloqueadoPor: string | null;
	/** Registra a reconferência (grava e mostra avisos); devolve false se não conseguiu gravar. */
	aoConferir: (itens: ItemConferencia[], antes: Sacola, mudou: boolean) => boolean;
}) {
	const [falhou, setFalhou] = useState(false);
	const ocupado = useRef(false);
	const botao = useRef<HTMLButtonElement>(null);

	// Número inválido (FR-017): o ramo não monta mensagem nem endereço.
	if (whatsapp === null) {
		return (
			<div className="flex flex-col gap-2">
				<Button
					type="button"
					variant="primary"
					className={classes}
					aria-disabled="true"
					aria-describedby="envio-indisponivel"
				>
					{textos.enviarPedido}
				</Button>
				<p id="envio-indisponivel">{textos.envioIndisponivel}</p>
			</div>
		);
	}
	const numero = whatsapp;

	async function enviar() {
		if (bloqueadoPor !== null || ocupado.current) return;
		ocupado.current = true;
		setFalhou(false);
		const antes = sacola;
		const itens = await conferir(antes.itens.map((i) => i.codigo));
		ocupado.current = false;
		if (itens === "falha") {
			setFalhou(true);
			botao.current?.focus();
			return;
		}
		const mudou = houveMudanca(antes, itens, anteriores);
		if (!aoConferir(itens, antes, mudou) || mudou) return;
		const pedido = montarPedido({ numero, linhas: linhasDoPedido(juntar(antes, itens)), observacao });
		if (pedido.tipo !== "ok") return;
		window.history.replaceState({ ...window.history.state, sacolaEnviada: true }, "");
		abrirWhatsapp(pedido.url);
	}

	return (
		<div className="flex flex-col gap-2">
			{falhou ? <p role="alert">{textos.falhaNoEnvio}</p> : null}
			<Button
				ref={botao}
				type="button"
				variant="primary"
				className={classes}
				aria-disabled={bloqueadoPor !== null ? "true" : undefined}
				aria-describedby={bloqueadoPor ?? undefined}
				onClick={enviar}
			>
				{textos.enviarPedido}
			</Button>
		</div>
	);
}
