import { useId } from "react";

import { MensagemCampo } from "./mensagem-campo";

type CampoTextoProps = {
	name: string;
	rotulo: string;
	defaultValue: string;
	erro?: string;
	inputMode?: React.ComponentProps<"input">["inputMode"];
	maxLength?: number;
};

export const classesControle =
	"min-h-12 w-full rounded-lg border-2 border-neutral-900 bg-white px-4 py-3 text-base " +
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 " +
	"aria-[invalid=true]:border-red-700";

export function CampoTexto({ name, rotulo, defaultValue, erro, inputMode, maxLength }: CampoTextoProps) {
	const id = useId();
	const idErro = `${id}-erro`;
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
				aria-describedby={erro ? idErro : undefined}
				className={classesControle}
			/>
			{erro ? <MensagemCampo id={idErro}>{erro}</MensagemCampo> : null}
		</div>
	);
}
