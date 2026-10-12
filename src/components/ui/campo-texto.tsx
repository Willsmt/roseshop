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

export const classesControle =
	"min-h-12 w-full rounded-lg border-2 border-neutral-900 bg-white px-4 py-3 text-base " +
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 " +
	"aria-[invalid=true]:border-red-700";

export function CampoTexto({ name, rotulo, defaultValue, erro, dica, inputMode, maxLength }: CampoTextoProps) {
	const id = useId();
	const idErro = `${id}-erro`;
	const idDica = `${id}-dica`;
	// Erro e dica podem coexistir: os dois ids vão no aria-describedby.
	const descrito = [erro ? idErro : null, dica ? idDica : null].filter(Boolean).join(" ") || undefined;
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={id} className="text-base font-semibold">
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
				<p id={idDica} className="text-base text-neutral-700">
					{dica}
				</p>
			) : null}
		</div>
	);
}
