"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef } from "react";
import { useState } from "react";

import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CaixaMarcacao } from "@/components/ui/caixa-marcacao";
import { CampoTexto, classesControle } from "@/components/ui/campo-texto";
import { MensagemCampo } from "@/components/ui/mensagem-campo";
import { Selecao } from "@/components/ui/selecao";
import { criarProduto, editarProduto } from "@/lib/produtos/actions";
import type { ResultadoAction } from "@/lib/produtos/actions";
import type { ValoresFormulario } from "@/lib/produtos/erros";

import { comFalhaGeral } from "./com-falha-geral";

const LISTA = "/painel/produtos";
const MAX_DIGITOS = 7; // 99.999,99

type Props = {
	categorias: readonly { id: number; nome: string }[];
} & (
	| {
			modo: "cadastro";
			envioIds: readonly string[];
			envioEmCurso: boolean;
			onFotoExpirada?: (envioIds: string[]) => void;
		}
	| { modo: "edicao"; id: number; versao: number; inicial: ValoresFormulario }
);

const VAZIO: ValoresFormulario = { nome: "", categoriaId: "", descricao: "", preco: "", aPartirDe: false };

// Máscara que preenche da direita: só dígitos, "1290" ⇒ "12,90"; vazio = sem preço.
function mascararPreco(texto: string): string {
	const d = texto.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITOS);
	if (d === "") return "";
	const p = d.padStart(3, "0");
	return `${p.slice(0, -2)},${p.slice(-2)}`;
}

function CampoPreco({ inicial, erro }: { inicial: string; erro?: string }) {
	const id = useId();
	const idErro = `${id}-erro`;
	const [valor, setValor] = useState(() => mascararPreco(inicial));
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={id} className="text-base font-semibold">
				Preço
			</label>
			<input
				id={id}
				type="text"
				inputMode="numeric"
				value={valor}
				onChange={(e) => setValor(mascararPreco(e.target.value))}
				aria-invalid={erro ? "true" : undefined}
				aria-describedby={erro ? idErro : undefined}
				className={classesControle}
			/>
			<input type="hidden" name="preco" value={valor} />
			{erro ? <MensagemCampo id={idErro}>{erro}</MensagemCampo> : null}
		</div>
	);
}

// "Já existe um produto com esse nome: #0042." ⇒ o código vira link para o detalhe.
function mensagemDoNome(mensagem: string, codigoExistente?: number): React.ReactNode {
	const partes = codigoExistente === undefined ? null : /^(.*?)(#\d+)(.*)$/.exec(mensagem);
	if (!partes) return mensagem;
	return (
		<>
			{partes[1]}
			<Link href={`${LISTA}/${codigoExistente}`} className="underline">
				{partes[2]}
			</Link>
			{partes[3]}
		</>
	);
}

type Resultado = ResultadoAction<{ id: number; versao?: number }> | null;

export function FormProduto(props: Props) {
	const { categorias } = props;
	const router = useRouter();
	const edicao = props.modo === "edicao";
	const acaoComFalhaGeral = comFalhaGeral(
		(edicao ? editarProduto : criarProduto) as (a: Resultado, f: FormData) => Promise<NonNullable<Resultado>>,
		true,
	) as (a: Resultado, f: FormData) => Promise<NonNullable<Resultado>>;
	const [estado, acao, enviando] = useActionState<Resultado, FormData>(acaoComFalhaGeral, null);

	useEffect(() => {
		if (estado?.ok) router.push(`${LISTA}/${edicao ? props.id : estado.id}`);
	}, [estado, edicao, props, router]);

	// foto_expirada: avisa a tela uma vez por resultado (as fotos voltam a ser enviadas lá).
	const onFotoExpirada = props.modo === "cadastro" ? props.onFotoExpirada : undefined;
	const tratado = useRef<Resultado>(null);
	useEffect(() => {
		if (!estado || estado.ok || estado.motivo !== "foto_expirada" || tratado.current === estado) return;
		tratado.current = estado;
		onFotoExpirada?.(estado.envioIds ?? []);
	}, [estado, onFotoExpirada]);

	const falha = estado && !estado.ok ? estado : null;
	// foto_expirada: a mensagem some quando alguma das fotos expiradas já não está entre as
	// fotos atuais (reenviada ou removida no passo Fotos).
	const expiradaVencida =
		props.modo === "cadastro" &&
		falha?.motivo === "foto_expirada" &&
		(falha.envioIds ?? []).some((id) => !props.envioIds.includes(id));
	const v = falha?.valores ?? (props.modo === "edicao" ? props.inicial : VAZIO);
	const erroDe = (campo: string) => (falha && falha.campo === campo ? falha.mensagem : undefined);
	// Remonta os campos a cada falha nova: o reset do formulário volta aos valores enviados.
	const chave = falha ? `falha:${JSON.stringify(falha.valores)}:${falha.motivo}` : "inicial";

	return (
		<form action={acao} className="flex flex-col gap-4">
			{props.modo === "edicao" ? (
				<>
					<input type="hidden" name="id" value={props.id} />
					<input type="hidden" name="versao" value={props.versao} />
				</>
			) : (
				props.envioIds.map((id) => <input key={id} type="hidden" name="fotos" value={id} />)
			)}
			<div key={chave} className="flex flex-col gap-4">
				<CampoTexto
					name="nome"
					rotulo="Nome do produto"
					defaultValue={v.nome}
					maxLength={80}
					erro={falha?.campo === "nome" ? mensagemDoNome(falha.mensagem, falha.codigoExistente) : undefined}
				/>
				<Selecao
					name="categoriaId"
					rotulo="Categoria"
					opcoes={categorias.map((c) => ({ valor: String(c.id), rotulo: c.nome }))}
					defaultValue={v.categoriaId}
					vazio="Escolha uma categoria"
					erro={erroDe("categoria")}
				/>
				<AreaTexto name="descricao" rotulo="Descrição" defaultValue={v.descricao} linhas={4} erro={erroDe("descricao")} />
				<CampoPreco inicial={v.preco} erro={erroDe("preco")} />
				<CaixaMarcacao name="aPartirDe" rotulo={'Usar "a partir de" no preço'} defaultChecked={v.aPartirDe} erro={erroDe("aPartirDe")} />
			</div>
			{falha && !falha.campo && !expiradaVencida ? <Aviso tipo="erro">{falha.mensagem}</Aviso> : null}
			<div className="flex flex-col gap-3 sm:flex-row">
				<Button type="submit" variant="primary" disabled={enviando || (props.modo === "cadastro" && props.envioEmCurso)}>
					Salvar
				</Button>
				<Button
					type="button"
					variant="secondary"
					onClick={() => router.push(props.modo === "edicao" ? `${LISTA}/${props.id}` : LISTA)}
				>
					Cancelar
				</Button>
			</div>
		</form>
	);
}
