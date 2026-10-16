// Trava de ambiente do seed (T080a, T085a). Pura: recebe o env e devolve a configuração aceita ou
// lança. Dois modos, ambos por igualdade exata (nada de padrão):
//  - local (padrão): só o Postgres do Docker (docker-compose.yml) e o bucket local do wrangler
//    (wrangler.jsonc, topo). Qualquer outra coisa, inclusive "quase local", é recusada.
//  - dev (`--dev`, T085a): só o host DIRETO do branch dev do Neon e o bucket roseshop-dev.
//    Produção, o pooler e qualquer outro host ou bucket são recusados.

export const ENDPOINT_R2_LOCAL = "http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local";
export const ACCESS_KEY_R2_LOCAL = "roseshop-local";

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);

// Host do branch dev do Neon (string direta, sem pooler, ADR-002/N1). NÃO é segredo, mas não está
// no repositório: o mantenedor troca o valor abaixo pelo host de `DATABASE_URL` do ambiente dev
// (a parte entre "@" e "/" da string). Enquanto for o marcador, o modo dev recusa tudo.
export const HOST_NEON_DEV = "ep-winter-hill-b6z86qgo.c-2.sa-east-1.aws.neon.tech";
export const ENDPOINT_R2_DEV =
  "https://e93918940385c0ea43d9327d98a78554.r2.cloudflarestorage.com/roseshop-dev";

// Valor que `hostPermitido` tem antes de ser preenchido; a trava recusa tudo que começa com ele.
export const PREFIXO_MARCADOR_HOST = "PREENCHER";
export const MARCADOR_HOST_NEON_DEV = `${PREFIXO_MARCADOR_HOST}-host-direto-do-branch-dev.neon.tech`;

export const AUTOR_SEED_LOCAL = "seed@local";
export const AUTOR_SEED_DEV = "seed@dev";

export type ConfigSeed = {
  modo: "local" | "dev";
  /** Valor de `criado_por`/`enviado_por` do que o seed cria; é o único que ele apaga. */
  autor: string;
  databaseUrl: string;
  r2: { endpoint: string; accessKeyId: string; secretAccessKey: string };
};

export type EnvSeed = Record<string, string | undefined>;

function recusar(motivo: string): never {
  throw new Error(`Seed recusado: ${motivo}`);
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
    modo: "local",
    autor: AUTOR_SEED_LOCAL,
    databaseUrl: banco.toString(),
    r2: {
      endpoint,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  };
}

export function validarAmbienteDev(env: EnvSeed, hostPermitido: string = HOST_NEON_DEV): ConfigSeed {
  if (hostPermitido.startsWith(PREFIXO_MARCADOR_HOST)) {
    recusar("HOST_NEON_DEV ainda é o marcador: edite scripts/seed-catalogo-local/trava.ts.");
  }
  if (env.CI) recusar("rodando em CI.");
  if (env.NODE_ENV === "production") recusar("NODE_ENV=production.");
  // Proxy local do Neon indica .dev.vars misturado: o modo dev lê só o .seed-dev.vars.
  if (env.NEON_FETCH_ENDPOINT) recusar("NEON_FETCH_ENDPOINT definido (ambiente local misturado).");

  const banco = lerUrl(env.DATABASE_URL, "DATABASE_URL");
  if (banco.protocol !== "postgres:" && banco.protocol !== "postgresql:") {
    recusar("DATABASE_URL não é postgres://.");
  }
  if (banco.hostname !== hostPermitido) recusar("DATABASE_URL não é o host do branch dev do Neon.");
  if (banco.port !== "" && banco.port !== "5432") recusar("DATABASE_URL usa porta inesperada.");
  if (banco.searchParams.get("sslmode") !== "require") recusar("DATABASE_URL sem sslmode=require.");

  if (env.R2_S3_ENDPOINT !== ENDPOINT_R2_DEV) recusar("R2_S3_ENDPOINT não é o bucket roseshop-dev.");
  if (!env.R2_ACCESS_KEY_ID) recusar("R2_ACCESS_KEY_ID ausente.");
  if (env.R2_ACCESS_KEY_ID === ACCESS_KEY_R2_LOCAL) {
    recusar("R2_ACCESS_KEY_ID é a credencial falsa local; use o token do bucket dev.");
  }
  if (!env.R2_SECRET_ACCESS_KEY) recusar("R2_SECRET_ACCESS_KEY ausente.");

  return {
    modo: "dev",
    autor: AUTOR_SEED_DEV,
    databaseUrl: banco.toString(),
    r2: {
      endpoint: env.R2_S3_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  };
}

export function validarAmbiente(modo: "local" | "dev", env: EnvSeed): ConfigSeed {
  return modo === "dev" ? validarAmbienteDev(env) : validarAmbienteLocal(env);
}
