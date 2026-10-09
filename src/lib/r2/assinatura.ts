import { AwsV4Signer } from "aws4fetch";

import { configR2 } from "./config";
import type { FormatoImagem } from "./verificacao";

// URL pré-assinada do PUT direto ao R2 (ADR-009 D1, TL-1). O R2 impõe tudo que é
// assinado: content-length exato, content-type e if-none-match: * (segundo PUT ⇒ 412).
const EXPIRA_SEGUNDOS = 300;
// Defesa em profundidade: a action já recusa acima disto na emissão (ADR-009 D1).
const TAMANHO_MAXIMO = 1_048_576;

const TIPO: Record<FormatoImagem, string> = { webp: "image/webp", jpeg: "image/jpeg" };

export type EnvioAssinado = { url: string; headers: Record<string, string> };

export async function assinarEnvio({
  chave,
  formato,
  tamanho,
}: {
  chave: string;
  formato: FormatoImagem;
  tamanho: number;
}): Promise<EnvioAssinado> {
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > TAMANHO_MAXIMO) {
    throw new Error("Tamanho de envio inválido");
  }
  const config = configR2();

  const url = new URL(`${config.endpoint}/${chave}`);
  // Antes de assinar: sem isto o aws4fetch põe 86400 (24 h).
  url.searchParams.set("X-Amz-Expires", String(EXPIRA_SEGUNDOS));

  // O navegador põe o content-length sozinho; ele só entra aqui para ser assinado.
  const headers = { "content-type": TIPO[formato], "if-none-match": "*" };
  // O signer direto (e não AwsClient.sign) não monta um Request com content-length,
  // que o workerd poderia recusar; só calcula a URL.
  const assinado = await new AwsV4Signer({
    method: "PUT",
    url: url.toString(),
    headers: { ...headers, "content-length": String(tamanho) },
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
    signQuery: true,
    allHeaders: true,
  }).sign();

  return { url: assinado.url.toString(), headers };
}
