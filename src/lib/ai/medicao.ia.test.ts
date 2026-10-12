import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { Esforco } from "./config";
import { type LinhaMedicao, montarResultadoMd } from "./medicao-relatorio";
import { type ImagemSugestao, pedirSugestao } from "./sugestao";

// Feature 004, T130/T132 (SF13): medição manual do modelo (contracts/ia.md §5). Roda só por
// `npm run test:ia`, pelo humano, com a chave dev do `.dev.vars`; fora do check, do test:int e
// do CI. Entrada em `ia-medicao/` (ignorada pelo git): uma pasta por produto com 1 a 3 fotos já
// tratadas pelo pipeline do aparelho (a primeira em ordem alfabética é a capa) e
// `gabarito.json` = [{ "produto": "<pasta>", "categoria": "<nome do seed>" }].
// Imprime acertos de categoria (SC-003), p50/p90 da duração (SC-004) e o `usage` médio, com
// nome e descrição inteiros, e grava `ia-medicao/resultado.md` (uma linha por produto, modelo
// e esforço; a coluna "inventa?" é preenchida pelo humano na T132).

if (!process.env.OPENAI_API_KEY && existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");

const PASTA = "ia-medicao";
const MINIMO_PRODUTOS = 10;
const RODADAS = Number(process.env.IA_RODADAS ?? 1);

// Categorias do seed (migration 0000), na ordem do INSERT ⇒ ids 1..5 num banco recém-criado.
const CATEGORIAS = ["Bolsas", "Guarda-chuvas", "Tupperware", "Panos de prato", "Meias"].map(
  (nome, i) => ({ id: i + 1, nome }),
);

const CANDIDATOS: { modelo: string; esforco: Esforco }[] = [
  { modelo: "gpt-6-luna", esforco: "none" },
  { modelo: "gpt-6-luna", esforco: "low" },
  { modelo: "gpt-5.4-mini", esforco: "none" },
  { modelo: "gpt-5.4-mini", esforco: "low" },
];

// US$ por milhão de tokens: estimativa do research D7. Conferir na página de preços da OpenAI
// antes de registrar o custo no ADR-010.
const PRECOS: Record<string, { entrada: number; saida: number }> = {
  "gpt-6-luna": { entrada: 0.1, saida: 0.5 },
  "gpt-5.4-mini": { entrada: 0.75, saida: 4.5 },
};

const META_ACERTOS = 0.8;
const META_P90_MS = 15_000;

type Produto = { produto: string; categoria: string; imagens: ImagemSugestao[] };

const TIPOS: Record<string, ImagemSugestao["tipo"]> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function carregar(): Produto[] {
  if (!existsSync(path.join(PASTA, "gabarito.json")))
    throw new Error(`faltando ${PASTA}/gabarito.json (ver o roteiro da T132)`);
  const gabarito = JSON.parse(readFileSync(path.join(PASTA, "gabarito.json"), "utf8")) as {
    produto: string;
    categoria: string;
  }[];
  return gabarito.map(({ produto, categoria }) => {
    if (!CATEGORIAS.some((c) => c.nome === categoria))
      throw new Error(`${produto}: categoria "${categoria}" não está no seed`);
    const dir = path.join(PASTA, produto);
    const arquivos = readdirSync(dir)
      .filter((a) => TIPOS[path.extname(a).toLowerCase()])
      .sort();
    if (arquivos.length < 1 || arquivos.length > 3)
      throw new Error(`${produto}: precisa de 1 a 3 fotos .webp/.jpg (tem ${arquivos.length})`);
    const imagens = arquivos.map((a) => ({
      tipo: TIPOS[path.extname(a).toLowerCase()],
      base64: readFileSync(path.join(dir, a)).toString("base64"),
    }));
    return { produto, categoria, imagens };
  });
}

function percentil(valores: number[], p: number): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
}

type Uso = { input_tokens?: number; output_tokens?: number };

