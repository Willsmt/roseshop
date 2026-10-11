"use client";

import { useEffect, useRef, useState } from "react";

import { confirmarEnvio, pedirEnvio } from "@/lib/fotos/actions";
import { BYTES_CABECALHO, detectarTipo } from "@/lib/fotos/aparelho/detectar-tipo";
import { abrirImagem, prepararFoto } from "@/lib/fotos/aparelho/preparar-foto";
import { type AreaRecorte, LADO_MINIMO } from "@/lib/fotos/aparelho/recortar";
import { mensagemFoto } from "@/lib/fotos/mensagens";
import type { MotivoFoto } from "@/lib/fotos/tipos";

import type { EstadoFoto, FotoLocal } from "./tipos";

// Envio das fotos no passo Fotos do cadastro (contrato interno da SF9). Cada foto segue
// prepararFoto → pedirEnvio → PUT direto no R2 → confirmarEnvio. O resultado de cada etapa só
// vale se a foto ainda existe, a tentativa ainda é a mesma e a tela continua montada.

// PUT que passa disso é abortado e a foto fica "Não enviada" (com "Tentar de novo").
export const TEMPO_LIMITE_ENVIO_MS = 60_000;

// Antes do recorte: tipo pelos bytes (nome e MIME não contam), se o aparelho abre a imagem e
// se ela tem o tamanho mínimo. Nunca rejeita: leitura ou abertura que falha vira "nao_abre".
export async function conferirArquivo(arquivo: Blob): Promise<null | "formato" | "nao_abre" | "pequena"> {
	let cabecalho: Uint8Array;
	try {
		cabecalho = new Uint8Array(await arquivo.slice(0, BYTES_CABECALHO).arrayBuffer());
	} catch {
		return "nao_abre";
	}
	if (detectarTipo(cabecalho) === "outro") return "formato";
	let imagem: Awaited<ReturnType<typeof abrirImagem>>;
	try {
		imagem = await abrirImagem(arquivo);
	} catch {
		return "nao_abre";
	}
	if ("motivo" in imagem) return "nao_abre";
	const pequena = Math.min(imagem.width, imagem.height) < LADO_MINIMO;
	imagem.close?.();
	return pequena ? "pequena" : null;
}

// O que fica fora do estado da tela. Arquivo original e área só até a confirmação; depois,
// só o blob tratado (miniatura e reenvio de foto expirada).
type Memoria = {
	arquivo?: File;
	area?: AreaRecorte;
	blob?: Blob;
	formato?: "webp" | "jpeg";
	previa: string | null;
	envioId?: string;
	tentativa: number;
	podeTentar: boolean;
	// Cancela o PUT da tentativa atual (remover, tentar de novo, sair da tela, tempo-limite).
	controle?: AbortController;
};

const EXPIRADA = mensagemFoto("foto_expirada");
const ehExpirada = (f: FotoLocal) => f.estado.tipo === "nao_enviada" && f.estado.mensagem === EXPIRADA;

