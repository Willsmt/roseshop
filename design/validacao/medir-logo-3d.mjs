// Fase 7 (ADR-005): mede o logo 3D num Chrome à parte, com WebGL por software (SwiftShader), em
// 360px, CPU 4x mais lenta. Compara "SVG" (movimento reduzido: o 3D nem carrega) com "3D".
// Mede: LCP e CLS, tempo de tarefa (CPU do processo da página) por segundo, com o logo visível e
// fora da tela (deve pausar), e salva capturas. O SwiftShader desenha na CPU: o custo medido é
// pessimista em relação a um celular com GPU.
// Rodar com o preview no ar: node design/validacao/medir-logo-3d.mjs <pasta-de-saida> [url]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const saida = process.argv[2];
const url = process.argv[3] ?? "http://localhost:8787/";
if (!saida) throw new Error("informe a pasta de saída");
mkdirSync(saida, { recursive: true });

const PORTA = 9333;
const chrome = spawn(
	"google-chrome",
	[
		"--headless=new",
		`--remote-debugging-port=${PORTA}`,
		"--use-angle=swiftshader",
		"--enable-unsafe-swiftshader",
		`--user-data-dir=${join(saida, "perfil-chrome")}`,
		"--no-first-run",
		"--window-size=360,780",
		"about:blank",
	],
	{ stdio: "ignore" },
);

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function alvo() {
	for (let i = 0; i < 50; i++) {
		try {
			const lista = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json();
			const pagina = lista.find((t) => t.type === "page");
			if (pagina) return pagina.webSocketDebuggerUrl;
		} catch {}
		await espera(200);
	}
	throw new Error("Chrome não respondeu");
}

const ws = new WebSocket(await alvo());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pendentes = new Map();
ws.addEventListener("message", (m) => {
	const msg = JSON.parse(m.data);
	if (msg.id && pendentes.has(msg.id)) {
		pendentes.get(msg.id)(msg);
		pendentes.delete(msg.id);
	}
});
const cdp = (method, params = {}) =>
	new Promise((r) => {
		const n = ++id;
		pendentes.set(n, r);
		ws.send(JSON.stringify({ id: n, method, params }));
	});
const avaliar = async (expressao) =>
	(await cdp("Runtime.evaluate", { expression: expressao, awaitPromise: true, returnByValue: true })).result?.result?.value;

const tempoDeTarefa = async () => {
	const { result } = await cdp("Performance.getMetrics");
	return result.metrics.find((m) => m.name === "TaskDuration").value; // segundos
};
async function cpuPorSegundo(segundos) {
	const a = await tempoDeTarefa();
	await espera(segundos * 1000);
	const b = await tempoDeTarefa();
	return Math.round(((b - a) / segundos) * 1000); // ms de CPU por segundo de relógio
}

const VITAIS = `new Promise((ok) => {
	const r = { lcp: null, cls: 0 };
	new PerformanceObserver((l) => { const e = l.getEntries(); r.lcp = Math.round(e[e.length - 1].startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
	new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) r.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
	setTimeout(() => ok(r), 400);
})`;
const ESTADO = `(() => {
	const caixa = document.querySelector('[data-logo="janela"]');
	const c = caixa?.querySelector("canvas");
	const r = caixa?.getBoundingClientRect();
	const gl = document.createElement("canvas").getContext("webgl2") ? "webgl2" : document.createElement("canvas").getContext("webgl") ? "webgl" : "nenhum";
	return { canvas: !!c, visivel3D: c?.style.opacity === "1", caixa: r && [r.width, r.height, Math.round(r.top)], webgl: gl, nucleos: navigator.hardwareConcurrency };
})()`;

await cdp("Page.enable");
await cdp("Performance.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
await cdp("Emulation.setCPUThrottlingRate", { rate: 4 });

const resultado = {};
for (const modo of ["svg", "3d"]) {
	await cdp("Emulation.setEmulatedMedia", {
		features: [{ name: "prefers-reduced-motion", value: modo === "svg" ? "reduce" : "no-preference" }],
	});
	await cdp("Network.enable");
	await cdp("Network.setCacheDisabled", { cacheDisabled: true });
	await cdp("Page.navigate", { url });
	await espera(9000); // carga, ocioso, import() do three e primeiro quadro (com CPU 4x mais lenta)
	const estado = await avaliar(ESTADO);
	const vitais = await avaliar(VITAIS);
	const visivel = await cpuPorSegundo(8);
	const foto = await cdp("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 360, height: 420, scale: 1 } });
	writeFileSync(join(saida, `logo-${modo}-360.png`), Buffer.from(foto.result.data, "base64"));
	// O logo de perto (4x), para julgar o material.
	const caixa = await avaliar(`(() => { const r = document.querySelector('[data-logo="janela"]').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
	const perto = await cdp("Page.captureScreenshot", {
		format: "png",
		clip: { x: caixa[0] - 8, y: caixa[1] - 8, width: caixa[2] + 16, height: caixa[3] + 16, scale: 4 },
	});
	writeFileSync(join(saida, `logo-${modo}-perto.png`), Buffer.from(perto.result.data, "base64"));
	await avaliar("window.scrollTo(0, 3000)");
	await espera(1000);
	const foraDaTela = await cpuPorSegundo(8);
	resultado[modo] = { estado, vitais, cpuMsPorSegundo: { logoVisivel: visivel, logoForaDaTela: foraDaTela } };
}

console.log(JSON.stringify(resultado, null, 2));
ws.close();
chrome.kill();
