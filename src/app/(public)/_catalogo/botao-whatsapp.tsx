import type { ProdutoPublico } from "@/lib/catalogo";
import { mostrarWhatsapp } from "@/lib/catalogo/exibicao";

import { textos } from "./textos";

export function BotaoWhatsapp({ whatsapp, esgotado }: Pick<ProdutoPublico, "whatsapp" | "esgotado">) {
	if (whatsapp === null || !mostrarWhatsapp(esgotado, true)) return null;
	return (
		<a href={whatsapp.href} className="inline-flex min-h-12 items-center border px-4">
			{textos.perguntarNoWhatsapp}
		</a>
	);
}
