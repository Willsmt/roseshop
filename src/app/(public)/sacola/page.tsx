import type { Metadata } from "next";
import Link from "next/link";

import { configCatalogo } from "@/lib/catalogo";
import { textos } from "@/lib/sacola/textos";

import { TelaSacola } from "../_sacola/tela-sacola";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: textos.sacola };

// /sacola (research D10, CT§3): a sacola está só no aparelho, então o servidor manda a casca. Sem
// JavaScript, o aviso e o caminho de volta (US4.6); o número do WhatsApp vem validado do servidor.
export default function PaginaSacola() {
	return (
		<main className="mx-auto max-w-xl p-4">
			<noscript>
				<p>{textos.ativeJavascript}</p>
				<Link href="/" className="inline-flex min-h-12 items-center underline">
					{textos.verOCatalogo}
				</Link>
			</noscript>
			<TelaSacola whatsapp={configCatalogo().whatsapp} />
		</main>
	);
}
