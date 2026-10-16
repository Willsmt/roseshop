// Fase 7 (ADR-005): confere no build que o three NÃO está no JavaScript inicial da página inicial e
// mede o chunk que o traz. Lê o HTML servido pelo preview e os arquivos de .open-next/assets.
// Rodar com o preview no ar: node design/validacao/three-fora-do-inicial.mjs http://localhost:8787/
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const url = process.argv[2] ?? "http://localhost:8787/";
const ASSETS = ".open-next/assets";
// Textos de aviso do three que sobrevivem à minificação.
const MARCA_THREE = /THREE\.WebGLRenderer|THREE\.WebGLProgram/;

const kb = (n) => (n / 1024).toFixed(1);
const html = await (await fetch(url)).text();
const iniciais = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"'\s)]+\.js/g)].map((m) => m[0]))];

let totalInicial = 0;
let totalInicialGz = 0;
const comThreeNoInicial = [];
for (const caminho of iniciais) {
	const conteudo = readFileSync(join(ASSETS, caminho));
	totalInicial += conteudo.length;
	totalInicialGz += gzipSync(conteudo).length;
	if (MARCA_THREE.test(conteudo.toString("utf8"))) comThreeNoInicial.push(caminho);
}

const pasta = join(ASSETS, "_next/static/chunks");
const comThree = readdirSync(pasta)
	.filter((f) => f.endsWith(".js"))
	.map((f) => ({ f, conteudo: readFileSync(join(pasta, f)) }))
	.filter(({ conteudo }) => MARCA_THREE.test(conteudo.toString("utf8")));

console.log(`JS inicial da página (${iniciais.length} arquivos citados no HTML): ${kb(totalInicial)} KB, ${kb(totalInicialGz)} KB gzip`);
console.log(`three no JS inicial: ${comThreeNoInicial.length === 0 ? "NÃO" : "SIM -> " + comThreeNoInicial.join(", ")}`);
for (const { f, conteudo } of comThree) {
	console.log(`chunk com three (carregado só por import()): ${f}  ${kb(conteudo.length)} KB, ${kb(gzipSync(conteudo).length)} KB gzip`);
}
process.exitCode = comThreeNoInicial.length === 0 && comThree.length > 0 ? 0 : 1;
