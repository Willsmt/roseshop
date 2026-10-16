"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { alterarSacola, lerSacola } from "@/lib/sacola/armazenamento";
import { conferir, juntar, linhasDoPedido, type ItemConferencia } from "@/lib/sacola/conferencia";
import { medidorObservacao } from "@/lib/sacola/mensagem";
import { aplicarConferencia, limpar, mudarQuantidade, remover, type Operacao, type Sacola } from "@/lib/sacola/sacola";
import { textos } from "@/lib/sacola/textos";
import { resumo } from "@/lib/sacola/total";
import { Button } from "@/components/ui/button";

import { ConfirmarLimpar } from "./confirmar-limpar";
import { EnviarPedido } from "./enviar-pedido";
import { ItemSacola } from "./item-sacola";
import { Observacao } from "./observacao";
import { armazenamento, useLeituraSacola } from "./usar-sacola";

// Sem número válido o envio não existe, mas o medidor da observação continua: mede com o maior
// número E.164 possível (15 dígitos), o caso mais apertado.
const NUMERO_MEDIDA = "+999999999999999";

const titulo = "text-2xl font-bold focus:outline-none";
const link = "inline-flex min-h-12 items-center underline";

// Marca do histórico posta antes de abrir o WhatsApp (research D11); a volta, inclusive pelo
// bfcache, chega com `pageshow`.
const assinarVolta = (aoMudar: () => void) => {
	window.addEventListener("pageshow", aoMudar);
	return () => window.removeEventListener("pageshow", aoMudar);
};
const foiEnviado = () => (window.history.state as { sacolaEnviada?: unknown } | null)?.sacolaEnviada === true;
const naoEnviado = () => false;

type Abertura = "conferindo" | "falha" | "pronta";

// Toda gravação da tela passa por aqui: relê, aplica e grava (FR-008a).
const gravar = (op: Operacao) => alterarSacola(armazenamento, op, Date.now());

