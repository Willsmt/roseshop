import { useId } from "react";

import { MensagemCampo } from "./mensagem-campo";

type CaixaMarcacaoProps = {
	name: string;
	rotulo: string;
	defaultChecked: boolean;
	erro?: string;
};

// O <label> envolve a caixa: tocar no texto também marca (área de toque ≥ 48 px).
export function CaixaMarcacao({ name, rotulo, defaultChecked, erro }: CaixaMarcacaoProps) {
	const idErro = `${useId()}-erro`;
	return (
		<div className="flex flex-col gap-2">
			<label className="flex min-h-12 items-center gap-3 text-base font-semibold">
				<input
					type="checkbox"
					name={name}
					defaultChecked={defaultChecked}
					aria-invalid={erro ? "true" : undefined}
					aria-describedby={erro ? idErro : undefined}
					className="size-6 shrink-0 accent-neutral-900"
				/>
				{rotulo}
			</label>
			{erro ? <MensagemCampo id={idErro}>{erro}</MensagemCampo> : null}
		</div>
	);
}
