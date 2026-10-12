"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { adicionarFoto, moverFoto, removerFoto, trocarFoto } from "@/lib/fotos/actions";
import { MUITOS_PENDENTES_TELA_FOTOS, PEDIDO_TROCA, SALVANDO, SUCESSO_FOTO, mensagemFoto } from "@/lib/fotos/mensagens";
import type { Conjunto, ResultadoFotos } from "@/lib/fotos/tipos";

import { EscolherFoto } from "../../_fotos/escolher-foto";
import { ListaFotos } from "../../_fotos/lista-fotos";
import { RecorteFoto } from "../../_fotos/recorte-foto";
import type { FotoLocal } from "../../_fotos/tipos";
import { conferirArquivo, useEnvioFotos } from "../../_fotos/usar-envio";

type Props = { produtoId: number; inicial: Conjunto };
// Posição de 1 a 3 (o conjunto nunca passa de 3 fotos); as actions exigem este tipo estreito.
type Posicao = 1 | 2 | 3;
const posicao = (n: number): Posicao | null => (n === 1 || n === 2 || n === 3 ? n : null);
type Mensagem = { tipo: "sucesso" | "erro"; texto: string };

// Na tela Fotos o limite de pendentes não fala do cadastro.
const telaFotos = (texto: string) => (texto === mensagemFoto("muitos_pendentes") ? MUITOS_PENDENTES_TELA_FOTOS : texto);

