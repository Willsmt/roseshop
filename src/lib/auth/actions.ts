"use server";

import "server-only";

import { z } from "zod";

import { safeCallbackPath } from "./callback-path";
import { signIn, signOut } from "./instance";

const entrarSchema = z.object({
  callbackUrl: z.string().optional().catch(undefined),
  trocarConta: z.literal("1").optional().catch(undefined),
});

// Pública por definição: entrar não pode exigir sessão. Listada por função
// nas exceções do teste de conformidade.
export async function entrarComGoogle(formData: FormData): Promise<void> {
  const { callbackUrl, trocarConta } = entrarSchema.parse({
    callbackUrl: formData.get("callbackUrl") ?? undefined,
    trocarConta: formData.get("trocarConta") ?? undefined,
  });
  const options = { redirectTo: safeCallbackPath(callbackUrl) };
  if (trocarConta) {
    // Força o seletor de contas do Google, mesmo com uma conta já escolhida.
    await signIn("google", options, { prompt: "select_account" });
    return;
  }
  await signIn("google", options);
}

// Pública por definição: sair sem sessão não tem efeito. Sem confirmação, e
// encerra só este aparelho (sessão JWT, sem registro no servidor).
export async function sair(): Promise<void> {
  await signOut({ redirectTo: "/painel/entrar" });
}