// Página /sacola (CT§3, research D10–D13). Nada antes de hidratar (o primeiro render é igual ao do
// servidor). A conferência de abertura cobre todos os códigos; depois, só os que chegam de outra
// aba. Toda gravação é por `alterarSacola`, sobre a sacola relida.
export function TelaSacola({ whatsapp }: { whatsapp: string | null }) {
	const leitura = useLeituraSacola();
	const enviado = useSyncExternalStore(assinarVolta, foiEnviado, naoEnviado);
	const [abertura, setAbertura] = useState<Abertura>("conferindo");
	const [conferidos, setConferidos] = useState<ReadonlyMap<string, ItemConferencia>>(new Map());
	const [avisos, setAvisos] = useState<string[]>([]);
	const [precoMudou, setPrecoMudou] = useState<ReadonlySet<string>>(new Set());
	const [anuncio, setAnuncio] = useState("");
	const [falhaGravar, setFalhaGravar] = useState(false);
	const [observacao, setObservacao] = useState("");
	const [tentativa, setTentativa] = useState(0);
	// Códigos com conferência em andamento e os que falharam fora da abertura (sem repetir sozinho).
	const emAndamento = useRef(new Set<string>());
	const falharam = useRef(new Set<string>());
	const focarEm = useRef<string | null>(null);

	const sacola = leitura?.disponivel ? leitura.sacola : null;
	const codigos = sacola?.itens.map((i) => i.codigo) ?? [];
	const chaveCodigos = codigos.join(",");

	useEffect(() => {
		if (focarEm.current === null) return;
		const alvo = document.getElementById(focarEm.current);
		if (alvo) {
			alvo.focus();
			focarEm.current = null;
		}
	});

	// Grava o resultado (inexistente sai, preço atualiza), guarda o que a tela mostra e os avisos.
	// `antes` é a sacola relida quando a conferência foi pedida.
	function registrar(itens: ItemConferencia[], antes: Sacola, substituirAvisos: boolean): boolean {
		const removidos = itens.filter((c) => c.estado === "inexistente").map((c) => textos.naoEstaMaisNoCatalogo(c.codigo));
		const mudados = juntar(antes, itens)
			.filter((i) => i.precoAlterado)
			.map((i) => i.codigo);
		const r = gravar(aplicarConferencia(itens));
		setFalhaGravar(!r.ok);
		setConferidos((atual) => new Map([...atual, ...itens.map((c) => [c.codigo, c] as const)]));
		setAvisos((atual) => (substituirAvisos ? removidos : [...atual, ...removidos]));
		setPrecoMudou((atual) => new Set([...atual, ...mudados]));
		return r.ok;
	}

	// D13: confere o que ainda não foi conferido. Na abertura, todos; depois, só os que outra aba trouxe.
	useEffect(() => {
		if (abertura === "falha" || chaveCodigos === "") return;
		const novos = chaveCodigos
			.split(",")
			.filter((c) => !conferidos.has(c) && !emAndamento.current.has(c) && !falharam.current.has(c));
		if (novos.length === 0) return;
		const lida = lerSacola(armazenamento, Date.now());
		if (!lida.disponivel) return;
		const naAbertura = abertura === "conferindo";
		let vivo = true;
		const andamento = emAndamento.current;
		for (const c of novos) andamento.add(c);
		conferir(novos).then((itens) => {
			if (!vivo) return;
			for (const c of novos) andamento.delete(c);
			if (itens === "falha") {
				if (naAbertura) setAbertura("falha");
				else for (const c of novos) falharam.current.add(c);
				return;
			}
			registrar(itens, lida.sacola, naAbertura);
			setAbertura("pronta");
		});
		return () => {
			vivo = false;
			for (const c of novos) andamento.delete(c);
		};
	}, [abertura, chaveCodigos, conferidos, tentativa]);

	if (leitura === null) return null;

	if (!leitura.disponivel) {
		return (
			<div className="flex flex-col gap-4">
				<h1 className={titulo}>{textos.sacola}</h1>
				<p>{textos.armazenamentoIndisponivel}</p>
				<Link href="/" className={link}>
					{textos.verOCatalogo}
				</Link>
			</div>
		);
	}

	const atual = leitura.sacola;
	const regiaoAnuncio = (
		<p id="sacola-anuncio" role="status" className="sr-only">
			{anuncio}
		</p>
	);
	const regiaoAvisos = (
		<div role="status" className="flex flex-col gap-1">
			{avisos.map((a) => (
				<p key={a}>{a}</p>
			))}
		</div>
	);
	const alertaGravar = falhaGravar ? <p role="alert">{textos.falhaAoGravar}</p> : null;

	function alterar(op: Operacao): Sacola | null {
		const r = gravar(op);
		setFalhaGravar(!r.ok && r.motivo === "armazenamento");
		return r.ok ? r.sacola : null;
	}

	function esvaziou() {
		focarEm.current = "sacola-vazia";
		setAnuncio(textos.sacolaFicouVazia);
	}

	if (atual.itens.length === 0) {
		return (
			<div className="flex flex-col gap-4">
				{regiaoAnuncio}
				{regiaoAvisos}
				<h1 id="sacola-vazia" tabIndex={-1} className={titulo}>
					{textos.sacolaVazia}
				</h1>
				<Link href="/" className={link}>
					{textos.verOCatalogo}
				</Link>
			</div>
		);
	}

	const cabecalho = (
		<h1 id="sacola-titulo" tabIndex={-1} className={titulo}>
			{textos.sacola}
		</h1>
	);

	// Abertura sem conferência válida: só o que está guardado, sem preços (CT§3).
	if (abertura !== "pronta") {
		const conferindo = abertura === "conferindo";
		const idMotivo = conferindo ? "sacola-conferindo" : "sacola-falha";
		return (
			<div className="flex flex-col gap-4">
				{regiaoAnuncio}
				{cabecalho}
				{conferindo ? (
					<p id={idMotivo} role="status">
						{textos.conferindo}
					</p>
				) : (
					<div className="flex flex-col gap-2">
						<p id={idMotivo}>{textos.falhaAoAbrir}</p>
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								setAbertura("conferindo");
								setTentativa((n) => n + 1);
							}}
						>
							{textos.tentarDeNovo}
						</Button>
					</div>
				)}
				<ul>
					{atual.itens.map((i) => (
						<li key={i.codigo} className="py-2">
							#{i.codigo}
						</li>
					))}
				</ul>
				<EnviarPedido
					whatsapp={whatsapp}
					sacola={atual}
					anteriores={[]}
					observacao=""
					bloqueadoPor={idMotivo}
					aoConferir={() => false}
				/>
			</div>
		);
	}

	const itens = juntar(atual, [...conferidos.values()]);
	const pendentes = atual.itens.filter((i) => !conferidos.has(i.codigo));
	const linhas = linhasDoPedido(itens);
	const { subtotal, aConsultar } = resumo(linhas);
	const excede = (() => {
		const m = medidorObservacao({ numero: whatsapp ?? NUMERO_MEDIDA, linhas, observacao });
		return m.limite === "mensagem" && m.excede;
	})();
	const todosEsgotados = pendentes.length === 0 && itens.every((i) => i.estado === "esgotado");
	const bloqueadoPor = todosEsgotados ? "envio-esgotados" : excede ? "obs-conta" : null;

	function quantidade(codigo: string, n: number) {
		alterar(mudarQuantidade(codigo, n));
	}

	function tirar(codigo: string) {
		const nova = alterar(remover(codigo));
		if (nova === null) return;
		if (nova.itens.length === 0) return esvaziou();
		focarEm.current = "sacola-titulo";
		setAnuncio(textos.produtoRemovido(resumo(linhasDoPedido(juntar(nova, [...conferidos.values()]))).subtotal));
	}

	function limparTudo() {
		if (alterar(limpar()) !== null) esvaziou();
	}

	function aoConferirEnvio(novos: ItemConferencia[], antes: Sacola, mudou: boolean): boolean {
		const gravou = registrar(novos, antes, true);
		if (mudou) focarEm.current = "sacola-titulo";
		return gravou;
	}

	return (
		<div className="flex flex-col gap-4">
			{regiaoAnuncio}
			{enviado ? (
				<section className="flex flex-col gap-2 rounded-lg border-2 p-4">
					<p className="font-semibold">{textos.enviado}</p>
					<ConfirmarLimpar aoConfirmar={limparTudo} />
					<Link href="/" className={link}>
						{textos.voltar}
					</Link>
				</section>
			) : null}
			{cabecalho}
			{regiaoAvisos}
			{alertaGravar}
			<ul>
				{itens.map((item) => (
					<ItemSacola
						key={item.codigo}
						item={item}
						precoMudou={precoMudou.has(item.codigo)}
						aoMudarQuantidade={(n) => quantidade(item.codigo, n)}
						aoRemover={() => tirar(item.codigo)}
					/>
				))}
				{pendentes.map((i) => (
					<li key={i.codigo} className="py-2">
						#{i.codigo}
					</li>
				))}
			</ul>
			<div id="sacola-resumo" aria-live="polite" className="flex flex-col gap-1 text-lg font-semibold">
				<p>
					{textos.subtotal} {subtotal}
				</p>
				{aConsultar === null ? null : <p>{aConsultar}</p>}
			</div>
			<Observacao valor={observacao} aoMudar={setObservacao} numero={whatsapp ?? NUMERO_MEDIDA} linhas={linhas} />
			<ConfirmarLimpar aoConfirmar={limparTudo} />
			{todosEsgotados ? <p id="envio-esgotados">{textos.todosEsgotados}</p> : null}
			<EnviarPedido
				whatsapp={whatsapp}
				sacola={atual}
				anteriores={[...conferidos.values()]}
				observacao={observacao}
				bloqueadoPor={bloqueadoPor}
				aoConferir={aoConferirEnvio}
			/>
		</div>
	);
}
