type AvisoProps = {
	tipo: "sucesso" | "erro";
	children: React.ReactNode;
};

// Faixa fixa (não some sozinha): quem lê devagar tem o tempo que precisar. A cor fica na borda
// grossa à esquerda e no fundo; o texto é sempre a cor de texto (contraste acima de 12:1).
const tipos = {
	sucesso: { role: "status", classes: "border-sucesso bg-sucesso-fundo" },
	erro: { role: "alert", classes: "border-erro bg-erro-fundo" },
} as const;

export function Aviso({ tipo, children }: AvisoProps) {
	const { role, classes } = tipos[tipo];
	return (
		<div role={role} className={`rounded-suave border-l-[6px] px-4 py-3 text-base font-bold text-texto ${classes}`}>
			{children}
		</div>
	);
}
