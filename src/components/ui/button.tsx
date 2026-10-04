type ButtonProps = React.ComponentProps<"button"> & {
	variant: "primary" | "secondary";
};

const base =
	"inline-flex min-h-12 w-full items-center justify-center rounded-lg px-6 py-3 text-base font-semibold sm:w-auto " +
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 " +
	"disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
	primary: "bg-neutral-900 text-white hover:bg-neutral-700",
	secondary:
		"border-2 border-neutral-900 bg-white text-neutral-900 hover:bg-neutral-100",
} as const;

export function Button({ variant, className, ...props }: ButtonProps) {
	const classes = [base, variants[variant], className].filter(Boolean).join(" ");
	return <button {...props} data-variant={variant} className={classes} />;
}
