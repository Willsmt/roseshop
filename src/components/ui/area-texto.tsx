import { useId } from "react";

import { classesControle } from "./campo-texto";
import { MensagemCampo } from "./mensagem-campo";

type AreaTextoProps = {
	name: string;
	rotulo: string;
	defaultValue: string;
	erro?: string;
	maxLength?: number;
	linhas?: number;
};

export function AreaTexto({ name, rotulo, defaultValue, erro, maxLength, linhas = 4 }: AreaTextoProps) {
	const id = useId();
	const idErro = `${id}-erro`;
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
				aria-describedby={erro ? idErro : undefined}
				className={classesControle}
			/>
			{erro ? <MensagemCampo id={idErro}>{erro}</MensagemCampo> : null}
		</div>
	);
}
