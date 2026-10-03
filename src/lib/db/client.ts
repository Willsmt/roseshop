import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export type DbEnv = {
  DATABASE_URL: string;
  /** Só no ambiente local (proxy HTTP do Docker). Ausente em dev online e produção. */
  NEON_FETCH_ENDPOINT?: string;
};

export function createDb(env: DbEnv) {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada");
  }
  if (env.NEON_FETCH_ENDPOINT) {
    neonConfig.fetchEndpoint = env.NEON_FETCH_ENDPOINT;
  }
  return drizzle({ client: neon(env.DATABASE_URL), schema });
}

export type Db = ReturnType<typeof createDb>;
