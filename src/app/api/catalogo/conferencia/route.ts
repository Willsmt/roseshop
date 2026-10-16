import { z } from "zod";

import { BancoIndisponivel, lerConferencia, registrarFalha } from "@/lib/catalogo";

// Conferência pública da sacola (feature 006, contracts/conferencia.md, ADR-012). Sem sessão, sem
// cache, só leitura. Fronteira na ordem 415 → 413 (cabeçalho) → 413 (leitura com teto) → 400, com
// erros `{}`. Nada do pedido vai para o log: o 503 do banco e o 500 de qualquer outro erro são
// registrados com a lista fechada de `registrarFalha`; do 500 sai só o nome da classe do erro,
// nunca a mensagem, a pilha, o corpo nem os códigos (FR-013, SC-007). Só POST é exportado.

export const dynamic = "force-dynamic";

const TETO_BYTES = 1024;
const MAX_ID = 2_147_483_647;

const CABECALHOS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

const vazio = (status: number) => Response.json({}, { status, headers: CABECALHOS });

// Código canônico sem "#" (research D6), no mesmo limite do `lerProduto`.
const Codigo = z
  .string()
  .regex(/^(?:\d{4}|[1-9]\d{4,9})$/)
  .refine((c) => c !== "0000" && Number(c) <= MAX_ID);

const Pedido = z.strictObject({
  codigos: z
    .array(Codigo)
    .min(1)
    .max(15)
    .refine((c) => new Set(c).size === c.length),
});

function ehJson(req: Request): boolean {
  const tipo = req.headers.get("content-type") ?? "";
  return tipo.split(";")[0].trim().toLowerCase() === "application/json";
}

function excedeCabecalho(req: Request): boolean {
  const valor = req.headers.get("content-length");
  return valor !== null && Number(valor) > TETO_BYTES;
}

// Lê no máximo o teto; passou, cancela a leitura e devolve `null` (corpo sem `Content-Length` ou
// com valor menor que o real).
async function lerComTeto(req: Request): Promise<Uint8Array | null> {
  if (req.body === null) return new Uint8Array();
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > TETO_BYTES) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    bytes.set(p, pos);
    pos += p.byteLength;
  }
  return bytes;
}

function interpretar(bytes: Uint8Array): string[] | null {
  try {
    const texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const r = Pedido.safeParse(JSON.parse(texto));
    return r.success ? r.data.codigos : null;
  } catch {
    return null;
  }
}

// O nome do construtor é um identificador do código, não dado do pedido; qualquer coisa fora desse
// formato (ou valor lançado que não é `Error`) vira "Desconhecida".
function classeDoErro(erro: unknown): string {
  const nome = erro instanceof Error ? (erro.constructor as { name?: unknown }).name : undefined;
  return typeof nome === "string" && /^[A-Za-z_$][\w$]{0,63}$/.test(nome) ? nome : "Desconhecida";
}

export async function POST(req: Request): Promise<Response> {
  try {
    return await conferir(req);
  } catch (erro) {
    registrarFalha({
      evento: "catalogo.erro_inesperado",
      rota: "/api/catalogo/conferencia",
      causa: "inesperado",
      classe: classeDoErro(erro),
    });
    return vazio(500);
  }
}

async function conferir(req: Request): Promise<Response> {
  if (!ehJson(req)) return vazio(415);
  if (excedeCabecalho(req)) return vazio(413);
  const bytes = await lerComTeto(req);
  if (bytes === null) return vazio(413);
  const codigos = interpretar(bytes);
  if (codigos === null) return vazio(400);
  try {
    const itens = await lerConferencia(codigos);
    return Response.json({ itens }, { headers: CABECALHOS });
  } catch (erro) {
    if (!(erro instanceof BancoIndisponivel)) throw erro;
    registrarFalha({
      evento: "catalogo.banco_indisponivel",
      rota: "/api/catalogo/conferencia",
      causa: "banco",
    });
    return vazio(503);
  }
}
