import { getCloudflareContext } from "@opennextjs/cloudflare";

import { executarLimpeza } from "@/lib/fotos/limpeza";

// Limpeza diária (contracts/fotos.md §6, ADR-009 D5): chamada em processo pelo `scheduled` do
// cloudflare/worker.ts. Sem sessão: protegida por CRON_SECRET. Segredo ausente, errado ou outro
// método ⇒ 404 sem corpo, igual em todos os casos (TL-16).
export const dynamic = "force-dynamic";

const PREFIXO = "Bearer ";

const naoEncontrado = async () => new Response(null, { status: 404 });

async function sha256(texto: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
}

// Laço de tempo fixo sobre os 32 bytes dos dois hashes: o tempo não depende de onde diferem.
// Mesmo código no Node (testes) e no workerd, sem API de comparação própria de nenhum dos dois.
function mesmosBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diferenca = a.length ^ b.length;
  for (let i = 0; i < 32; i++) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferenca === 0;
}

async function autorizado(request: Request): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const esperado = env.CRON_SECRET;
  if (!esperado) return false;
  const cabecalho = request.headers.get("authorization") ?? "";
  const temPrefixo = cabecalho.startsWith(PREFIXO);
  const recebido = temPrefixo ? cabecalho.slice(PREFIXO.length) : "";
  const iguais = mesmosBytes(await sha256(recebido), await sha256(esperado));
  return temPrefixo && iguais;
}

export async function POST(request: Request) {
  try {
    if (!(await autorizado(request))) return naoEncontrado();
    const contagens = await executarLimpeza(new Date());
    return Response.json(contagens, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Sem a mensagem do erro: pode citar chave de objeto. O `scheduled` lança com o status.
    console.error(JSON.stringify({ evento: "limpeza.falha" }));
    return new Response(null, { status: 500 });
  }
}

export const GET = naoEncontrado;
export const HEAD = naoEncontrado;
export const PUT = naoEncontrado;
export const PATCH = naoEncontrado;
export const DELETE = naoEncontrado;
export const OPTIONS = naoEncontrado;
