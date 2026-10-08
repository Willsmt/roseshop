import { useId } from "react";

import { classesControle } from "./campo-texto";
import { MensagemCampo } from "./mensagem-campo";

type SelecaoProps = {
	name: string;
	rotulo: string;
	opcoes: readonly { valor: string; rotulo: string }[];
	defaultValue: string;
	erro?: string;
	/** Texto da opção inicial, sem valor (ex.: "Escolha uma categoria"). */
	vazio?: string;
};

// Nativa de propósito: no celular abre o seletor do próprio sistema.
export function Selecao({ name, rotulo, opcoes, defaultValue, erro, vazio }: SelecaoProps) {
	const id = useId();
	const idErro = `${id}-erro`;
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={id} className="text-base font-semibold">
				{rotulo}
			</label>
			<select
				id={id}
				name={name}
				defaultValue={defaultValue}
				aria-invalid={erro ? "true" : undefined}
				aria-describedby={erro ? idErro : undefined}
				className={classesControle}
			>
				{vazio !== undefined ? <option value="">{vazio}</option> : null}
				{opcoes.map((o) => (
					<option key={o.valor} value={o.valor}>
						{o.rotulo}
					</option>
				))}
			</select>
			{erro ? <MensagemCampo id={idErro}>{erro}</MensagemCampo> : null}
		</div>
	);
}
