"use client";

import { useEffect, useRef, useState } from "react";

import type { BlocoLista, CategoriaFiltro, ProdutoCartao } from "@/lib/catalogo";
import { acrescentarSemRepetir } from "@/lib/catalogo/exibicao";
import { lerRestauracao, salvarRestauracao } from "@/lib/catalogo/restauracao";

import { CartaoProduto } from "./cartao-produto";
import { Filtro } from "./filtro";
import { textos } from "./textos";

// Lista da página inicial (ramo FALLBACK): o 1º bloco já filtrado e o slug efetivo vêm do
// servidor por props. "Carregar mais" e a restauração nunca tocam na URL (FR-007, U1): sem
// router, sem history.pushState/replaceState; a URL só muda pelos links do filtro.
// A página usa `key` = slug efetivo, então trocar de filtro remonta a lista.

type Props = { categorias: CategoriaFiltro[]; inicial: BlocoLista };

function urlDoBloco(cursor: string, slug: string | null) {
	const params = new URLSearchParams({ depois: cursor });
	if (slug !== null) params.set("categoria", slug);
	return `/api/catalogo/produtos?${params}`;
}

async function buscarBloco(cursor: string, slug: string | null): Promise<BlocoLista> {
	const r = await fetch(urlDoBloco(cursor, slug));
	if (!r.ok) throw new Error("falha");
	const corpo = (await r.json()) as BlocoLista;
	if (!Array.isArray(corpo.itens) || (corpo.proximo !== null && typeof corpo.proximo !== "string")) {
		throw new Error("resposta inválida");
	}
	return corpo;
}

export function ListaCatalogo({ categorias, inicial }: Props) {
	const slug = inicial.categoria;
	const [itens, setItens] = useState<ProdutoCartao[]>(inicial.itens);
	const [cursor, setCursor] = useState<string | null>(inicial.proximo);
	const [carregando, setCarregando] = useState(false);
	const [falhou, setFalhou] = useState(false);
	const lista = useRef<HTMLUListElement>(null);
	const tentarDeNovo = useRef<HTMLButtonElement>(null);
	// Efeito pendente para depois de pintar os itens novos (restaurados ou acrescentados).
	const depoisDePintar = useRef<{ rolarPara?: number; focarEm?: number }>({});

	useEffect(() => {
		const { rolarPara, focarEm } = depoisDePintar.current;
		depoisDePintar.current = {};
		if (rolarPara !== undefined) window.scrollTo(0, rolarPara);
		if (focarEm !== undefined) lista.current?.querySelectorAll<HTMLAnchorElement>("li a")[focarEm]?.focus();
	}, [itens]);

	// Falha: o botão "Carregar mais" sai da tela; o foco vai para "Tentar de novo".
	useEffect(() => {
		if (falhou) tentarDeNovo.current?.focus();
	}, [falhou]);

	// bfcache: a lista volta intacta (sem remontar), então a restauração guardada não vale mais.
	useEffect(() => {
		const descartar = (e: PageTransitionEvent) => {
			if (e.persisted) lerRestauracao(slug);
		};
		window.addEventListener("pageshow", descartar);
		return () => window.removeEventListener("pageshow", descartar);
	}, [slug]);

	// Declarado depois do efeito acima: na montagem ele roda antes e não consome a posição ainda não pintada.
	// U2: a restauração vale primeiro; sem ela, a lista segue com o 1º bloco das props. O
	// sessionStorage só existe depois da hidratação, por isso a leitura é num efeito.
	useEffect(() => {
		const r = lerRestauracao(slug);
		if (r === null) return;
		depoisDePintar.current = { rolarPara: r.scrollY };
		/* eslint-disable react-hooks/set-state-in-effect -- leitura de sistema externo (sessionStorage) após hidratar */
		setItens(r.itens);
		setCursor(r.cursor);
		/* eslint-enable react-hooks/set-state-in-effect */
	}, [slug]);

	async function carregarMais() {
		if (cursor === null || carregando) return;
		setCarregando(true);
		setFalhou(false);
		try {
			const bloco = await buscarBloco(cursor, slug);
			const antes = itens.length;
			const todos = acrescentarSemRepetir(itens, bloco.itens);
			if (todos.length > 0) depoisDePintar.current = { focarEm: Math.min(antes, todos.length - 1) };
			setItens(todos);
			setCursor(bloco.proximo);
		} catch {
			setFalhou(true);
		} finally {
			setCarregando(false);
		}
	}

	// Guardada no clique, antes da navegação para o detalhe.
	function guardar(e: React.MouseEvent<HTMLUListElement>) {
		// Só o clique simples, que sai da lista; Ctrl/Meta/Shift abrem outra aba e a lista fica.
		// Sem checar defaultPrevented: o Link do Next já o aciona ao navegar sem recarregar.
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		const a = e.target instanceof Element ? e.target.closest("a") : null;
		if (a === null) return;
		salvarRestauracao(slug, { itens, cursor, scrollY: window.scrollY, aberto: new URL(a.href).pathname });
	}

	const nome = categorias.find((c) => c.slug === slug)?.nome;

	return (
		<>
			<Filtro categorias={categorias} escolhida={slug} />
			<p aria-live="polite">{nome ? `${textos.mostrandoDe} ${nome}` : textos.mostrandoTodos}</p>
			{itens.length === 0 ? (
				<p>{textos.semProdutos}</p>
			) : (
				<ul ref={lista} onClick={guardar} className="grid grid-cols-2 gap-3">
					{itens.map((p, i) => (
						<li key={p.href}>
							<CartaoProduto produto={p} eager={i < 4} />
						</li>
					))}
				</ul>
			)}
			{falhou ? (
				<p role="alert">
					{textos.erroCarregarMais}{" "}
					<button ref={tentarDeNovo} type="button" onClick={carregarMais} className="min-h-12 underline">
						{textos.tentarDeNovo}
					</button>
				</p>
			) : null}
			{cursor !== null && !falhou ? (
				<button type="button" onClick={carregarMais} disabled={carregando} className="min-h-12 border px-4">
					{carregando ? textos.carregandoMais : textos.carregarMais}
				</button>
			) : null}
		</>
	);
}
