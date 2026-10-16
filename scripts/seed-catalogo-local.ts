// Seed do catálogo (T080a, T085a). Dois modos, ambos com trava por igualdade exata (trava.ts):
//  - local: `npm run seed:local`. Popula o Postgres do Docker e o bucket local do wrangler
//    (precisa de `db:up`, `db:migrate` e de `npm run preview` no ar). Autor: seed@local.
//  - dev (`--dev`): `npm run seed:dev` e `npm run seed:dev:limpar`. Popula o branch dev do Neon e o
//    bucket roseshop-dev, lendo SÓ o .seed-dev.vars. Autor: seed@dev. Recusa produção.
// `--limpar` remove só o que tem o autor do modo (banco e R2) e sai. Idempotente: refaz só o que ele
// mesmo criou.
// Roda com o Node nativo (type stripping): imports relativos com extensão, sem alias `@/`.
import { randomUUID } from "node:crypto";

import { AwsClient } from "aws4fetch";
import pg from "pg";

import { CATEGORIAS, planejarProdutos } from "./seed-catalogo-local/dados.ts";
import { gerarJpegGradiente } from "./seed-catalogo-local/jpeg.ts";
import { validarAmbiente } from "./seed-catalogo-local/trava.ts";

// Mesmo formato de chave da 004: fotos/<uuid v4>.jpg. Estes dois são fixos para a rodada seguinte
// sobrescrever o objeto em vez de deixar sobra: um envio pendente (com linha) e um órfão (sem).
const ID_ENVIO_PENDENTE = "5eed0000-0000-4000-8000-000000000001";
const ID_ORFAO = "5eed0000-0000-4000-8000-000000000002";

const modo = process.argv.includes("--dev") ? "dev" : "local";
const limpar = process.argv.includes("--limpar");
const config = validarAmbiente(modo, process.env);
const AUTOR_SEED = config.autor;
const nomeR2 = modo === "dev" ? "R2 dev" : "R2 local";
const r2 = new AwsClient({
  accessKeyId: config.r2.accessKeyId,
  secretAccessKey: config.r2.secretAccessKey,
  service: "s3",
  region: "auto",
});
const urlObjeto = (chave: string) => `${config.r2.endpoint}/${chave}`;

async function enviarObjeto(chave: string, corpo: Uint8Array) {
  let resposta: Response;
  try {
    resposta = await r2.fetch(urlObjeto(chave), {
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      body: corpo as BodyInit,
    });
  } catch {
    throw new Error(
      modo === "dev"
        ? "R2 dev inacessível: confira o token em .seed-dev.vars."
        : "R2 local fora do ar: suba `npm run preview` (porta 8787) e rode de novo.",
    );
  }
  if (!resposta.ok) throw new Error(`PUT ${chave} falhou: HTTP ${resposta.status}`);
}

// Melhor esforço: sobra no bucket não quebra nada; devolve se apagou (404 conta, já não existe).
async function apagarObjeto(chave: string): Promise<boolean> {
  try {
    const resposta = await r2.fetch(urlObjeto(chave), { method: "DELETE" });
    return resposta.ok || resposta.status === 404;
  } catch {
    return false;
  }
}

async function limparSeed() {
  const cliente = new pg.Client({ connectionString: config.databaseUrl });
  await cliente.connect();
  let chaves: string[] = [];
  let produtosApagados = 0;
  try {
    await cliente.query("BEGIN");
    chaves = (
      await cliente.query(
        `SELECT f.chave_objeto AS chave FROM produto_fotos f
           JOIN produtos p ON p.id = f.produto_id WHERE p.criado_por = $1`,
        [AUTOR_SEED],
      )
    ).rows.map((r) => r.chave as string);
    produtosApagados = (await cliente.query("DELETE FROM produtos WHERE criado_por = $1", [AUTOR_SEED])).rowCount ?? 0;
    await cliente.query("DELETE FROM fotos_envio WHERE enviado_por = $1", [AUTOR_SEED]);
    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    await cliente.end();
  }
  let falhas = 0;
  for (const chave of chaves) if (!(await apagarObjeto(chave))) falhas++;
  console.log(
    `Limpeza (${modo}): ${produtosApagados} produtos de ${AUTOR_SEED}, ${chaves.length - falhas}/${chaves.length} objetos do ${nomeR2}.` +
      (falhas ? ` ${falhas} objeto(s) não apagados: o cron de limpeza os recolhe como órfãos.` : "") +
      "\nCategorias criadas pelo seed ficam (não têm autor).",
  );
}

if (limpar) {
  await limparSeed();
  process.exit(0);
}

const produtos = planejarProdutos();

// 1. Objetos primeiro: se o R2 local estiver fora, nada no banco foi tocado.
const planoFotos = produtos.map((p) =>
  Array.from({ length: p.fotos }, (_, n) => ({
    chave: `fotos/${randomUUID()}.jpg`,
    bytes: gerarJpegGradiente(n % 2 === 0 ? p.cores[0] : p.cores[1], n % 2 === 0 ? p.cores[1] : p.cores[0]),
  })),
);
const bytesEnvio = gerarJpegGradiente([200, 200, 200], [80, 80, 80]);
const chaveEnvio = `fotos/${ID_ENVIO_PENDENTE}.jpg`;
const chaveOrfao = `fotos/${ID_ORFAO}.jpg`;

