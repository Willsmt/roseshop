import { useId } from "react";

import { classesControle } from "./campo-texto";
import { MensagemCampo } from "./mensagem-campo";

type AreaTextoProps = {
	name: string;
	rotulo: string;
	defaultValue: string;
	erro?: string;
	/** Texto de apoio abaixo do controle (ex.: marcador de sugestão). */
	dica?: React.ReactNode;
	maxLength?: number;
	linhas?: number;
};

export function AreaTexto({ name, rotulo, defaultValue, erro, dica, maxLength, linhas = 4 }: AreaTextoProps) {
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
			<textarea
				id={id}
				name={name}
				defaultValue={defaultValue}
				rows={linhas}
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
