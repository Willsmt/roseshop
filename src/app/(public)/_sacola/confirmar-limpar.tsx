"use client";

import { useId, useRef } from "react";

import { textos } from "@/lib/sacola/textos";
import { Button } from "@/components/ui/button";

// "Limpar sacola" com confirmação (US2.4, research D12): <dialog> nativo por showModal(), que prende
// o foco e fecha com Esc. Cancelar devolve o foco ao botão; o foco depois de limpar é da tela.
export function ConfirmarLimpar({ aoConfirmar }: { aoConfirmar: () => void }) {
	const dialogo = useRef<HTMLDialogElement>(null);
	const botao = useRef<HTMLButtonElement>(null);
	const idTexto = useId();

	function cancelar() {
		dialogo.current?.close();
		botao.current?.focus();
	}

	function confirmar() {
		dialogo.current?.close();
		aoConfirmar();
	}

	return (
		<>
			<Button ref={botao} type="button" variant="secondary" onClick={() => dialogo.current?.showModal()}>
				{textos.limparSacola}
			</Button>
			<dialog ref={dialogo} aria-labelledby={idTexto} className="m-auto max-w-sm rounded-lg p-4 backdrop:bg-black/50">
				<p id={idTexto} className="mb-4">
					{textos.confirmarLimpar}
				</p>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Button type="button" variant="primary" onClick={confirmar}>
						{textos.limpar}
					</Button>
					<Button type="button" variant="secondary" onClick={cancelar}>
						{textos.cancelar}
					</Button>
				</div>
			</dialog>
		</>
	);
}
