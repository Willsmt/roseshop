"use server";

import "server-only";

import { z } from "zod";

import { safeCallbackPath } from "./callback-path";
import { signIn } from "./instance";

const entrarSchema = z.object({
  callbackUrl: z.string().optional().catch(undefined),
});

// Pública por definição: entrar não pode exigir sessão. Listada por função
// nas exceções do teste de conformidade.
export async function entrarComGoogle(formData: FormData): Promise<void> {
  const { callbackUrl } = entrarSchema.parse({
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });
  await signIn("google", { redirectTo: safeCallbackPath(callbackUrl) });
}