export function useEnvioFotos() {
	const [fotos, setFotos] = useState<FotoLocal[]>([]);
	const [avisoGuardado, setAviso] = useState<string | null>(null);
	const memoria = useRef(new Map<string, Memoria>());
	const urls = useRef(new Set<string>());
	const montado = useRef(true);
	const ultimoFoiNaoPassou = useRef(false);
	const contador = useRef(0);

	useEffect(() => {
		montado.current = true;
		const criadas = urls.current;
		const fotosNaMemoria = memoria.current;
		return () => {
			montado.current = false;
			for (const m of fotosNaMemoria.values()) m.controle?.abort();
			for (const url of criadas) URL.revokeObjectURL(url);
			criadas.clear();
		};
	}, []);

	function criarUrl(blob: Blob): string {
		const url = URL.createObjectURL(blob);
		urls.current.add(url);
		return url;
	}
	function revogarUrl(url: string | null) {
		if (!url) return;
		URL.revokeObjectURL(url);
		urls.current.delete(url);
	}
	const vale = (chave: string, tentativa: number) =>
		montado.current && memoria.current.get(chave)?.tentativa === tentativa;
	const atualizar = (chave: string, mudar: (f: FotoLocal) => FotoLocal) =>
		setFotos((lista) => lista.map((f) => (f.chave === chave ? mudar(f) : f)));
	const mudarEstado = (chave: string, estado: EstadoFoto) => atualizar(chave, (f) => ({ ...f, estado }));

	// Desfecho final de uma tentativa: só nao_passou mantém a sequência da US2-AC10.
	function falhar(chave: string, mensagem: string, podeTentar: boolean) {
		ultimoFoiNaoPassou.current = false;
		const m = memoria.current.get(chave);
		if (m) m.podeTentar = podeTentar;
		mudarEstado(chave, { tipo: "nao_enviada", mensagem, podeTentar });
	}

	async function enviarTratado(chave: string, tentativa: number) {
		const m = memoria.current.get(chave);
		if (!m?.blob || !m.formato || !vale(chave, tentativa)) return;
		const blob = m.blob;

		let pedido: Awaited<ReturnType<typeof pedirEnvio>>;
		try {
			pedido = await pedirEnvio({ formato: m.formato, tamanho: blob.size });
		} catch {
			if (vale(chave, tentativa)) falhar(chave, mensagemFoto("falha_geral"), true);
			return;
		}
		if (!vale(chave, tentativa)) return;
		if (!pedido.ok) {
			if (pedido.motivo === "muitos_pendentes") {
				// Sem "Tentar de novo": nada desta foto precisa ficar na memória.
				revogarUrl(m.previa);
				m.previa = null;
				m.arquivo = undefined;
				m.area = undefined;
				m.blob = undefined;
				m.formato = undefined;
				atualizar(chave, (f) => ({ ...f, previa: null }));
				falhar(chave, mensagemFoto("muitos_pendentes"), false);
			} else {
				falhar(chave, pedido.mensagem, true);
			}
			return;
		}

		// Abortado por remover/sair da tela: `vale` deixa de valer e nada muda na tela.
		// Abortado pelo tempo-limite: a tentativa ainda vale e a foto fica "Não enviada".
		const controle = new AbortController();
		m.controle = controle;
		const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_ENVIO_MS);
		try {
			const resposta = await fetch(pedido.url, {
				method: "PUT",
				headers: pedido.headers,
				body: blob,
				signal: controle.signal,
			});
			if (!resposta.ok) throw new Error("envio recusado");
		} catch {
			if (vale(chave, tentativa)) falhar(chave, mensagemFoto("nao_enviada"), true);
			return;
		} finally {
			clearTimeout(limite);
			if (m.controle === controle) m.controle = undefined;
		}
		if (!vale(chave, tentativa)) return;

		let confirmacao: Awaited<ReturnType<typeof confirmarEnvio>>;
		try {
			confirmacao = await confirmarEnvio({ envioId: pedido.envioId });
		} catch {
			if (vale(chave, tentativa)) falhar(chave, mensagemFoto("falha_geral"), true);
			return;
		}
		if (!vale(chave, tentativa)) return;
		if (confirmacao.ok) {
			ultimoFoiNaoPassou.current = false;
			m.arquivo = undefined;
			m.area = undefined;
			m.envioId = pedido.envioId;
			m.podeTentar = false;
			mudarEstado(chave, { tipo: "enviada", envioId: pedido.envioId });
			return;
		}
		if (confirmacao.motivo === "nao_passou") {
			const repetida = ultimoFoiNaoPassou.current;
			falhar(chave, mensagemFoto("nao_passou", { repetida }), true);
			ultimoFoiNaoPassou.current = true;
			return;
		}
		falhar(chave, confirmacao.mensagem, true);
	}

	async function prepararEEnviar(chave: string, tentativa: number) {
		const m = memoria.current.get(chave);
		if (!m?.arquivo || !m.area || !vale(chave, tentativa)) return;
		let preparada: Awaited<ReturnType<typeof prepararFoto>>;
		try {
			preparada = await prepararFoto(m.arquivo, m.area);
		} catch {
			// prepararFoto não deveria rejeitar; se rejeitar, a foto fica com "Tentar de novo".
			preparada = { motivo: "nao_enviada" };
		}
		if (!vale(chave, tentativa)) return;
		if ("motivo" in preparada) {
			if (preparada.motivo === "nao_enviada") {
				falhar(chave, mensagemFoto("nao_enviada"), true);
				return;
			}
			// Recusa no aparelho: a foto sai da lista e o motivo vira aviso.
			ultimoFoiNaoPassou.current = false;
			revogarUrl(m.previa);
			memoria.current.delete(chave);
			setFotos((lista) => lista.filter((f) => f.chave !== chave));
			setAviso(mensagemFoto(preparada.motivo));
			return;
		}
		revogarUrl(m.previa);
		m.blob = preparada.blob;
		m.formato = preparada.formato;
		const previa = criarUrl(preparada.blob);
		m.previa = previa;
		atualizar(chave, (f) => ({ ...f, previa }));
		await enviarTratado(chave, tentativa);
	}

	function enviar(arquivo: File, area: AreaRecorte) {
		setAviso(null);
		contador.current += 1;
		const chave = `foto-${contador.current}`;
		// Sem miniatura até existir o blob tratado: nenhuma blob URL do arquivo original.
		memoria.current.set(chave, { arquivo, area, previa: null, tentativa: 1, podeTentar: false });
		setFotos((lista) => [...lista, { chave, previa: null, estado: { tipo: "enviando" } }]);
		void prepararEEnviar(chave, 1);
	}

	function tentarDeNovo(chave: string) {
		const m = memoria.current.get(chave);
		if (!m?.podeTentar) return;
		m.podeTentar = false;
		m.envioId = undefined;
		m.controle?.abort();
		m.controle = undefined;
		m.tentativa += 1;
		mudarEstado(chave, { tipo: "enviando" });
		// Falhou antes da confirmação: mesmo arquivo e mesma área. Expirada: só o blob tratado.
		if (m.arquivo && m.area) void prepararEEnviar(chave, m.tentativa);
		else void enviarTratado(chave, m.tentativa);
	}

	function remover(chave: string) {
		const m = memoria.current.get(chave);
		if (m) {
			m.controle?.abort();
			revogarUrl(m.previa);
		}
		memoria.current.delete(chave);
		setFotos((lista) => lista.filter((f) => f.chave !== chave));
	}

	function mover(de: number, para: number) {
		setFotos((lista) => {
			if (de < 0 || de >= lista.length || para < 0 || para >= lista.length || de === para) return lista;
			const nova = [...lista];
			const [foto] = nova.splice(de, 1);
			nova.splice(para, 0, foto);
			return nova;
		});
	}

	function marcarExpiradas(envioIds: string[]) {
		const mensagem = mensagemFoto("foto_expirada");
		for (const m of memoria.current.values()) {
			if (m.envioId && envioIds.includes(m.envioId)) {
				m.envioId = undefined;
				m.podeTentar = true;
			}
		}
		setFotos((lista) =>
			lista.map((f) =>
				f.estado.tipo === "enviada" && envioIds.includes(f.estado.envioId)
					? { ...f, estado: { tipo: "nao_enviada", mensagem, podeTentar: true } }
					: f,
			),
		);
		setAviso(mensagem);
	}

	// Aviso de expirada só vale enquanto restar foto expirada (some ao reenviar ou remover).
	const aviso = avisoGuardado === EXPIRADA && !fotos.some(ehExpirada) ? null : avisoGuardado;

	const envioIds = fotos.flatMap((f) => (f.estado.tipo === "enviada" ? [f.estado.envioId] : []));

	return {
		fotos,
		envioIds,
		emCurso: fotos.some((f) => f.estado.tipo === "enviando"),
		// Enviando ou não enviada: "Continuar" e "Salvar" esperam (D1).
		pendentes: fotos.some((f) => f.estado.tipo !== "enviada"),
		aviso,
		mostrarAviso: (motivo: MotivoFoto) => setAviso(mensagemFoto(motivo)),
		limparAviso: () => setAviso(null),
		enviar,
		tentarDeNovo,
		remover,
		mover,
		marcarExpiradas,
	};
}
