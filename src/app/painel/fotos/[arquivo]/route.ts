import { getAdminSession } from "@/lib/auth";
import { fotoExibivel } from "@/lib/fotos/exibicao";
import { chaveDoArquivo, servirObjeto } from "@/lib/r2";

// Exibição das fotos no painel (contracts/fotos.md §5, ADR-009 D4). O bucket não é público:
// só com sessão de administradora, só nomes `<uuid v4>.(webp|jpg)` e só chaves que estão em
// uma foto de produto ou em um envio confirmado. Qualquer recusa é 404 igual (é imagem, não
// redireciona); exceção em qualquer passo ⇒ 500 genérico. Só GET é exportado: o Next atende
// HEAD chamando este mesmo GET (mesmo guard, sem corpo) e responde OPTIONS sozinho; os demais
// métodos recebem 405.

// Headers do 404 e do 500.
const SEM_CACHE = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const naoEncontrado = () => new Response(null, { status: 404, headers: SEM_CACHE });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ arquivo: string }> },
): Promise<Response> {
  try {
    if (!(await getAdminSession())) return naoEncontrado();

    const { arquivo } = await params;
    // Regex antes de tocar no binding.
    const chave = chaveDoArquivo(arquivo);
    if (!chave) return naoEncontrado();
    if (!(await fotoExibivel(chave))) return naoEncontrado();

    const objeto = await servirObjeto(chave, req.headers.get("if-none-match"));
    if (!objeto) return naoEncontrado();

    const headers = {
      "Content-Type": arquivo.endsWith(".webp") ? "image/webp" : "image/jpeg",
      // A chave nunca muda de conteúdo.
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: objeto.etag,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    };
    // Sem corpo: o If-None-Match casou (TL-19).
    if (!objeto.corpo) return new Response(null, { status: 304, headers });
    return new Response(objeto.corpo, { status: 200, headers });
  } catch {
    // Sem a chave, o arquivo nem o erro original (a mensagem pode trazer a chave); sem bytes.
    console.error("fotos.exibicao.falha");
    return new Response(null, { status: 500, headers: SEM_CACHE });
  }
}
