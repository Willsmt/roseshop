import { describe, expect, it } from "vitest";

import {
  AUTOR_SEED_DEV,
  ENDPOINT_R2_DEV,
  ENDPOINT_R2_LOCAL,
  MARCADOR_HOST_NEON_DEV,
  validarAmbienteDev,
  validarAmbienteLocal,
  type EnvSeed,
} from "./trava";

const LOCAL: EnvSeed = {
  DATABASE_URL: "postgres://roseshop:roseshop_local@localhost:5440/roseshop",
  NEON_FETCH_ENDPOINT: "http://localhost:4444/sql",
  R2_ACCESS_KEY_ID: "roseshop-local",
  R2_SECRET_ACCESS_KEY: "roseshop-local-nao-secreto",
};

const com = (extra: EnvSeed): EnvSeed => ({ ...LOCAL, ...extra });

describe("validarAmbienteLocal", () => {
  it("aceita o ambiente do docker-compose e do wrangler local", () => {
    const config = validarAmbienteLocal(LOCAL);
    expect(config.r2.endpoint).toBe(ENDPOINT_R2_LOCAL);
    expect(config.databaseUrl).toContain("localhost:5440/roseshop");
  });

  it("aceita 127.0.0.1 e o endpoint local explícito", () => {
    expect(() =>
      validarAmbienteLocal(
        com({
          DATABASE_URL: "postgres://roseshop:roseshop_local@127.0.0.1:5440/roseshop",
          R2_S3_ENDPOINT: ENDPOINT_R2_LOCAL,
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ["ausente", undefined],
    ["inválido", "isso não é url"],
    ["Neon online", "postgres://u:p@ep-abc.sa-east-1.aws.neon.tech/neondb?sslmode=require"],
    ["host remoto na porta local", "postgres://roseshop:x@db.exemplo.com:5440/roseshop"],
    ["host parecido", "postgres://roseshop:x@localhost.exemplo.com:5440/roseshop"],
    ["outra porta", "postgres://roseshop:x@localhost:5432/roseshop"],
    ["outro banco", "postgres://roseshop:x@localhost:5440/outro"],
    ["outro usuário", "postgres://admin:x@localhost:5440/roseshop"],
    ["outro protocolo", "mysql://roseshop:x@localhost:5440/roseshop"],
  ])("recusa DATABASE_URL %s", (_nome, valor) => {
    expect(() => validarAmbienteLocal(com({ DATABASE_URL: valor }))).toThrow(/Seed recusado/);
  });

  it("recusa o proxy do Neon fora da máquina", () => {
    expect(() =>
      validarAmbienteLocal(com({ NEON_FETCH_ENDPOINT: "https://proxy.exemplo.com/sql" })),
    ).toThrow(/NEON_FETCH_ENDPOINT/);
  });

  it.each([
    ["bucket de dev", "https://e93918940385c0ea43d9327d98a78554.r2.cloudflarestorage.com/roseshop-dev"],
    ["bucket de produção", "https://e93918940385c0ea43d9327d98a78554.r2.cloudflarestorage.com/roseshop-prod"],
    ["outro bucket local", "http://localhost:8787/cdn-cgi/local/r2/s3/outro"],
    ["outra porta local", "http://localhost:9999/cdn-cgi/local/r2/s3/roseshop-local"],
    ["barra final", `${ENDPOINT_R2_LOCAL}/`],
  ])("recusa R2_S3_ENDPOINT de %s", (_nome, valor) => {
    expect(() => validarAmbienteLocal(com({ R2_S3_ENDPOINT: valor }))).toThrow(/R2_S3_ENDPOINT/);
  });

  it("recusa credencial de R2 que não seja a falsa local", () => {
    expect(() => validarAmbienteLocal(com({ R2_ACCESS_KEY_ID: "AKIAREAL" }))).toThrow(
      /R2_ACCESS_KEY_ID/,
    );
    expect(() => validarAmbienteLocal(com({ R2_ACCESS_KEY_ID: undefined }))).toThrow(
      /R2_ACCESS_KEY_ID/,
    );
    expect(() => validarAmbienteLocal(com({ R2_SECRET_ACCESS_KEY: undefined }))).toThrow(
      /R2_SECRET_ACCESS_KEY/,
    );
  });

  it("recusa em CI e com NODE_ENV=production", () => {
    expect(() => validarAmbienteLocal(com({ CI: "true" }))).toThrow(/CI/);
    expect(() => validarAmbienteLocal(com({ NODE_ENV: "production" }))).toThrow(/production/);
  });

  it("não vaza a senha do banco na mensagem de recusa", () => {
    try {
      validarAmbienteLocal(com({ DATABASE_URL: "postgres://u:senha-secreta@ep.neon.tech/neondb" }));
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("senha-secreta");
    }
  });
});

const HOST_DEV = "ep-teste-dev.sa-east-1.aws.neon.tech";
const DEV: EnvSeed = {
  DATABASE_URL: `postgres://dono:senha-secreta@${HOST_DEV}/neondb?sslmode=require`,
  R2_S3_ENDPOINT: ENDPOINT_R2_DEV,
  R2_ACCESS_KEY_ID: "chave-do-token-dev",
  R2_SECRET_ACCESS_KEY: "segredo-do-token-dev",
};
const dev = (extra: EnvSeed): EnvSeed => ({ ...DEV, ...extra });

describe("validarAmbienteDev", () => {
  it("aceita o host exato do branch dev e o bucket roseshop-dev", () => {
    const config = validarAmbienteDev(DEV, HOST_DEV);
    expect(config.modo).toBe("dev");
    expect(config.autor).toBe(AUTOR_SEED_DEV);
    expect(config.r2.endpoint).toBe(ENDPOINT_R2_DEV);
  });

  it("recusa tudo enquanto o host permitido for o marcador", () => {
    expect(() => validarAmbienteDev(DEV, MARCADOR_HOST_NEON_DEV)).toThrow(/marcador/);
    expect(() =>
      validarAmbienteDev(dev({ DATABASE_URL: `postgres://u:x@${MARCADOR_HOST_NEON_DEV}/neondb?sslmode=require` }), MARCADOR_HOST_NEON_DEV),
    ).toThrow(/marcador/);
  });

  it.each([
    ["ausente", undefined],
    ["inválido", "isso não é url"],
    ["produção (outro host)", "postgres://dono:x@ep-producao.sa-east-1.aws.neon.tech/neondb?sslmode=require"],
    ["pooler do mesmo endpoint", "postgres://dono:x@ep-teste-dev-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"],
    ["host com sufixo", `postgres://dono:x@${HOST_DEV}.exemplo.com/neondb?sslmode=require`],
    ["host com prefixo", `postgres://dono:x@x.${HOST_DEV}/neondb?sslmode=require`],
    ["localhost", "postgres://roseshop:x@localhost:5440/roseshop"],
    ["sem sslmode", `postgres://dono:x@${HOST_DEV}/neondb`],
    ["sslmode fraco", `postgres://dono:x@${HOST_DEV}/neondb?sslmode=disable`],
    ["porta estranha", `postgres://dono:x@${HOST_DEV}:5440/neondb?sslmode=require`],
    ["outro protocolo", `mysql://dono:x@${HOST_DEV}/neondb?sslmode=require`],
  ])("recusa DATABASE_URL %s", (_nome, valor) => {
    expect(() => validarAmbienteDev(dev({ DATABASE_URL: valor }), HOST_DEV)).toThrow(/Seed recusado/);
  });

  it.each([
    ["ausente", undefined],
    ["bucket de produção", "https://e93918940385c0ea43d9327d98a78554.r2.cloudflarestorage.com/roseshop-prod"],
    ["bucket de cache", "https://e93918940385c0ea43d9327d98a78554.r2.cloudflarestorage.com/roseshop-cache-dev"],
    ["outra conta", "https://0000.r2.cloudflarestorage.com/roseshop-dev"],
    ["bucket local", ENDPOINT_R2_LOCAL],
    ["barra final", `${ENDPOINT_R2_DEV}/`],
  ])("recusa R2_S3_ENDPOINT %s", (_nome, valor) => {
    expect(() => validarAmbienteDev(dev({ R2_S3_ENDPOINT: valor }), HOST_DEV)).toThrow(/R2_S3_ENDPOINT/);
  });

  it("recusa credenciais ausentes ou a falsa local", () => {
    expect(() => validarAmbienteDev(dev({ R2_ACCESS_KEY_ID: undefined }), HOST_DEV)).toThrow(/R2_ACCESS_KEY_ID/);
    expect(() => validarAmbienteDev(dev({ R2_ACCESS_KEY_ID: "roseshop-local" }), HOST_DEV)).toThrow(/falsa local/);
    expect(() => validarAmbienteDev(dev({ R2_SECRET_ACCESS_KEY: undefined }), HOST_DEV)).toThrow(/R2_SECRET_ACCESS_KEY/);
  });

  it("recusa em CI, com NODE_ENV=production e com o proxy local do Neon", () => {
    expect(() => validarAmbienteDev(dev({ CI: "true" }), HOST_DEV)).toThrow(/CI/);
    expect(() => validarAmbienteDev(dev({ NODE_ENV: "production" }), HOST_DEV)).toThrow(/production/);
    expect(() => validarAmbienteDev(dev({ NEON_FETCH_ENDPOINT: "http://localhost:4444/sql" }), HOST_DEV)).toThrow(
      /NEON_FETCH_ENDPOINT/,
    );
  });

  it("não vaza a senha do banco na mensagem de recusa", () => {
    try {
      validarAmbienteDev(dev({ DATABASE_URL: "postgres://dono:senha-secreta@ep-outro.neon.tech/neondb?sslmode=require" }), HOST_DEV);
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("senha-secreta");
    }
  });
});

describe("modo local não aceita o ambiente dev", () => {
  it("recusa DATABASE_URL e credenciais do dev", () => {
    expect(() => validarAmbienteLocal(DEV)).toThrow(/Seed recusado/);
    expect(() => validarAmbienteLocal(com({ R2_S3_ENDPOINT: ENDPOINT_R2_DEV }))).toThrow(/R2_S3_ENDPOINT/);
  });
});
