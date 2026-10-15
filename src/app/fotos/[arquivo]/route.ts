import { lerFoto, registrarFalha } from "@/lib/catalogo";
import { NAVEGADOR_FOTOS_S } from "@/lib/catalogo/prazos";
import { chaveDoArquivo, servirObjeto } from "@/lib/r2";

// Foto pública do catálogo (contracts/publico.md §4, research D6). Sem sessão: o banco decide, a
// cada pedido, se a chave pertence a um produto cadastrado (`lerFoto`). Toda recusa é o mesmo 404
// vazio, com os mesmos cabeçalhos (malformada, inexistente, envio pendente, removida). Exceção em
// qualquer passo ⇒ 503 vazio e `no-store`, registrado sem a chave nem a mensagem (FR-024).
// Só GET é exportado: o Next atende HEAD pelo GET.

const CABECALHOS_BASE = {
  "Cache-Control": `public, max-age=${NAVEGADOR_FOTOS_S}`,
  "X-Content-Type-Options": "nosniff",
};

const naoEncontrado = () => new Response(null, { status: 404, headers: CABECALHOS_BASE });

const indisponivel = () =>
  new Response(null, {
    status: 503,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ arquivo: string }> },
): Promise<Response> {
  let causa: "banco" | "r2" | "inesperado" = "inesperado";
  try {
    const { arquivo } = await params;
    // Regex antes de tocar no banco.
    if (!chaveDoArquivo(arquivo)) return naoEncontrado();

    causa = "banco";
    const chave = await lerFoto(arquivo);
    if (!chave) return naoEncontrado();

    causa = "r2";
    const objeto = await servirObjeto(chave, req.headers.get("if-none-match"));
    if (!objeto) return naoEncontrado();

    const headers = {
      ...CABECALHOS_BASE,
      "Content-Type": arquivo.endsWith(".webp") ? "image/webp" : "image/jpeg",
      ETag: objeto.etag,
      "Content-Security-Policy": "default-src 'none'",
    };
    // Sem corpo: o If-None-Match casou.
    if (!objeto.corpo) return new Response(null, { status: 304, headers });
    return new Response(objeto.corpo, { status: 200, headers });
  } catch {
    registrarFalha({ evento: "catalogo.fotos_falha", rota: "/fotos/[arquivo]", causa });
    return indisponivel();
  }
}