describe("medição da sugestão por IA (SC-003, SC-004)", () => {
  const produtos = carregar();
  const tabela: LinhaMedicao[] = [];

  // O resultado.md anterior vira resultado-<data>.md antes de gravar: rodar de novo não apaga a
  // coluna "inventa?" que o humano já preencheu.
  afterAll(() => {
    const arquivo = path.join(PASTA, "resultado.md");
    if (tabela.length === 0) {
      console.log(`\nnada gravado: nenhum pedido feito (${arquivo} não mudou)`);
      return;
    }
    const data = new Date().toISOString();
    if (existsSync(arquivo)) {
      const anterior = path.join(PASTA, `resultado-${data.replace(/[:.]/g, "-")}.md`);
      renameSync(arquivo, anterior);
      console.log(`\nresultado anterior guardado em ${anterior}`);
    }
    writeFileSync(arquivo, montarResultadoMd(tabela, { data, rodadas: RODADAS }));
    console.log(`tabela gravada em ${arquivo} (${tabela.length} linhas)`);
  });

  it("OPENAI_API_KEY (dev) está no .dev.vars", () => {
    expect(process.env.OPENAI_API_KEY ?? "").not.toBe("");
  });

  it(`ia-medicao/ tem ao menos ${MINIMO_PRODUTOS} produtos`, () => {
    expect(produtos.length).toBeGreaterThanOrEqual(MINIMO_PRODUTOS);
  });

  for (const { modelo, esforco } of CANDIDATOS) {
    it(`${modelo} / ${esforco}`, { timeout: 30 * 60_000 }, async () => {
      const duracoes: number[] = [];
      const usos: Uso[] = [];
      let acertos = 0;
      let foraDaLista = 0;
      const falhas: Record<string, number> = {};
      const linhas: string[] = [];

      for (let rodada = 0; rodada < RODADAS; rodada++) {
        for (const p of produtos) {
          const r = await pedirSugestao({ imagens: p.imagens, categorias: CATEGORIAS, modelo, esforco });
          duracoes.push(r.duracaoMs);
          if (r.usage) usos.push(r.usage as Uso);
          const base = {
            produto: p.produto,
            modelo,
            esforco,
            rodada: rodada + 1,
            esperada: p.categoria,
          };
          if (!r.ok) {
            tabela.push({ ...base, resultado: { ok: false, falha: r.falha } });
            falhas[r.falha] = (falhas[r.falha] ?? 0) + 1;
            linhas.push(`  ${p.produto}: FALHA ${r.falha} · ${r.duracaoMs} ms`);
            continue;
          }
          const id = r.sugestao.categoriaId;
          const escolhida = CATEGORIAS.find((c) => c.id === id)?.nome ?? null;
          if (id !== null && !escolhida) foraDaLista++;
          if (escolhida === p.categoria) acertos++;
          // Fora da lista conta como sugerida "vazia" na tabela, como na tela (US3-AC4).
          tabela.push({
            ...base,
            resultado: {
              ok: true,
              sugerida: escolhida,
              nome: r.sugestao.nome,
              descricao: r.sugestao.descricao,
            },
          });
          linhas.push(
            `  ${p.produto}: ${escolhida === p.categoria ? "certa" : "ERRADA"} ` +
              `(${escolhida ?? "vazia"}; gabarito ${p.categoria}) · ${r.duracaoMs} ms\n` +
              `    nome=${JSON.stringify(r.sugestao.nome)}\n` +
              `    descricao=${JSON.stringify(r.sugestao.descricao)}`,
          );
        }
      }

      const total = produtos.length * RODADAS;
      const p50 = percentil(duracoes, 50);
      const p90 = percentil(duracoes, 90);
      const media = (k: keyof Uso) =>
        usos.length ? usos.reduce((s, u) => s + (u[k] ?? 0), 0) / usos.length : 0;
      const entrada = media("input_tokens");
      const saida = media("output_tokens");
      const preco = PRECOS[modelo];
      const custo = preco ? (entrada * preco.entrada + saida * preco.saida) / 1e6 : NaN;
      const passa =
        acertos / total >= META_ACERTOS && foraDaLista === 0 && p90 <= META_P90_MS;

      console.log(
        [
          `\n== ${modelo} / ${esforco} (${total} pedidos) ==`,
          ...linhas,
          `  SC-003 categoria certa: ${acertos}/${total}; fora da lista: ${foraDaLista}`,
          `  SC-004 duração: p50 ${p50} ms · p90 ${p90} ms`,
          `  falhas: ${JSON.stringify(falhas)}`,
          `  usage médio: entrada ${entrada.toFixed(0)} · saída ${saida.toFixed(0)} tokens`,
          `  custo estimado por cadastro: US$ ${custo.toFixed(5)} (preços do research D7)`,
          `  resultado: ${passa ? "PASSA" : "NÃO PASSA"} SC-003 e SC-004`,
        ].join("\n"),
      );
    });
  }
});
