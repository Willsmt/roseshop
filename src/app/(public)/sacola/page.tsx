import type { Metadata } from "next";
import Link from "next/link";

import { configCatalogo } from "@/lib/catalogo";
import { textos } from "@/lib/sacola/textos";

import { Topo } from "../_catalogo/topo";
import { TelaSacola } from "../_sacola/tela-sacola";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: textos.sacola };

// /sacola (research D10, CT§3): a sacola está só no aparelho, então o servidor manda a casca. Sem
// JavaScript, o aviso e o caminho de volta (US4.6); o número do WhatsApp vem validado do servidor.
// O topo só tem o símbolo (nome no aria-label): o HTML do servidor continua sem texto.
export default function PaginaSacola() {
	return (
		<>
			<Topo />
			<main className="mx-auto w-full max-w-2xl px-4 pt-2 pb-12">
				<noscript>
					<p>{textos.ativeJavascript}</p>
					<Link href="/" className="inline-flex min-h-12 items-center font-bold underline underline-offset-4">
						{textos.verOCatalogo}
					</Link>
				</noscript>
				<TelaSacola whatsapp={configCatalogo().whatsapp} />
			</main>
		</>
	);
}
