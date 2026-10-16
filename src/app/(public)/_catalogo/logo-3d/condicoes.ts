// Quando o logo 3D pode carregar (ADR-005, Fase 7). Sem dependências, para testar sem navegador.
// Qualquer motivo abaixo deixa o logo em SVG, que é o mesmo símbolo, parado.

export type Ambiente = {
	movimentoReduzido: boolean;
	economiaDeDados: boolean;
	/** navigator.hardwareConcurrency; ausente = desconhecido (tratado como fraco). */
	nucleos: number | undefined;
	/** navigator.deviceMemory em GB, quando o navegador informa. */
	memoria: number | undefined;
	temWebGL: () => boolean;
};

export type MotivoSemTresD = "movimento-reduzido" | "economia-de-dados" | "processador-fraco" | "pouca-memoria" | "sem-webgl";

const NUCLEOS_MINIMOS = 5; // 4 ou menos: fica o SVG
const MEMORIA_MINIMA_GB = 3; // 2 GB ou menos (quando informado): fica o SVG

// A ordem importa só para o motivo devolvido; o teste de WebGL fica por último porque cria um contexto.
export function motivoSemTresD(a: Ambiente): MotivoSemTresD | null {
	if (a.movimentoReduzido) return "movimento-reduzido";
	if (a.economiaDeDados) return "economia-de-dados";
	if (a.nucleos === undefined || a.nucleos < NUCLEOS_MINIMOS) return "processador-fraco";
	if (a.memoria !== undefined && a.memoria < MEMORIA_MINIMA_GB) return "pouca-memoria";
	if (!a.temWebGL()) return "sem-webgl";
	return null;
}

type NavegadorComExtras = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };

// Cria um contexto WebGL de teste e o libera em seguida (o navegador limita quantos podem existir).
function webglDisponivel(): boolean {
	try {
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
		if (!gl) return false;
		gl.getExtension("WEBGL_lose_context")?.loseContext();
		return true;
	} catch {
		return false;
	}
}

export function lerAmbiente(): Ambiente {
	const nav = navigator as NavegadorComExtras;
	return {
		movimentoReduzido: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		economiaDeDados: nav.connection?.saveData === true,
		nucleos: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
		memoria: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
		temWebGL: webglDisponivel,
	};
}
