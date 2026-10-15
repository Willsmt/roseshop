// Seed do catálogo no ambiente LOCAL (T080a): popula o Postgres do Docker e o bucket local do
// wrangler para o roteiro do preview. Uso: `npm run seed:local` (precisa de `db:up`, `db:migrate`
// e de `npm run preview` no ar, que expõe o endpoint S3 do R2 local). Recusa qualquer outro
// banco ou bucket (trava.ts). Idempotente: refaz só o que ele mesmo criou (criado_por seed@local).
// Roda com o Node nativo (type stripping): imports relativos com extensão, sem alias `@/`.
import { randomUUID } from "node:crypto";

import { AwsClient } from "aws4fetch";
import pg from "pg";

import { AUTOR_SEED, CATEGORIAS, planejarProdutos } from "./seed-catalogo-local/dados.ts";
import { gerarJpegGradiente } from "./seed-catalogo-local/jpeg.ts";
import { validarAmbienteLocal } from "./seed-catalogo-local/trava.ts";

// Mesmo formato de chave da 004: fotos/<uuid v4>.jpg. Estes dois são fixos para a rodada seguinte
// sobrescrever o objeto em vez de deixar sobra: um envio pendente (com linha) e um órfão (sem).
const ID_ENVIO_PENDENTE = "5eed0000-0000-4000-8000-000000000001";
const ID_ORFAO = "5eed0000-0000-4000-8000-000000000002";

const config = validarAmbienteLocal(process.env);
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
    throw new Error("R2 local fora do ar: suba `npm run preview` (porta 8787) e rode de novo.");
  }
  if (!resposta.ok) throw new Error(`PUT ${chave} falhou: HTTP ${resposta.status}`);
}

async function apagarObjeto(chave: string) {
  try {
    await r2.fetch(urlObjeto(chave), { method: "DELETE" });
  } catch {
    // Melhor esforço: sobra no bucket local não quebra nada.
  }
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

process.stdout.write("Enviando fotos ao R2 local... ");
for (const foto of planoFotos.flat()) await enviarObjeto(foto.chave, foto.bytes);
await enviarObjeto(chaveEnvio, bytesEnvio);
await enviarObjeto(chaveOrfao, bytesEnvio);
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
    throw new Error("Há produtos de fora do seed em destaque (vagas ocupadas): rode `npm run db:reset` e `db:migrate`.");
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
      throw new Error(`A categoria "${nome}" tem produtos de fora do seed: rode \`npm run db:reset\` e \`db:migrate\`.`);
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

  await cliente.query(
    "INSERT INTO fotos_envio (id, formato, tamanho, enviado_por, estado) VALUES ($1, 'jpeg', $2, $3, 'emitido')",
    [ID_ENVIO_PENDENTE, bytesEnvio.length, AUTOR_SEED],
  );
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
console.log(`
Seed local pronto: ${produtos.length} produtos, ${planoFotos.flat().length} fotos.
  produto com nome especial: /p/${String(ids[especial]).padStart(4, "0")}
  envio pendente (item 12):  /fotos/${ID_ENVIO_PENDENTE}.jpg
  objeto órfão (item 12):    /fotos/${ID_ORFAO}.jpg
  categoria só com esgotados: ${CATEGORIAS.soEsgotados}; categoria vazia: ${CATEGORIAS.vazia}
`);
