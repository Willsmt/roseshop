import { sql } from "drizzle-orm";

import type { Db } from "./client";

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
