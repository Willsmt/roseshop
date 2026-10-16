import type { ProdutoPublico } from "@/lib/catalogo";
import { mostrarWhatsapp } from "@/lib/catalogo/exibicao";

import { textos } from "./textos";

// Mesmo desenho do Button secundário, como link (abre o WhatsApp na mesma aba, sem target).
export function BotaoWhatsapp({ whatsapp, esgotado }: Pick<ProdutoPublico, "whatsapp" | "esgotado">) {
	if (whatsapp === null || !mostrarWhatsapp(esgotado, true)) return null;
	return (
		<a
			href={whatsapp.href}
			className="inline-flex min-h-12 w-full items-center justify-center rounded-pilula bg-superficie px-6 py-3 font-bold text-texto sm:w-auto sm:self-start shadow-[inset_0_0_0_2px_var(--cor-texto)] hover:bg-superficie-2"
		>
			{textos.perguntarNoWhatsapp}
		</a>
	);
}
