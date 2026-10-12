"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CONTINUAR_COM_NAO_ENVIADA } from "@/lib/fotos/mensagens";

import { EscolherFoto } from "../_fotos/escolher-foto";
import { ListaFotos } from "../_fotos/lista-fotos";
import { RecorteFoto } from "../_fotos/recorte-foto";
import { conferirArquivo, useEnvioFotos } from "../_fotos/usar-envio";
import { FormProduto } from "../form-produto";
import { AvisoSugestao, type EstadoSugestao, useSugestao } from "./sugestao";

type Props = { categorias: readonly { id: number; nome: string }[] };

const OCIOSO: EstadoSugestao = { tipo: "ocioso" };

// Cadastro em dois passos (Fotos → Dados). Os dois ficam montados e o inativo fica `hidden`:
// "Voltar às fotos" não perde o que foi digitado. Nada vai para storage (recarregar = vazio).
// Com o recorte aberto, o passo Fotos mostra só o título, o aviso e o recorte (uma tarefa).
export function CadastroProduto({ categorias }: Props) {
	const [passo, setPassoAtual] = useState<"fotos" | "dados">("fotos");
	const [emRecorte, setEmRecorte] = useState<File | null>(null);
	const escolha = useRef(0);
	const tituloFotos = useRef<HTMLHeadingElement>(null);
	const tituloDados = useRef<HTMLHeadingElement>(null);
	const focarTitulo = useRef(false);
	const idNaoEnviada = useId();
	// Sugestão da IA: pedida uma vez, ao tocar em "Continuar" (trocar as fotos depois não pede outra).
	const sugestao = useSugestao();
	const { fotos, envioIds, pendentes, aviso, mostrarAviso, limparAviso, enviar, tentarDeNovo, remover, mover, marcarExpiradas } =
		useEnvioFotos();

	// Troca de passo pela pessoa (ou por foto expirada) e fechamento do recorte: o foco vai ao
	// título do passo atual, para o leitor de tela anunciar onde ela está. Na primeira
	// montagem, nada é focado.
	function setPasso(novo: "fotos" | "dados") {
		focarTitulo.current = true;
		setPassoAtual(novo);
	}
	function fecharRecorte() {
		focarTitulo.current = true;
		setEmRecorte(null);
	}
	useEffect(() => {
		if (!focarTitulo.current) return;
		focarTitulo.current = false;
		(passo === "fotos" ? tituloFotos : tituloDados).current?.focus();
	}, [passo, emRecorte]);

	// Foto não enviada trava o "Continuar": o texto abaixo dele diz o que fazer.
	const temNaoEnviada = fotos.some((f) => f.estado.tipo === "nao_enviada");

	async function aoEscolher(arquivo: File) {
		limparAviso();
		const atual = ++escolha.current;
		const motivo = await conferirArquivo(arquivo);
		if (atual !== escolha.current) return; // outra escolha veio depois
		if (motivo) mostrarAviso(motivo);
		else setEmRecorte(arquivo);
	}

	function aoFotoExpirada(ids: string[]) {
		marcarExpiradas(ids);
		setPasso("fotos");
	}

	return (
		<>
			<section hidden={passo !== "fotos"} className="flex flex-col gap-6">
				<h2 ref={tituloFotos} tabIndex={-1} className="text-xl font-bold focus:outline-none">
					Fotos
				</h2>
				{aviso ? <Aviso tipo="erro">{aviso}</Aviso> : null}
				{emRecorte ? (
					<RecorteFoto
						arquivo={emRecorte}
						onUsar={(area) => {
							enviar(emRecorte, area);
							fecharRecorte();
						}}
						onCancelar={fecharRecorte}
					/>
				) : (
					<>
						<ListaFotos fotos={fotos} onRemover={remover} onMover={mover} onTentarDeNovo={tentarDeNovo} />
						<EscolherFoto quantidade={fotos.length} onEscolher={aoEscolher} />
						<Button
							type="button"
							variant="primary"
							disabled={envioIds.length === 0 || pendentes}
							aria-describedby={temNaoEnviada ? idNaoEnviada : undefined}
							onClick={() => {
								setPasso("dados");
								sugestao.pedirPrimeira(envioIds);
							}}
						>
							Continuar
						</Button>
						{temNaoEnviada ? (
							<p id={idNaoEnviada} className="text-base text-red-800">
								{CONTINUAR_COM_NAO_ENVIADA}
							</p>
						) : null}
					</>
				)}
			</section>
			{/* A região viva do aviso fica fora do `hidden`: montada desde o início, o texto que entra
			    ao abrir o passo Dados é anunciado como mudança (dentro da seção não seria). */}
			<div className="flex flex-col gap-6">
				<div hidden={passo !== "dados"}>
					<h2 ref={tituloDados} tabIndex={-1} className="text-xl font-bold focus:outline-none">
						Dados do produto
					</h2>
				</div>
				<AvisoSugestao
					estado={passo === "dados" ? sugestao.estado : OCIOSO}
					onTentarDeNovo={() => {
						// O botão some ao pedir de novo: o foco vai ao título, não ao body.
						tituloDados.current?.focus();
						sugestao.tentarDeNovo(envioIds);
					}}
				/>
			</div>
			<section hidden={passo !== "dados"} className="flex flex-col gap-6">
				<Button type="button" variant="secondary" onClick={() => setPasso("fotos")}>
					Voltar às fotos
				</Button>
				<FormProduto
					modo="cadastro"
					categorias={categorias}
					envioIds={envioIds}
					envioEmCurso={pendentes}
					onFotoExpirada={aoFotoExpirada}
					sugestao={sugestao.estado.tipo === "pronta" ? sugestao.estado.sugestao : null}
				/>
			</section>
		</>
	);
}
