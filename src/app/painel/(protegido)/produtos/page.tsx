import Link from "next/link";

import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Selecao } from "@/components/ui/selecao";
import { requireAdminPage } from "@/lib/auth";
import { listarCategorias } from "@/lib/categorias";
import { listarProdutosDoPainel } from "@/lib/produtos/painel";

const LISTA = "/painel/produtos";
const linkPrimario =
	"inline-flex min-h-12 items-center justify-center rounded-lg bg-neutral-900 px-6 py-3 text-base font-semibold text-white sm:self-start";
const linkSecundario =
	"inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-neutral-900 px-4 py-3 text-base font-semibold underline sm:self-start";

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

export default async function ProdutosPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	await requireAdminPage(LISTA);
	const sp = await searchParams;
	const [{ itens, verMais, voltarAoComeco, aviso }, categorias] = await Promise.all([
		listarProdutosDoPainel(sp),
		listarCategorias(),
	]);
	const categoria = primeiro(sp.categoria);
	const situacao = primeiro(sp.situacao);
	const busca = primeiro(sp.busca);
	const filtrando = categoria !== "" || situacao !== "" || busca !== "";

	return (
		<div className="flex flex-col gap-6">
			<Link href="/painel" className="inline-flex min-h-12 items-center self-start text-base font-semibold underline">
				Voltar ao painel
			</Link>
			<h1 className="text-2xl font-bold">Produtos</h1>
			{aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}
			<Link href={`${LISTA}/novo`} className={linkPrimario}>
				Novo produto
			</Link>
			<form action={LISTA} method="get" className="flex flex-col gap-4">
				<Selecao
					name="categoria"
					rotulo="Categoria"
					opcoes={categorias.map((c) => ({ valor: String(c.id), rotulo: c.nome }))}
					defaultValue={categoria}
					vazio="Todas as categorias"
				/>
				<Selecao
					name="situacao"
					rotulo="Situação"
					opcoes={[
						{ valor: "disponivel", rotulo: "Disponível" },
						{ valor: "esgotado", rotulo: "Esgotado" },
					]}
					defaultValue={situacao}
					vazio="Todas"
				/>
				<CampoTexto name="busca" rotulo="Buscar por nome ou código" defaultValue={busca} />
				<Button type="submit" variant="secondary">
					Filtrar
				</Button>
			</form>
			{itens.length === 0 ? (
				filtrando ? (
					<div className="flex flex-col gap-4">
						<p className="text-base font-semibold">Nada encontrado com esses filtros.</p>
						<Link href={LISTA} className={linkSecundario}>
							Limpar filtros
						</Link>
					</div>
				) : (
					<p className="text-base">Você ainda não tem produtos. Use “Novo produto” para cadastrar o primeiro.</p>
				)
			) : (
				<ul className="flex flex-col gap-4">
					{itens.map((i) => (
						<li key={i.id}>
							<Link href={i.href} className="flex gap-4 rounded-lg border border-neutral-300 p-4">
								<span className="flex size-16 shrink-0 items-center justify-center rounded border border-dashed border-neutral-400 text-center text-base">
									sem foto
								</span>
								<span className="flex flex-col gap-1">
									<span className="text-base font-semibold">{i.codigo}</span>
									<span className="text-lg font-bold">{i.nome}</span>
									<span className="text-base">{i.categoriaNome}</span>
									<span className="text-base font-semibold">{i.preco ?? "Sem preço"}</span>
									{i.esgotado ? <span className="text-base font-semibold">Esgotado</span> : null}
									{i.emDestaque ? <span className="text-base font-semibold">Em destaque</span> : null}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
			{verMais || voltarAoComeco ? (
				<div className="flex flex-col gap-3 sm:flex-row">
					{verMais ? (
						<Link href={verMais} className={linkSecundario}>
							Ver mais produtos
						</Link>
					) : null}
					{voltarAoComeco ? (
						<Link href={voltarAoComeco} className={linkSecundario}>
							Voltar ao começo
						</Link>
					) : null}
				</div>
			) : null}
		</div>
	);
}
