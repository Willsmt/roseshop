import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { createDb, type Db } from "./client";

// Única porta de obtenção do `db` para o barrel de categorias, o módulo do painel e as
// actions (contrato §4). Os testes de integração substituem este módulo por
// `createDb(process.env)` via `vi.mock("@/lib/db/contexto")`.
export async function dbDoContexto(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  return createDb({
    DATABASE_URL: env.DATABASE_URL,
    NEON_FETCH_ENDPOINT: env.NEON_FETCH_ENDPOINT,
  });
}
