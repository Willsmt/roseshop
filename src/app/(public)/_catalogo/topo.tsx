import { LogoMarca } from "@/components/ui/logo";

import { LinkInicio } from "./link-inicio";
import { textos } from "./textos";

// Topo das páginas internas (detalhe, sacola, não encontrado): o símbolo leva à loja. O acesso à
// sacola não mora aqui: fica no espaço reservado do layout, sobreposto ao canto direito (o layout
// só pode acrescentar esse espaço ao HTML da 005). Sem texto: o nome vem do aria-label, para a
// /sacola sem JavaScript continuar sem texto do servidor.
export function Topo() {
	return (
		<header className="mx-auto flex h-16 w-full max-w-5xl items-center px-4">
			<LinkInicio
				rotulo={textos.inicio}
				className="-ml-2 inline-flex size-12 items-center justify-center rounded-pilula text-acao"
			>
				<LogoMarca className="size-9" />
			</LinkInicio>
		</header>
	);
}