// Tela "Fotos" de um produto existente. Cada ação vale na hora (sem "Salvar") e roda uma de cada
// vez: a próxima usa a `fotosVersao` devolvida pela anterior (US4-AC7).
export function GerenciarFotos({ produtoId, inicial }: Props) {
	const [conjunto, setConjunto] = useState<Conjunto>(inicial);
	const [mensagem, setMensagem] = useState<Mensagem | null>(null);
	const [pendente, setPendente] = useState(false);
	const [emRecorte, setEmRecorte] = useState<File | null>(null);
	// Posição (1-based) da foto que está sendo trocada; null = modo adicionar.
	const [posicaoTroca, setPosicaoTroca] = useState<number | null>(null);
	const [conferindo, setConferindo] = useState(false);
	// Produto apagado por outra pessoa: a tela só mostra o aviso e o caminho de volta.
	const [semProduto, setSemProduto] = useState(false);
	const pedidoRef = useRef<HTMLParagraphElement>(null);
	const avisoRef = useRef<HTMLDivElement>(null);
	const ocupado = useRef(false);
	const escolha = useRef(0);
	const processada = useRef<string | null>(null);
	const envio = useEnvioFotos();

	const fotoEnvio = envio.fotos[0] ?? null;
	const ocupada = pendente || conferindo || emRecorte !== null || fotoEnvio !== null;

	async function executar(chamar: () => Promise<ResultadoFotos>, sucesso: string) {
		ocupado.current = true;
		setPendente(true);
		setMensagem(null);
		try {
			const r = await chamar();
			if (r.ok) {
				setConjunto({ fotosVersao: r.fotosVersao, fotos: r.fotos });
				setMensagem({ tipo: "sucesso", texto: sucesso });
			} else {
				if (r.atual) setConjunto(r.atual);
				if (r.motivo === "nao_existe") setSemProduto(true);
				setMensagem({ tipo: "erro", texto: r.mensagem });
			}
		} catch {
			setMensagem({ tipo: "erro", texto: mensagemFoto("falha_geral") });
		} finally {
			ocupado.current = false;
			setPosicaoTroca(null);
			setPendente(false);
		}
	}

	// Foto enviada ao R2 ⇒ uma única chamada por envio; a foto sai do hook em qualquer desfecho.
	useEffect(() => {
		if (pendente || ocupado.current) return;
		const f = envio.fotos.find((x) => x.estado.tipo === "enviada");
		if (!f || f.estado.tipo !== "enviada" || processada.current === f.chave) return;
		processada.current = f.chave;
		const { chave } = f;
		const envioId = f.estado.envioId;
		const { fotosVersao } = conjunto;
		const troca = posicaoTroca === null ? null : posicao(posicaoTroca);
		void executar(
			() =>
				troca === null
					? adicionarFoto({ produtoId, fotosVersao, envioId })
					: trocarFoto({ produtoId, fotosVersao, posicao: troca, envioId }),
			troca === null ? SUCESSO_FOTO.adicionada : SUCESSO_FOTO.trocada,
		).then(() => envio.remover(chave));
	});

	async function aoEscolher(arquivo: File) {
		if (ocupado.current) return;
		setMensagem(null);
		envio.limparAviso();
		const atual = ++escolha.current;
		setConferindo(true);
		const motivo = await conferirArquivo(arquivo).finally(() => setConferindo(false));
		if (atual !== escolha.current) return;
		if (motivo) setMensagem({ tipo: "erro", texto: mensagemFoto(motivo) });
		else setEmRecorte(arquivo);
	}

	function aoTrocar(arquivo: string) {
		if (ocupado.current || ocupada) return;
		const foto = conjunto.fotos.find((f) => f.arquivo === arquivo);
		if (!foto) return;
		setMensagem(null);
		setPosicaoTroca(foto.posicao);
	}

	function aoRemover(arquivo: string) {
		if (ocupado.current || ocupada) return;
		const i = conjunto.fotos.findIndex((f) => f.arquivo === arquivo);
		const pos = posicao(i + 1);
		if (i < 0 || pos === null) return;
		void executar(
			() => removerFoto({ produtoId, fotosVersao: conjunto.fotosVersao, posicao: pos }),
			SUCESSO_FOTO.removida,
		);
	}

	function aoMover(de: number, para: number) {
		if (ocupado.current || ocupada) return;
		const origem = posicao(de + 1);
		const destino = posicao(para + 1);
		if (origem === null || destino === null) return;
		void executar(
			() => moverFoto({ produtoId, fotosVersao: conjunto.fotosVersao, de: origem, para: destino }),
			SUCESSO_FOTO.ordem,
		);
	}

	function descartarEnvio(chave: string) {
		envio.remover(chave);
		setPosicaoTroca(null);
	}

	const trocando = posicaoTroca !== null;
	const erroEnvio = envio.aviso;

	// Foco: ao pedir a foto nova vai para o pedido; após uma ação, para o aviso.
	useEffect(() => {
		const el = pedidoRef.current;
		if (!el) return;
		el.focus();
		if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
	}, [posicaoTroca]);
	useEffect(() => {
		const el = avisoRef.current;
		if (!el) return;
		el.focus();
		if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
	}, [mensagem, erroEnvio]);

	const salvas: FotoLocal[] = conjunto.fotos.map((f) => ({
		chave: f.arquivo,
		previa: f.url,
		estado: { tipo: "salva" },
	}));
	const aviso: Mensagem | null = mensagem ?? (erroEnvio ? { tipo: "erro", texto: telaFotos(erroEnvio) } : null);
	const estadoEnvio = fotoEnvio?.estado;
	const salvando = pendente || estadoEnvio?.tipo === "enviada";

	if (semProduto) {
		return (
			<div className="flex flex-col gap-6">
				{aviso ? (
					<div ref={avisoRef} tabIndex={-1}>
						<Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
					</div>
				) : null}
				<Link href="/painel/produtos" className="inline-flex min-h-12 items-center text-base font-semibold underline">
					Voltar à lista
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{aviso ? (
				<div ref={avisoRef} tabIndex={-1}>
					<Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
				</div>
			) : null}
			{emRecorte ? (
				<RecorteFoto
					arquivo={emRecorte}
					onUsar={(area) => {
						envio.enviar(emRecorte, area);
						setEmRecorte(null);
					}}
					onCancelar={() => {
						setEmRecorte(null);
						setPosicaoTroca(null);
					}}
				/>
			) : (
				<>
					<ListaFotos
						fotos={salvas}
						onRemover={aoRemover}
						onMover={aoMover}
						onTentarDeNovo={() => {}}
						onTrocar={aoTrocar}
						podeRemover={conjunto.fotos.length > 1}
						confirmarRemocao
						desabilitado={ocupada || trocando}
					/>
					{salvando ? (
						<p role="status" className="text-base text-neutral-700">
							{SALVANDO}
						</p>
					) : null}
					{conjunto.fotos.length === 1 ? <p className="text-base">{mensagemFoto("ultima")}</p> : null}
					{trocando ? (
						<p ref={pedidoRef} tabIndex={-1} className="text-base font-semibold">
							{PEDIDO_TROCA(posicaoTroca)}
						</p>
					) : null}
					{fotoEnvio && estadoEnvio?.tipo === "enviando" ? (
						<p role="status" className="text-base text-neutral-700">
							Enviando…
						</p>
					) : null}
					{fotoEnvio && estadoEnvio?.tipo === "nao_enviada" ? (
						<div className="flex flex-col gap-3">
							<p className="text-base font-semibold text-red-800">{mensagemFoto("nao_enviada")}</p>
							{estadoEnvio.mensagem !== mensagemFoto("nao_enviada") ? (
								<p className="text-base text-red-800">{telaFotos(estadoEnvio.mensagem)}</p>
							) : null}
							<div className="flex flex-col gap-3 sm:flex-row">
								{estadoEnvio.podeTentar ? (
									<Button type="button" variant="primary" onClick={() => envio.tentarDeNovo(fotoEnvio.chave)}>
										Tentar de novo
									</Button>
								) : null}
								<Button type="button" variant="secondary" onClick={() => descartarEnvio(fotoEnvio.chave)}>
									Cancelar
								</Button>
							</div>
						</div>
					) : null}
					<EscolherFoto
						quantidade={trocando ? 0 : conjunto.fotos.length}
						onEscolher={aoEscolher}
						desabilitado={ocupada}
					/>
					{trocando && !ocupada ? (
						<Button type="button" variant="secondary" onClick={() => setPosicaoTroca(null)}>
							Cancelar
						</Button>
					) : null}
				</>
			)}
		</div>
	);
}
