import { getCloudflareContext } from "@opennextjs/cloudflare";

import { createDb } from "@/lib/db/client";
import { checkDb } from "@/lib/db/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  const ok = await checkDb(
    createDb({
      DATABASE_URL: env.DATABASE_URL,
      NEON_FETCH_ENDPOINT: env.NEON_FETCH_ENDPOINT,
    }),
  );
  return Response.json(
    { db: ok ? "ok" : "error" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
