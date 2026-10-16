// A "rosa de arcos" em 3D (ADR-005, Fase 7). Este módulo só entra por import() dinâmico, depois
// que a página e os produtos apareceram: o three fica fora do JS inicial da rota. Importa só o que
// usa do pacote principal (nada de examples nem loaders); a geometria é feita aqui, sem arquivo.
import {
	Curve,
	CylinderGeometry,
	DirectionalLight,
	Group,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	Scene,
	TubeGeometry,
	Vector3,
	WebGLRenderer,
} from "three";

// Um arco do logo: perna esquerda subindo, meia-volta por cima, perna direita descendo. As medidas
// vêm do SVG (viewBox 64, base em y = 57), em décimos: o arco de fora tem raio 2,3 e pernas de 2,6.
class Arco extends Curve<Vector3> {
	constructor(
		private readonly raio: number,
		private readonly perna: number,
		private readonly x: number,
		private readonly z: number,
	) {
		super();
	}

	override getPoint(t: number, alvo = new Vector3()): Vector3 {
		const meiaVolta = Math.PI * this.raio;
		const total = 2 * this.perna + meiaVolta;
		const s = t * total;
		if (s <= this.perna) return alvo.set(this.x - this.raio, s, this.z);
		if (s >= this.perna + meiaVolta) return alvo.set(this.x + this.raio, this.perna - (s - this.perna - meiaVolta), this.z);
		const angulo = Math.PI - ((s - this.perna) / meiaVolta) * Math.PI;
		return alvo.set(this.x + this.raio * Math.cos(angulo), this.perna + this.raio * Math.sin(angulo), this.z);
	}
}

const ESPESSURA = 0.17; // raio do tubo: o traço de 3,5 do SVG
// Os arcos em profundidades diferentes viram pétalas sobrepostas quando o logo gira.
const ARCOS = [
	{ raio: 2.3, perna: 2.6, x: 0, z: -0.3 },
	{ raio: 1.4, perna: 2.0, x: 0.1, z: 0 },
	{ raio: 0.75, perna: 1.3, x: 0.05, z: 0.3 },
] as const;

export type ControleCena = {
	/** Liga a animação (nada acontece se já estiver ligada). */
	iniciar: () => void;
	/** Pausa sem desmontar: fora da tela ou com a aba em segundo plano. */
	parar: () => void;
	/** Libera renderer, geometrias e materiais. */
	destruir: () => void;
};

// Cerâmica fosca na cor de ação, luz fria do céu por cima e luz quente da manhã pela direita.
export function montarCena(canvas: HTMLCanvasElement, tamanhoCss: number, aoPrimeiroQuadro: () => void): ControleCena {
	const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.setSize(tamanhoCss, tamanhoCss, false);

	const cena = new Scene();
	const camera = new PerspectiveCamera(30, 1, 0.1, 50);
	// Distância que faz o logo ocupar a mesma fração do quadro que o SVG (49 de 64 na altura): na
	// troca do SVG pelo 3D, nada muda de tamanho.
	camera.position.set(0, 0, 12.8);

	const material = new MeshStandardMaterial({ color: "#a8325a", roughness: 0.5, metalness: 0.05 });
	const geometrias = ARCOS.map((a) => new TubeGeometry(new Arco(a.raio, a.perna, a.x, a.z), 96, ESPESSURA, 12, false));
	const parapeito = new CylinderGeometry(ESPESSURA, ESPESSURA, 5.6, 12);

	const logo = new Group();
	for (const g of geometrias) logo.add(new Mesh(g, material));
	const base = new Mesh(parapeito, material);
	base.rotation.z = Math.PI / 2;
	logo.add(base);
	logo.position.y = -2.45; // centraliza a altura (perna 2,6 + raio 2,3)
	const giro = new Group();
	giro.add(logo);
	cena.add(giro);

	cena.add(new HemisphereLight("#dce8f2", "#f8ddb6", 1.6));
	const sol = new DirectionalLight("#fff1dc", 2.4);
	sol.position.set(4, 5, 6);
	cena.add(sol);

	let quadro = 0;
	let ultimo = 0;
	let primeiro = true;
	const inicio = performance.now();

	// Balanço lento (±34°) em vez de volta inteira: de perfil, os arcos virariam três riscos.
	// Desenha a no máximo 30 quadros por segundo, para poupar bateria.
	function desenhar(agora: number) {
		quadro = requestAnimationFrame(desenhar);
		if (agora - ultimo < 33) return;
		ultimo = agora;
		giro.rotation.y = Math.sin((agora - inicio) / 2600) * 0.6;
		renderer.render(cena, camera);
		if (primeiro) {
			primeiro = false;
			aoPrimeiroQuadro();
		}
	}

	return {
		iniciar() {
			if (quadro === 0) quadro = requestAnimationFrame(desenhar);
		},
		parar() {
			cancelAnimationFrame(quadro);
			quadro = 0;
		},
		destruir() {
			cancelAnimationFrame(quadro);
			quadro = 0;
			for (const g of geometrias) g.dispose();
			parapeito.dispose();
			material.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
		},
	};
}
