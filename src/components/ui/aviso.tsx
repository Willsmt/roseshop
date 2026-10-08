type AvisoProps = {
	tipo: "sucesso" | "erro";
	children: React.ReactNode;
};

const tipos = {
	sucesso: { role: "status", classes: "border-green-700 bg-green-50 text-green-900" },
	erro: { role: "alert", classes: "border-red-700 bg-red-50 text-red-900" },
} as const;

export function Aviso({ tipo, children }: AvisoProps) {
	const { role, classes } = tipos[tipo];
	return (
		<div
			role={role}
			className={`rounded-lg border-2 px-4 py-3 text-base font-semibold ${classes}`}
		>
			{children}
		</div>
	);
}
