import { z } from "zod";

// Configuração do acesso S3 ao R2 (contracts/fotos.md §7). Lida de process.env no
// momento do uso, como o restante dos segredos do OpenNext. O endpoint já inclui o
// bucket do ambiente; as credenciais são do token com escopo só nesse bucket.
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);

const esquema = z.object({
  R2_S3_ENDPOINT: z
    .url({ protocol: /^https?$/ })
    .refine((valor) => !valor.endsWith("/"))
    // http só no endpoint S3 local do wrangler; dev e produção exigem https.
    .refine((valor) => {
      if (!URL.canParse(valor)) return false;
      const { protocol, hostname } = new URL(valor);
      return protocol === "https:" || HOSTS_LOCAIS.has(hostname);
    }),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
});

export type ConfigR2 = { endpoint: string; accessKeyId: string; secretAccessKey: string };

export function configR2(): ConfigR2 {
  const lido = esquema.safeParse({
    R2_S3_ENDPOINT: process.env.R2_S3_ENDPOINT,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  });
  if (!lido.success) {
    // Só os nomes das variáveis: a mensagem nunca carrega valores.
    const nomes = [...new Set(lido.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Configuração do R2 inválida: ${nomes.join(", ")}`);
  }
  return {
    endpoint: lido.data.R2_S3_ENDPOINT,
    accessKeyId: lido.data.R2_ACCESS_KEY_ID,
    secretAccessKey: lido.data.R2_SECRET_ACCESS_KEY,
  };
}
