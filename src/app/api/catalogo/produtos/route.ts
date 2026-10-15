import { lerBloco, registrarFalha } from "@/lib/catalogo";
import { NAVEGADOR_LISTA_S } from "@/lib/catalogo/prazos";

// Bloco da lista do catálogo (contracts/publico.md §3, research D7/D8). Sem sessão. A validação do
// slug e do cursor é do catálogo: slug desconhecido vira "Todas" e cursor inválido vira 400 `{}`.
// Banco fora ⇒ 503 `{}` e `no-store`, registrado sem a mensagem (FR-024). Só GET é exportado.

export const dynamic = "force-dynamic";

const NOSNIFF = { "X-Content-Type-Options": "nosniff" };

const semCache = (status: number) =>
  Response.json({}, { status, headers: { "Cache-Control": "no-store", ...NOSNIFF } });

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  try {
    const bloco = await lerBloco({
      categoria: searchParams.get("categoria"),
      depois: searchParams.get("depois"),
    });
    if (bloco === "invalido") return semCache(400);
    return Response.json(bloco, {
      headers: { "Cache-Control": `public, max-age=${NAVEGADOR_LISTA_S}`, ...NOSNIFF },
    });
  } catch {
    registrarFalha({
      evento: "catalogo.banco_indisponivel",
      rota: "/api/catalogo/produtos",
      causa: "banco",
    });
    return semCache(503);
  }
}
