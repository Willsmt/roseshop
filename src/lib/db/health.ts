import { sql } from "drizzle-orm";

import { createDb, type Db, type DbEnv } from "./client";

export async function checkDb(db: Pick<Db, "execute">): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (error) {
    // Só o tipo do erro: a mensagem pode conter host/usuário do banco.
    const kind = error instanceof Error ? error.name : "unknown";
    console.error(`[health] falha ao consultar o banco (${kind})`);
    return false;
  }
}

export async function checkDbFromEnv(env: DbEnv): Promise<boolean> {
  let db: Db;
  try {
    db = createDb(env);
  } catch {
    console.error("[health] configuração do banco ausente ou inválida");
    return false;
  }
  return checkDb(db);
}
