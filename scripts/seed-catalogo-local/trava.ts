// Trava de ambiente do seed local (T080a). Pura: recebe o env e devolve a configuração aceita ou
// lança. O seed só roda contra o Postgres do Docker (docker-compose.yml) e o bucket local do
// wrangler (wrangler.jsonc, topo). Qualquer outra coisa, inclusive "quase local", é recusada.

export const ENDPOINT_R2_LOCAL = "http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local";
export const ACCESS_KEY_R2_LOCAL = "roseshop-local";

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);

export type ConfigSeed = {
  databaseUrl: string;
  r2: { endpoint: string; accessKeyId: string; secretAccessKey: string };
};

export type EnvSeed = Record<string, string | undefined>;

function recusar(motivo: string): never {
  throw new Error(`Seed local recusado: ${motivo}`);
}

function lerUrl(valor: string | undefined, nome: string): URL {
  if (!valor) recusar(`${nome} ausente (copie .dev.vars.example para .dev.vars).`);
  if (!URL.canParse(valor)) recusar(`${nome} não é uma URL válida.`);
  return new URL(valor);
}

export function validarAmbienteLocal(env: EnvSeed): ConfigSeed {
  if (env.CI) recusar("rodando em CI.");
  if (env.NODE_ENV === "production") recusar("NODE_ENV=production.");
  // Proxy HTTP do Neon: só existe no local; se apontar para fora, o driver iria para fora.
  if (env.NEON_FETCH_ENDPOINT) {
    const proxy = lerUrl(env.NEON_FETCH_ENDPOINT, "NEON_FETCH_ENDPOINT");
    if (!HOSTS_LOCAIS.has(proxy.hostname)) recusar("NEON_FETCH_ENDPOINT não é local.");
  }

  const banco = lerUrl(env.DATABASE_URL, "DATABASE_URL");
  if (banco.protocol !== "postgres:" && banco.protocol !== "postgresql:") {
    recusar("DATABASE_URL não é postgres://.");
  }
  if (!HOSTS_LOCAIS.has(banco.hostname)) recusar("DATABASE_URL não aponta para localhost.");
  if (banco.port !== "5440") recusar("DATABASE_URL não usa a porta 5440 do docker-compose.");
  if (banco.pathname !== "/roseshop") recusar("DATABASE_URL não usa o banco roseshop.");
  if (banco.username !== "roseshop") recusar("DATABASE_URL não usa o usuário roseshop.");

  // Sem R2_S3_ENDPOINT no env, vale o local fixo (o wrangler.jsonc o declara em `vars`, não em
  // .dev.vars). Se vier, tem de ser idêntico: nada de outro bucket nem de outra porta.
  const endpoint = env.R2_S3_ENDPOINT ?? ENDPOINT_R2_LOCAL;
  if (endpoint !== ENDPOINT_R2_LOCAL) recusar("R2_S3_ENDPOINT não é o bucket local roseshop-local.");

  if (env.R2_ACCESS_KEY_ID !== ACCESS_KEY_R2_LOCAL) {
    recusar("R2_ACCESS_KEY_ID não é a credencial falsa local.");
  }
  if (!env.R2_SECRET_ACCESS_KEY) recusar("R2_SECRET_ACCESS_KEY ausente.");

  return {
    databaseUrl: banco.toString(),
    r2: {
      endpoint,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  };
}
