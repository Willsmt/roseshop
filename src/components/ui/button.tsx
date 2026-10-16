type ButtonProps = React.ComponentProps<"button"> & {
	variant: "primary" | "secondary";
};

// Pílula de 48px no mínimo (constitution V). O foco usa o anel global (globals.css); o toque
// afunda o botão 1px com a mola curta, e nada se move com prefers-reduced-motion.
const base =
	"inline-flex min-h-12 w-full items-center justify-center rounded-pilula px-6 py-3 text-base font-bold sm:w-auto " +
	"transition-[translate,background-color,box-shadow] duration-[var(--mola-duracao)] ease-mola active:translate-y-px " +
	"disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
	primary: "bg-acao text-white hover:bg-acao-forte",
	secondary: "bg-superficie text-texto shadow-[inset_0_0_0_2px_var(--cor-texto)] hover:bg-superficie-2",
} as const;

export function Button({ variant, className, ...props }: ButtonProps) {
	const classes = [base, variants[variant], className].filter(Boolean).join(" ");
	return <button {...props} data-variant={variant} className={classes} />;
}
