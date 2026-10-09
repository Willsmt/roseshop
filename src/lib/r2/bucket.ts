import { getCloudflareContext } from "@opennextjs/cloudflare";

// Acesso ao bucket pelo binding PRODUCT_IMAGES (contracts/fotos.md §7). O binding só
// existe no worker; a URL pré-assinada (assinatura.ts) é o único caminho do aparelho.
const LOTE_DELETE = 1000;

async function bucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.PRODUCT_IMAGES;
}

export type ObjetoLido = { tamanho: number; bytes(): Promise<Uint8Array> };

// O tamanho vem dos metadados do objeto: a confirmação recusa o grande sem ler o corpo.
export async function lerObjeto(chave: string): Promise<ObjetoLido | null> {
  const objeto = await (await bucket()).get(chave);
  if (!objeto) return null;
  return {
    tamanho: objeto.size,
    bytes: async () => new Uint8Array(await objeto.arrayBuffer()),
  };
}

// Chave inexistente não é erro no R2.
export async function apagarObjetos(chaves: string[]): Promise<void> {
  if (chaves.length === 0) return;
  const alvo = await bucket();
  for (let i = 0; i < chaves.length; i += LOTE_DELETE) {
    await alvo.delete(chaves.slice(i, i + LOTE_DELETE));
  }
}

export async function* listarObjetos(
  prefixo: string,
): AsyncGenerator<{ chave: string; uploaded: Date }> {
  const alvo = await bucket();
  let cursor: string | undefined;
  do {
    const pagina = await alvo.list(cursor ? { prefix: prefixo, cursor } : { prefix: prefixo });
    for (const objeto of pagina.objects) yield { chave: objeto.key, uploaded: objeto.uploaded };
    cursor = pagina.truncated ? pagina.cursor : undefined;
  } while (cursor);
}
