import { useId } from "react";

import { MensagemCampo } from "./mensagem-campo";

type CampoTextoProps = {
	name: string;
	rotulo: string;
	defaultValue: string;
	erro?: React.ReactNode;
	/** Texto de apoio abaixo do controle (ex.: marcador de sugestão). */
	dica?: React.ReactNode;
	inputMode?: React.ComponentProps<"input">["inputMode"];
	maxLength?: number;
};

// Borda em texto-suave (7,7:1 sobre o branco do campo, acima dos 3:1 de WCAG 1.4.11). O foco
// usa o anel global; campo com erro ganha borda e fundo de erro.
export const classesControle =
	"min-h-12 w-full rounded-suave border-2 border-texto-suave bg-white px-4 py-3 text-base text-texto " +
	"aria-[invalid=true]:border-erro aria-[invalid=true]:bg-erro-fundo";

export const classesRotulo = "text-base font-bold";

export const classesDica = "text-base text-texto-suave";

export function CampoTexto({ name, rotulo, defaultValue, erro, dica, inputMode, maxLength }: CampoTextoProps) {
	const id = useId();
	const idErro = `${id}-erro`;
	const idDica = `${id}-dica`;
	// Erro e dica podem coexistir: os dois ids vão no aria-describedby.
	const descrito = [erro ? idErro : null, dica ? idDica : null].filter(Boolean).join(" ") || undefined;
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={id} className={classesRotulo}>
				{rotulo}
			</label>
			<input
				id={id}
				name={name}
				type="text"
				defaultValue={defaultValue}
				inputMode={inputMode}
				maxLength={maxLength}
				aria-invalid={erro ? "true" : undefined}
				aria-describedby={descrito}
				className={classesControle}
			/>
			{erro ? <MensagemCampo id={idErro}>{erro}</MensagemCampo> : null}
			{dica ? (
				<p id={idDica} className={classesDica}>
					{dica}
				</p>
			) : null}
		</div>
	);
}
