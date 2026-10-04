import "server-only";

import { redirect } from "next/navigation";

import { isAllowedEmail, normalizeEmail } from "./allowlist";
import { safeCallbackPath } from "./callback-path";
import { auth } from "./instance";

export type AdminSession = { email: string; name: string | null };

export class UnauthorizedError extends Error {
  constructor() {
    super("Não autorizado");
    this.name = "UnauthorizedError";
  }
}

// Reconfere a lista ATUAL a cada chamada: tirar um e-mail de ADMIN_EMAILS
// bloqueia no próximo acesso, mesmo com o cookie de sessão ainda válido.
export async function getAdminSession(): Promise<AdminSession | null> {
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email || !isAllowedEmail(email, process.env.ADMIN_EMAILS)) return null;
  const name = session?.user?.name;
  return { email, name: typeof name === "string" ? name : null };
}

export async function requireAdminPage(currentPath: string): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect(`/painel/entrar?callbackUrl=${encodeURIComponent(safeCallbackPath(currentPath))}`);
  }
  return session;
}

export async function requireAdminAction(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new UnauthorizedError();
  return session;
}
