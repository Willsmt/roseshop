type MensagemCampoProps = {
	id: string;
	children: React.ReactNode;
};

// Mensagem de erro de um campo; o campo a aponta por `aria-describedby`.
export function MensagemCampo({ id, children }: MensagemCampoProps) {
	return (
		<p id={id} className="text-base font-semibold text-red-700">
			{children}
		</p>
	);
}