process.stdout.write(`Enviando fotos ao ${nomeR2}... `);
for (const foto of planoFotos.flat()) await enviarObjeto(foto.chave, foto.bytes);
// Envio pendente e órfão são do item 12 do preview; no dev o cron os recolheria sem ganho.
if (modo === "local") {
  await enviarObjeto(chaveEnvio, bytesEnvio);
  await enviarObjeto(chaveOrfao, bytesEnvio);
}
console.log("ok");

// 2. Banco, numa transação.
const cliente = new pg.Client({ connectionString: config.databaseUrl });
await cliente.connect();
let antigas: string[] = [];
const ids: number[] = [];
try {
  const tabelas = await cliente.query("SELECT to_regclass('produtos') AS p, to_regclass('fotos_envio') AS e");
  if (!tabelas.rows[0].p || !tabelas.rows[0].e) {
    throw new Error("Tabelas ausentes: rode `npm run db:up` e `npm run db:migrate`.");
  }

  await cliente.query("BEGIN");

  antigas = (
    await cliente.query(
      `SELECT f.chave_objeto AS chave FROM produto_fotos f
         JOIN produtos p ON p.id = f.produto_id WHERE p.criado_por = $1`,
      [AUTOR_SEED],
    )
  ).rows.map((r) => r.chave as string);
  await cliente.query("DELETE FROM produtos WHERE criado_por = $1", [AUTOR_SEED]);
  await cliente.query("DELETE FROM fotos_envio WHERE enviado_por = $1", [AUTOR_SEED]);

  const alheios = await cliente.query(
    "SELECT count(*)::int AS n FROM produtos WHERE destaque_vaga IS NOT NULL",
  );
  if (alheios.rows[0].n > 0) {
    throw new Error(
      modo === "dev"
        ? "Há produtos de fora do seed em destaque no dev (vagas ocupadas): tire do destaque pelo painel e rode de novo."
        : "Há produtos de fora do seed em destaque (vagas ocupadas): rode `npm run db:reset` e `db:migrate`.",
    );
  }

  const idCategoria = new Map<string, number>();
  for (const nome of Object.values(CATEGORIAS)) {
    await cliente.query("INSERT INTO categorias (nome) VALUES ($1) ON CONFLICT (chave) DO NOTHING", [nome]);
    const r = await cliente.query("SELECT id FROM categorias WHERE chave = categoria_chave($1)", [nome]);
    idCategoria.set(nome, r.rows[0].id as number);
  }
  // "Só esgotados" e "vazia" só valem se ninguém mais pôs produto nelas.
  for (const nome of [CATEGORIAS.soEsgotados, CATEGORIAS.vazia]) {
    const r = await cliente.query("SELECT count(*)::int AS n FROM produtos WHERE categoria_id = $1 AND NOT esgotado", [
      idCategoria.get(nome),
    ]);
    const total = await cliente.query("SELECT count(*)::int AS n FROM produtos WHERE categoria_id = $1", [
      idCategoria.get(nome),
    ]);
    if (r.rows[0].n > 0 || (nome === CATEGORIAS.vazia && total.rows[0].n > 0)) {
      throw new Error(
        `A categoria "${nome}" tem produtos de fora do seed: ` +
          (modo === "dev" ? "mova-os pelo painel e rode de novo." : "rode `npm run db:reset` e `db:migrate`."),
      );
    }
  }

  for (const [i, p] of produtos.entries()) {
    const r = await cliente.query(
      `INSERT INTO produtos (categoria_id, nome, descricao, preco_centavos, a_partir_de, esgotado,
                             destaque_vaga, criado_por, atualizado_por, criado_em, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8,
               now() - make_interval(days => $9), now() - make_interval(days => $9))
       RETURNING id`,
      [
        idCategoria.get(p.categoria),
        p.nome,
        p.descricao,
        p.precoCentavos,
        p.aPartirDe,
        p.esgotado,
        p.destaqueVaga,
        AUTOR_SEED,
        p.diasAtras,
      ],
    );
    const id = r.rows[0].id as number;
    ids.push(id);
    for (const [n, foto] of planoFotos[i].entries()) {
      await cliente.query(
        `INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
         VALUES ($1, $2, $3, $4, now())`,
        [id, n + 1, foto.chave, AUTOR_SEED],
      );
    }
  }

  if (modo === "local") {
    await cliente.query(
      "INSERT INTO fotos_envio (id, formato, tamanho, enviado_por, estado) VALUES ($1, 'jpeg', $2, $3, 'emitido')",
      [ID_ENVIO_PENDENTE, bytesEnvio.length, AUTOR_SEED],
    );
  }
  await cliente.query("COMMIT");
} catch (erro) {
  await cliente.query("ROLLBACK").catch(() => {});
  throw erro;
} finally {
  await cliente.end();
}

// 3. Objetos da rodada anterior, já sem referência.
for (const chave of antigas) await apagarObjeto(chave);

const especial = produtos.findIndex((p) => p.nome.includes("&"));
const itensLocais =
  modo === "local"
    ? `
  envio pendente (item 12):  /fotos/${ID_ENVIO_PENDENTE}.jpg
  objeto órfão (item 12):    /fotos/${ID_ORFAO}.jpg`
    : "";
console.log(`
Seed ${modo} pronto: ${produtos.length} produtos, ${planoFotos.flat().length} fotos.
  produto com nome especial: /p/${String(ids[especial]).padStart(4, "0")}${itensLocais}
  categoria só com esgotados: ${CATEGORIAS.soEsgotados}; categoria vazia: ${CATEGORIAS.vazia}
`);
