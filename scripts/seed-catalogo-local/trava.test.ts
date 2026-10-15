import { describe, expect, it } from "vitest";

import { ENDPOINT_R2_LOCAL, validarAmbienteLocal, type EnvSeed } from "./trava";

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
    expect(() => validarAmbienteLocal(com({ DATABASE_URL: valor }))).toThrow(/Seed local recusado/);
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
